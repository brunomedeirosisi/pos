import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
test('loopback agent rejects empty jobs without contacting a printer', { timeout: 15000 }, async () => {
  const cwd = fileURLToPath(new URL('../', import.meta.url));
  const child = spawn(process.execPath, ['node_modules/tsx/dist/cli.mjs', 'src/index.ts'], { cwd, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Agent did not start')), 10000);
      child.once('error', (error) => { clearTimeout(timer); reject(error); });
      child.once('exit', () => { clearTimeout(timer); reject(new Error('Agent exited before readiness (port 9222 may be busy)')); });
      child.stdout.on('data', (chunk) => { if (String(chunk).includes('listening on http://127.0.0.1:9222')) { clearTimeout(timer); resolve(); } });
    });
    const response = await fetch('http://127.0.0.1:9222/print', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ content: '' }), signal: AbortSignal.timeout(2000) });
    assert.equal(response.status, 400); assert.equal((await response.json()).message, 'missing receipt content');
  } finally { if (child.exitCode === null) { const closed = once(child, 'close'); child.kill(); await closed; } }
});
