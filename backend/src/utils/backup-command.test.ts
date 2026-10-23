import { describe, expect, it } from 'vitest';
import { runBackupCommand } from './backup-command.js';
describe('backup subprocess lifecycle', () => {
  it('captures bounded output after child streams close', async () => {
    const result = await runBackupCommand(
      process.execPath,
      ['-e', 'process.stdout.write("x".repeat(20000))'],
      {},
      { timeoutMs: 5000 },
    );
    expect(result.stdout).toHaveLength(8192);
  });
  it('rejects nonzero status and missing binaries', async () => {
    await expect(
      runBackupCommand(
        process.execPath,
        ['-e', 'process.stderr.write("synthetic failure");process.exitCode=2'],
        {},
        { timeoutMs: 5000 },
      ),
    ).rejects.toThrow('synthetic failure');
    await expect(
      runBackupCommand('pos-nonexistent-backup-tool', [], {}, { timeoutMs: 5000 }),
    ).rejects.toMatchObject({ code: 'ENOENT' });
  });
  it('terminates a child at the time budget', async () => {
    await expect(
      runBackupCommand(
        process.execPath,
        ['-e', 'setInterval(()=>{},1000)'],
        {},
        { timeoutMs: 100 },
      ),
    ).rejects.toThrow('timed out');
  });
  it('terminates a child when its lock is lost', async () => {
    const controller = new AbortController();
    const operation = runBackupCommand(
      process.execPath,
      ['-e', 'setInterval(()=>{},1000)'],
      {},
      { timeoutMs: 5000, signal: controller.signal },
    );
    const rejected = expect(operation).rejects.toThrow('backup_operation_cancelled');
    controller.abort();
    await rejected;
  });
});
