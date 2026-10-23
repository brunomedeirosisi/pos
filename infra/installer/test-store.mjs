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
const temporary = await mkdtemp(path.join(os.tmpdir(), 'pos-store-smoke-'));
const replica = path.join(temporary, 'replica');
await mkdir(replica);
for (const name of ['store.compose.yml', 'Caddyfile', 'init.sql', 'empty.env']) await cp(path.join(bundle, name), path.join(temporary, name));
// Move the release subnet as a whole, preserving its allocation policy and trusted proxy.
const composeFile = path.join(temporary, 'store.compose.yml');
await writeFile(composeFile, (await readFile(composeFile, 'utf8')).replaceAll('172.29.73.', '172.29.74.'));
// Dedicated project and loopback publication: never select the developer/store project.
const project = 'pos-installer-smoke';
const override = path.join(temporary, 'test.compose.yml');
// Only publication is overridden; network allocation still comes from the release.
await writeFile(override, 'services:\n  proxy:\n    ports: !override\n      - "127.0.0.1::443"\n');
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
  await compose(['up', '-d', '--wait', '--wait-timeout', '180', '--pull', 'never']);
  const binding = await compose(['port', 'proxy', '443']);
  assert.match(binding, /^127\.0\.0\.1:\d+$/);
  const ca = path.join(temporary, 'root.crt');
  await compose(['cp', 'proxy:/data/caddy/pki/authorities/local/root.crt', ca]);
  const childEnv = { ...env, NODE_EXTRA_CA_CERTS: ca, POS_SMOKE_URL: 'https://' + binding, POS_SMOKE_AGENT_TOKEN: agentToken, POS_SMOKE_DIRECTORY: temporary, POS_SMOKE_AGENT_MODULE: path.join(bundle, 'agent', 'pull-agent.mjs') };
  const first = JSON.parse((await run(process.execPath, [childScript], { env: childEnv, timeout: 60000 })).split(/\r?\n/).at(-1));
  console.log('Two HTTPS sessions and outbound queue passed. Creating replicated backup...');
  await compose(['exec', '-T', 'api', 'node', 'dist/scripts/store-backup.js', '--check']);
  await compose(['exec', '-T', 'api', 'node', 'dist/scripts/store-backup.js']);
  const replicas = (await readdir(replica)).filter(name => name.endsWith('.zip'));
  assert.equal(replicas.length, 1);
  const replicaHash = createHash('sha256').update(await readFile(path.join(replica, replicas[0]))).digest('hex');
  const primaryHash = await compose(['exec', '-T', 'api', 'sha256sum', '/var/backups/pos/' + replicas[0]]);
  assert.equal(primaryHash.split(/\s+/)[0], replicaHash);
  env.BOOTSTRAP_ADMIN_EMAIL = ''; env.BOOTSTRAP_ADMIN_PASSWORD = ''; env.BOOTSTRAP_ADMIN_FULL_NAME = '';
  await compose(['up', '-d', '--no-deps', '--force-recreate', '--wait', '--wait-timeout', '180', '--pull', 'never', 'api']);
  const second = JSON.parse((await run(process.execPath, [childScript, '--verify'], { env: childEnv, timeout: 60000 })).split(/\r?\n/).at(-1));
  const apiEnv = await compose(['exec', '-T', 'api', 'node', '-e', 'console.log(Boolean(process.env.BOOTSTRAP_ADMIN_PASSWORD))']);
  assert.equal(apiEnv, 'false');
  evidence = { version: manifest.version, atUtc: new Date().toISOString(), project, images: manifest.images, imagesLoadedFromArchive: !process.argv.includes('--reuse-images'), ...first, ...second, replicatedBackup: true, replicaSha256: replicaHash, bootstrapRemoved: true, physicalPrinting: 'simulated', windowsGlobalChanges: false, passed: true };
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
