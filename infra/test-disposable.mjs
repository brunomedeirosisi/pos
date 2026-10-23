import { spawn } from 'node:child_process';
import { access, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
const root = fileURLToPath(new URL('../', import.meta.url));
const dockerTests = process.argv.includes('--docker');
const npmCli =
  process.env.NPM_CLI ??
  process.env.npm_execpath ??
  path.join(path.dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js');
if (!dockerTests)
  await access(npmCli).catch(() => {
    throw new Error('npm CLI not found; set NPM_CLI to npm/bin/npm-cli.js or use --docker');
  });
const composeArgs = [
  'compose',
  '-p',
  'pos-phase0-tests',
  '-f',
  path.join(root, 'infra/docker-compose.test.yml'),
];
if (dockerTests)
  composeArgs.push(
    '-f',
    path.join(root, 'infra/docker-compose.test-runners.yml'),
    '--profile',
    'runners',
  );
function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const { capture, input, ...spawnOptions } = options;
    const child = spawn(command, args, {
      cwd: root,
      windowsHide: true,
      stdio: [input ? 'pipe' : 'inherit', capture ? 'pipe' : 'inherit', 'inherit'],
      ...spawnOptions,
    });
    if (input) child.stdin.end(input);
    let output = '';
    child.stdout?.on('data', (chunk) => {
      output += String(chunk);
    });
    child.once('error', reject);
    child.once('close', (code) =>
      code === 0 ? resolve(output.trim()) : reject(new Error(command + ' exited ' + code)),
    );
  });
}
const compose = (args, options) => run('docker', [...composeArgs, ...args], options);
async function port(service, containerPort) {
  const binding = await compose(['port', service, String(containerPort)], { capture: true });
  if (!/^127\.0\.0\.1:\d+$/.test(binding))
    throw new Error('Unexpected non-loopback test binding: ' + binding);
  return binding.split(':')[1];
}
if (process.argv.includes('--backups') && !process.argv.includes('--images'))
  throw new Error('--backups requires --images');
try {
  await compose(['--profile', 'images', 'down', '--volumes', '--remove-orphans']);
  if (process.argv.includes('--seeds'))
    await run(process.execPath, [path.join(root, 'infra/check-seeds-disposable.mjs')]);
  await compose(['up', '-d', '--wait', 'db', 'redis']);
  if (dockerTests) {
    const services = ['backend-tests', 'frontend-tests', 'agent-tests'];
    await compose(['build', ...services]);
    const failures = [];
    for (const service of services) {
      try {
        await compose(['run', '--rm', '--no-deps', service]);
      } catch {
        failures.push(service);
      }
    }
    assert.deepEqual(failures, [], 'Docker workspace checks failed');
  } else {
    const env = {
      ...process.env,
      TEST_POSTGRES_PORT: await port('db', 5432),
      TEST_REDIS_PORT: await port('redis', 6379),
    };
    for (const script of ['test:integration', 'test:regression'])
      await run(process.execPath, [npmCli, 'run', script], {
        cwd: path.join(root, 'backend'),
        env,
      });
  }
  if (process.argv.includes('--images')) {
    await compose(['--profile', 'images', 'build', 'api', 'frontend']);
    await compose(['--profile', 'images', 'up', '-d', '--wait', 'api', 'frontend']);
    const base = 'http://127.0.0.1:' + (await port('api', 8080));
    const request = (url, options = {}) =>
      fetch(base + url, { ...options, signal: AbortSignal.timeout(5000) });
    assert.equal((await request('/api/v1/health')).status, 200);
    assert.equal((await request('/api/v1/metrics')).status, 401);
    assert.equal(
      (
        await request('/api/v1/metrics', {
          headers: { 'x-metrics-token': 'synthetic_metrics_key_for_disposable_tests_2026' },
        })
      ).status,
      200,
    );
    const login = await request('/api/v1/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: 'phase0@example.test',
        password: 'synthetic_admin_password_only_2026',
      }),
    });
    assert.equal(login.status, 200);
    assert.equal((await login.clone().json()).token, undefined);
    const cookie = login.headers.get('set-cookie')?.split(';')[0];
    assert.ok(cookie);
    assert.equal((await request('/api/v1/auth/me', { headers: { cookie } })).status, 200);
    assert.equal(
      (await request('/api/v1/auth/logout', { method: 'POST', headers: { cookie } })).status,
      204,
    );
    assert.equal((await request('/api/v1/auth/me', { headers: { cookie } })).status, 401);
    const web = await fetch(
      'http://127.0.0.1:' + (await port('frontend', 8080)) + '/catalog/products',
      { signal: AbortSignal.timeout(5000) },
    );
    assert.equal(web.status, 200);
    assert.match(await web.text(), /<div id="root"><\/div>/);
    if (process.argv.includes('--backups')) {
      const script = await readFile(path.join(root, 'infra/backup-image-check.mjs'), 'utf8');
      await compose(['exec', '-T', 'api', 'node', '--input-type=module', '-'], { input: script });
      await compose(['up', '-d', '--no-deps', '--force-recreate', '--wait', 'api']);
      const evidence = await compose(
        ['exec', '-T', 'api', 'node', '--input-type=module', '-', '--verify-persistence'],
        { input: script, capture: true },
      );
      const parsed = JSON.parse(evidence.split(/\r?\n/).filter(Boolean).at(-1));
      if (process.env.BACKUP_TEST_EVIDENCE_PATH)
        await writeFile(
          process.env.BACKUP_TEST_EVIDENCE_PATH,
          JSON.stringify(parsed, null, 2) + '\n',
        );
      console.log('Backup image checks passed, including real restore and API recreation.');
    }
    console.log('Image smoke passed: API, metrics, login, session revocation and SPA fallback.');
  }
} catch (error) {
  await compose(['--profile', 'images', 'logs', '--tail', '60', 'api']).catch(() => {});
  throw error;
} finally {
  // Fixed test project with synthetic tmpfs data only; the application project is never selected.
  await compose(['--profile', 'images', 'down', '--volumes', '--remove-orphans']);
}
