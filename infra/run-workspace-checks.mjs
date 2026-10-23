import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const workspace = path.basename(process.cwd());
assert.ok(['backend', 'frontend', 'agent'].includes(workspace), 'Run from a test workspace');
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const scripts = ['lint', 'lint:rules', 'typecheck', 'test'];
if (workspace === 'backend') scripts.push('test:integration', 'test:regression');
if (pkg.scripts.build) scripts.push('build');
const failures = [];
for (const script of scripts) {
  if (!pkg.scripts[script]) {
    assert.equal(workspace, 'agent', 'Required test script missing: ' + script);
    assert.ok(['lint', 'lint:rules'].includes(script));
    continue;
  }
  console.log('Running ' + workspace + ': ' + script);
  const result = spawnSync('npm', ['run', script], { stdio: 'inherit' });
  if (result.status !== 0) failures.push(script);
}
if (workspace === 'backend') {
  const result = spawnSync(
    process.execPath,
    ['--test', '../infra/performance/measurement.test.mjs'],
    { stdio: 'inherit' },
  );
  if (result.status !== 0) failures.push('measurement-controls');
}
console.log(JSON.stringify({ workspace, failures }));
process.exitCode = failures.length ? 1 : 0;
