import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const args = [
  'compose',
  '-p',
  'pos-seed-tests',
  '-f',
  path.join(root, 'infra/docker-compose.test.yml'),
];
function run(parameters, { input, expectFailure = false } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn('docker', [...args, ...parameters], {
      cwd: root,
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '',
      stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk);
    });
    child.stdin.on('error', () => {});
    child.stdin.end(input);
    child.once('error', reject);
    child.once('close', (code) => {
      if (expectFailure ? code !== 0 : code === 0) resolve({ stdout: stdout.trim(), stderr, code });
      else reject(new Error('Seed Docker command returned ' + code + ': ' + stderr));
    });
  });
}
function sql(input, database = 'pos_phase0_test', expectFailure = false) {
  return run(
    [
      'exec',
      '-T',
      'db',
      'psql',
      '-X',
      '-qAt',
      '-v',
      'ON_ERROR_STOP=1',
      '-U',
      'pos_test',
      '-d',
      database,
    ],
    { input, expectFailure },
  );
}
const summarySql = `select json_build_object(
  'sales', (select count(*) from sale),
  'items', (select count(*) from sale_item),
  'payments', (select count(*) from customer_payment),
  'inconsistentSales', (select count(*) from sale s where
    s.subtotal is distinct from (select sum(si.total) from sale_item si where si.sale_id=s.id)
    or s.total is distinct from s.subtotal-s.discount
    or s.change_amount is distinct from greatest(coalesce(s.amount_paid,0)-s.total,0)
    or (coalesce(s.amount_paid,0)<s.total and s.customer_id is null)),
  'outstanding', (select sum(total-coalesce(amount_paid,0)+change_amount) from sale)-(select coalesce(sum(amount),0) from customer_payment)
);`;
const results = [];
let cleanup = false;
try {
  for (const fixture of [
    { file: 'infra/performance/seed.sql', payments: 0, outstanding: 0, repeatable: false },
    {
      file: 'backend/sql/benchmarks/phase4_seed.sql',
      payments: 180000,
      outstanding: 1800000,
      repeatable: true,
    },
  ]) {
    await run(['down', '--volumes', '--remove-orphans']);
    await run(['up', '-d', '--wait', 'db']);
    const seed = await readFile(path.join(root, fixture.file), 'utf8');
    const wrongDb = await sql(seed, 'postgres', true);
    assert.match(wrongDb.stderr, /Synthetic.*benchmark database required/i);
    await sql(seed);
    const first = JSON.parse((await sql(summarySql)).stdout);
    assert.deepEqual(first, {
      sales: 120000,
      items: 360000,
      payments: fixture.payments,
      inconsistentSales: 0,
      outstanding: fixture.outstanding,
    });
    if (fixture.repeatable) {
      await sql(seed);
      assert.deepEqual(JSON.parse((await sql(summarySql)).stdout), first);
    } else {
      const repeated = await sql(seed, 'pos_phase0_test', true);
      assert.match(repeated.stderr, /fresh empty core tables/);
      assert.deepEqual(JSON.parse((await sql(summarySql)).stdout), first);
    }
    results.push({
      file: fixture.file,
      ...first,
      wrongDatabaseRejected: true,
      repeatedSeed: fixture.repeatable
        ? 'same counts and monetary invariants'
        : 'rejected without changing rows',
    });
    console.log('Seed checks passed: ' + fixture.file);
  }
} finally {
  await run(['down', '--volumes', '--remove-orphans']);
  cleanup = true;
}
const evidence = { syntheticOnly: true, project: 'pos-seed-tests', results, cleanup };
if (process.env.SEED_TEST_EVIDENCE_PATH)
  await writeFile(process.env.SEED_TEST_EVIDENCE_PATH, JSON.stringify(evidence, null, 2) + '\n');
console.log(JSON.stringify(evidence));
