import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, readFile, writeFile, cp, readdir, rm } from 'node:fs/promises';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const source = path.dirname(fileURLToPath(import.meta.url));
const bundleArg = process.argv.indexOf('--bundle');
assert.ok(bundleArg > 0 && process.argv[bundleArg + 1], 'Use --bundle artifacts/POS-Loja-<version>');
const bundle = path.resolve(process.argv[bundleArg + 1]);
const manifest = JSON.parse(await readFile(path.join(bundle, 'manifest.json'), 'utf8'));
assert.equal(manifest.mode, 'Principal');
const upgradeIndex=process.argv.indexOf('--upgrade-from');
const upgradeBundle=upgradeIndex>0?path.resolve(process.argv[upgradeIndex+1]):null;
const previous=upgradeBundle?JSON.parse(await readFile(path.join(upgradeBundle,'manifest.json'),'utf8')):null;
if(previous){
  assert.equal(previous.mode,'Principal');assert.ok(manifest.compatibleFrom.includes(previous.version));
  for(const key of ['db','redis','proxy'])assert.equal(previous.images[key],manifest.images[key],'Infrastructure images must match for this upgrade rehearsal');
}
const temporary = await mkdtemp(path.join(os.tmpdir(), 'pos-store-smoke-'));
const replica = path.join(temporary, 'replica');
await mkdir(replica);
for (const name of ['store.compose.yml', 'Caddyfile', 'init.sql', 'empty.env']) await cp(path.join(bundle, name), path.join(temporary, name));
// A genuine upgrade must initialize the old database with the old release SQL.
if (previous) await cp(path.join(upgradeBundle, 'init.sql'), path.join(temporary, 'init.sql'));
// Move the release subnet as a whole, preserving its allocation policy and trusted proxy.
const composeFile = path.join(temporary, 'store.compose.yml');
await writeFile(composeFile, (await readFile(composeFile, 'utf8')).replaceAll('172.29.73.', '172.29.74.'));
// Dedicated project and loopback publication: never select the developer/store project.
const project = 'pos-installer-smoke';
const override = path.join(temporary, 'test.compose.yml');
// Only publication is overridden; network allocation still comes from the release.
await writeFile(override, 'services:\n  proxy:\n    ports: !override\n      - "127.0.0.1::443"\n  api:\n    environment:\n      PRINT_QUEUE_LEASE_SECONDS: 600\n');
const secret = () => randomBytes(32).toString('hex');
const agentToken = secret();
const storeId = randomUUID();
const env = {
  ...process.env, STORE_IP: '127.0.0.1', STORE_ID: storeId, POSTGRES_PASSWORD: secret(), JWT_SECRET: secret(), METRICS_TOKEN: secret(),
  PRINT_AGENT_TOKEN_SHA256: createHash('sha256').update(agentToken).digest('hex'), PRINT_PRINTER_NAME: 'Synthetic printer (no physical output)',
  COMPANY_NAME: 'Synthetic $Store & "two tills"', COMPANY_ADDRESS: 'Synthetic address', COMPANY_TAX_ID: 'Synthetic ID',
  BACKUP_DESTINATION: replica, BOOTSTRAP_ADMIN_EMAIL: 'installer@example.test', BOOTSTRAP_ADMIN_PASSWORD: secret(), BOOTSTRAP_ADMIN_FULL_NAME: 'Synthetic Installer Admin',
  API_IMAGE: manifest.images.api, FRONTEND_IMAGE: manifest.images.frontend, DB_IMAGE: manifest.images.db, REDIS_IMAGE: manifest.images.redis, PROXY_IMAGE: manifest.images.proxy,
};
function run(file, args, extra = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(file, args, { cwd: temporary, env, timeout: 600000, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], ...extra });
    let output = '', errors = '';
    child.stdout.on('data', chunk => { output += chunk; }); child.stderr.on('data', chunk => { errors += chunk; });
    child.once('error', reject);
    child.once('close', code => code === 0 ? resolve(output.trim()) : reject(new Error(file + ' exited ' + code + '\n' + errors.slice(-6000) + '\n' + output.slice(-3000))));
  });
}
const compose = args => run('docker', ['compose', '-p', project, '--env-file', path.join(temporary, 'empty.env'), '-f', path.join(temporary, 'store.compose.yml'), '-f', override, ...args]);
const childScript = path.join(source, 'test-store-client.mjs');
let evidence;
try {
  await compose(['down', '--volumes', '--remove-orphans']);
  console.log('Checking release images and starting isolated store...');
  if (!process.argv.includes('--reuse-images')) await run('docker', ['load', '--input', path.join(bundle, 'images.tar')]);
  for (const id of Object.values(manifest.images)) assert.equal(await run('docker', ['image', 'inspect', id, '--format', '{{.Id}}']), id);
  if(previous){
    if(!process.argv.includes('--reuse-images'))await run('docker',['load','--input',path.join(upgradeBundle,'images.tar')]);
    for(const id of Object.values(previous.images))assert.equal(await run('docker',['image','inspect',id,'--format','{{.Id}}']),id);
    env.API_IMAGE=previous.images.api;env.FRONTEND_IMAGE=previous.images.frontend;
  }
  await compose(['up', '-d', '--wait', '--wait-timeout', '180', '--pull', 'never']);
  const binding = await compose(['port', 'proxy', '443']);
  assert.match(binding, /^127\.0\.0\.1:\d+$/);
  const ca = path.join(temporary, 'root.crt');
  await compose(['cp', 'proxy:/data/caddy/pki/authorities/local/root.crt', ca]);
  const childEnv = { ...env, NODE_EXTRA_CA_CERTS: ca, POS_SMOKE_URL: 'https://' + binding, POS_SMOKE_AGENT_TOKEN: agentToken, POS_SMOKE_DIRECTORY: temporary, POS_SMOKE_AGENT_MODULE: path.join(bundle, 'agent', 'pull-agent.mjs') };
  let upgradeEvidence={};
  if(previous){
    const upgradeScript=path.join(source,'test-upgrade-client.mjs');
    await run(process.execPath,[upgradeScript,'--before'],{env:childEnv,timeout:60000});
    const oldSchema = await compose(['exec','-T','db','psql','-U','pos','-d','posdb','-At','-c',"select to_regclass('public.product_legacy_stock') is null and not exists (select 1 from information_schema.columns where table_schema='public' and table_name='product' and column_name='stock_version')"]);
    assert.equal(oldSchema,'t','Upgrade fixture already contains the new release schema');
    await compose(['exec','-T','api','node','dist/scripts/store-backup.js']);
    const contentSql="select id||':'||request_id||':'||encode(digest(content,'sha256'),'hex') from print_job order by id";
    const contentBefore=await compose(['exec','-T','db','psql','-U','pos','-d','posdb','-At','-c',contentSql]);
    const stockSql="select id||':'||product_id||':'||type||':'||quantity from stock_movement order by id";
    const stockBefore=await compose(['exec','-T','db','psql','-U','pos','-d','posdb','-At','-c',stockSql]);
    console.log('Historical jobs prepared on previous API. Recreating services with the new release...');
    await compose(['stop','api','frontend']);
    env.API_IMAGE=manifest.images.api;env.FRONTEND_IMAGE=manifest.images.frontend;
    await compose(['up','-d','--no-deps','--force-recreate','--wait','--wait-timeout','180','--pull','never','api','frontend']);
    const contentAfter=await compose(['exec','-T','db','psql','-U','pos','-d','posdb','-At','-c',contentSql]);
    assert.equal(contentAfter,contentBefore,'Migration changed historical request IDs or receipt snapshots');
    assert.equal(await compose(['exec','-T','db','psql','-U','pos','-d','posdb','-At','-c',stockSql]),stockBefore,'Migration changed historical stock movements');
    upgradeEvidence=JSON.parse((await run(process.execPath,[upgradeScript,'--after'],{env:childEnv,timeout:60000})).split(/\r?\n/).at(-1));
    upgradeEvidence.legacyReceiptContentPreserved=true;
    upgradeEvidence.previousReleaseSchemaUsed=true;
    upgradeEvidence.preUpgradeReplicatedBackup=true;
    upgradeEvidence.legacyStockMovementsPreserved=true;
    childEnv.POS_SMOKE_UPGRADED='true';
  }
  const migrations = await compose(['exec','-T','db','psql','-U','pos','-d','posdb','-At','-c',"select filename from schema_migrations order by filename"]);
  for (const name of ['20261029_001_payment_cancellation.sql','20261029_002_legacy_customer_balances.sql','20261029_003_user_sellers.sql','20261030_001_pagination.sql','20261030_002_sale_customer_balance.sql','20261106_001_legacy_product_stock.sql','20261107_001_manual_stock_adjustments.sql']) assert.ok(migrations.split(/\r?\n/).includes(name),'Missing release migration: '+name);
  assert.equal(await compose(['exec','-T','db','psql','-U','pos','-d','posdb','-At','-c',"select permissions @> '[\"stock:adjust\"]'::jsonb from app_role where name='manager'"]),'t');
  assert.equal(await compose(['exec','-T','db','psql','-U','pos','-d','posdb','-At','-c',"select count(*) from pg_trigger where not tgisinternal and tgname in ('stock_movement_version','legacy_stock_version','manual_stock_audit_immutable','manual_stock_audit_no_truncate')"]),'4');
  assert.match(await compose(['exec','-T','api','7zz','i']),/7-Zip/);
  const first = JSON.parse((await run(process.execPath, [childScript], { env: childEnv, timeout: 60000 })).split(/\r?\n/).at(-1));
  console.log('Two HTTPS sessions and outbound queue passed. Creating replicated backup...');
  await compose(['exec', '-T', 'api', 'node', 'dist/scripts/store-backup.js', '--check']);
  await compose(['exec', '-T', 'api', 'node', 'dist/scripts/store-backup.js']);
  // Advance only the disposable store's due time; let the real API scheduler run.
  await compose(['exec','-T','db','psql','-U','pos','-d','posdb','-c',"update pos_recovery.backup_schedule set next_run_at=now()-interval '1 minute' where singleton and enabled"]);
  let automaticRuns = '0';
  for (let attempt=0; attempt<30 && automaticRuns==='0'; attempt++) {
    await new Promise(resolve=>setTimeout(resolve,1000));
    automaticRuns=await compose(['exec','-T','db','psql','-U','pos','-d','posdb','-At','-c',"select count(*) from pos_recovery.backup_run where status='completed'"]);
  }
  assert.equal(automaticRuns,'1','The release API did not complete exactly one scheduled backup');
  const replicas = (await readdir(replica)).filter(name => name.endsWith('.zip'));
  assert.equal(replicas.length, previous ? 3 : 2);
  const replicaHashes = {};
  for (const name of replicas) {
    replicaHashes[name] = createHash('sha256').update(await readFile(path.join(replica, name))).digest('hex');
    const primaryHash = await compose(['exec', '-T', 'api', 'sha256sum', '/var/backups/pos/' + name]);
    assert.equal(primaryHash.split(/\s+/)[0], replicaHashes[name]);
  }
  env.BOOTSTRAP_ADMIN_EMAIL = ''; env.BOOTSTRAP_ADMIN_PASSWORD = ''; env.BOOTSTRAP_ADMIN_FULL_NAME = '';
  await compose(['up', '-d', '--no-deps', '--force-recreate', '--wait', '--wait-timeout', '180', '--pull', 'never', 'api']);
  const second = JSON.parse((await run(process.execPath, [childScript, '--verify'], { env: childEnv, timeout: 60000 })).split(/\r?\n/).at(-1));
  const apiEnv = await compose(['exec', '-T', 'api', 'node', '-e', 'console.log(Boolean(process.env.BOOTSTRAP_ADMIN_PASSWORD))']);
  assert.equal(apiEnv, 'false');
  evidence = { version: manifest.version, atUtc: new Date().toISOString(), project, images: manifest.images, imagesLoadedFromArchive: !process.argv.includes('--reuse-images'), ...first, ...second, upgradeFrom: previous?.version ?? null, ...upgradeEvidence, releaseMigrationsApplied: true, bundledArchiveDecoder: true, automaticBackupReplicated: true, replicatedBackup: true, replicaHashes, bootstrapRemoved: true, physicalPrinting: 'simulated', windowsGlobalChanges: false, passed: true };
  const evidenceArg = process.argv.indexOf('--evidence');
  if (evidenceArg > 0) await writeFile(path.resolve(process.argv[evidenceArg + 1]), JSON.stringify(evidence, null, 2) + '\n');
  console.log(JSON.stringify(evidence));
} catch (error) {
  console.error(await compose(['logs', '--tail', '40', 'api', 'proxy']).catch(() => 'logs unavailable'));
  throw error;
} finally {
  await compose(['down', '--volumes', '--remove-orphans']);
  assert.ok(path.dirname(temporary) === os.tmpdir() && path.basename(temporary).startsWith('pos-store-smoke-'));
  await rm(temporary, { recursive: true, force: true });
}
