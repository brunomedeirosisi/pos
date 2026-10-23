// Exercise the real ESLint CLI through stdin; canary code is never written or executed.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const args = process.argv.slice(2);
assert.equal(args.length, 2, 'Use npm run lint:rules in backend or frontend');
assert.equal(args[0], '--workspace');
const workspace = args[1];
assert.ok(['backend', 'frontend'].includes(workspace), 'Unsupported workspace');
assert.ok(process.env.npm_execpath, 'Run this gate through npm run lint:rules');
const cwd = path.join(root, workspace);
const filename = workspace === 'backend' ? 'src/server.ts' : 'src/main.tsx';
const eslint = path.join(cwd, 'node_modules/eslint/bin/eslint.js');
const fixtures = [
  {
    name: 'ignored-promise',
    rule: '@typescript-eslint/no-floating-promises',
    code: 'export function canary() { Promise.resolve(1); }',
  },
  {
    name: 'unused-variable',
    rule: '@typescript-eslint/no-unused-vars',
    code: 'export function canary() { const discarded = 1; return 0; }',
  },
  {
    name: 'constant-branch',
    rule: 'no-constant-condition',
    code: 'export function canary() { if (true) return 1; return 0; }',
  },
  {
    name: 'debugger',
    rule: 'no-debugger',
    code: 'export function canary() { debugger; return 1; }',
  },
  {
    name: 'handled-promise',
    code: 'export async function canary() { await Promise.resolve(1); return 1; }',
  },
  // Explicit detachment is the documented policy; void is not a rejection handler.
  { name: 'explicit-detachment', code: 'export function canary() { void Promise.resolve(1); }' },
];
if (workspace === 'frontend') {
  fixtures.push(
    {
      name: 'conditional-hook',
      rule: 'react-hooks/rules-of-hooks',
      code: "import { useState } from 'react'; export function Canary({ enabled }: { enabled: boolean }) { if (enabled) useState(0); return null; }",
    },
    {
      name: 'unconditional-hook',
      code: "import { useState } from 'react'; export function Canary({ enabled }: { enabled: boolean }) { const [value] = useState(0); if (!enabled) return null; return value; }",
    },
  );
}
const checks = [];
for (const fixture of fixtures) {
  const result = spawnSync(
    process.execPath,
    [eslint, '--stdin', '--stdin-filename', filename, '--format', 'json', '--max-warnings', '0'],
    {
      // Watch-program mode uses the stdin contents for type information instead
      // of the on-disk entry point at the same path. Production lint is unchanged.
      cwd,
      input: fixture.code,
      env: { ...process.env, TSESTREE_SINGLE_RUN: 'false' },
      encoding: 'utf8',
      windowsHide: true,
      timeout: 30000,
    },
  );
  if (result.error) throw result.error;
  assert.equal(
    result.status,
    fixture.rule ? 1 : 0,
    `${workspace}/${fixture.name}: unexpected CLI result: ${result.stderr || result.stdout}`,
  );
  const messages = JSON.parse(result.stdout).flatMap((entry) => entry.messages);
  assert.ok(
    !messages.some((message) => message.fatal),
    `${fixture.name}: parser failure is not proof of rule enforcement`,
  );
  if (fixture.rule)
    assert.ok(
      messages.some((message) => message.ruleId === fixture.rule && message.severity === 2),
      `${fixture.name}: expected rule was not enforced`,
    );
  else assert.equal(messages.length, 0, `${fixture.name}: valid control rejected`);
  checks.push({ name: fixture.name, exitCode: result.status, rule: fixture.rule ?? null });
}

// Invoke the actual test script, so adding passWithNoTests to that script breaks this check.
const empty = spawnSync(
  process.execPath,
  [process.env.npm_execpath, 'test', '--', '--exclude', '**/*'],
  {
    cwd,
    encoding: 'utf8',
    windowsHide: true,
    timeout: 30000,
  },
);
if (empty.error) throw empty.error;
assert.equal(empty.status, 1, `${workspace}: an empty test selection must fail`);
assert.match(
  empty.stdout + empty.stderr,
  /No test files found/i,
  'Failure must come from an empty selection, not a broken toolchain',
);
console.log(JSON.stringify({ workspace, checks, emptyTestSelectionExitCode: empty.status }));
