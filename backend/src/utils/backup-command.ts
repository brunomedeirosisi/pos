import { spawn } from 'node:child_process';

export type BackupCommandOptions = { timeoutMs: number; signal?: AbortSignal };
/** No shell, no credentials in arguments, bounded output; wait for stdio to close. */
export function runBackupCommand(
  command: string,
  args: string[],
  environment: NodeJS.ProcessEnv,
  options: BackupCommandOptions,
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    if (options.signal?.aborted) {
      reject(new Error('backup_operation_cancelled'));
      return;
    }
    const child = spawn(command, args, {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, ...environment },
    });
    let stdout = '',
      stderr = '',
      timedOut = false,
      cancelled = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, options.timeoutMs);
    const abort = () => {
      cancelled = true;
      child.kill('SIGKILL');
    };
    options.signal?.addEventListener('abort', abort, { once: true });
    const cleanup = () => {
      clearTimeout(timer);
      options.signal?.removeEventListener('abort', abort);
    };
    child.stdout.on('data', (chunk) => {
      stdout = (stdout + String(chunk)).slice(-8192);
    });
    child.stderr.on('data', (chunk) => {
      stderr = (stderr + String(chunk)).slice(-8192);
    });
    child.once('error', (error) => {
      cleanup();
      reject(error);
    });
    child.once('close', (code) => {
      cleanup();
      if (cancelled) reject(new Error('backup_operation_cancelled'));
      else if (timedOut)
        reject(new Error(command + ' timed out after ' + options.timeoutMs + 'ms'));
      else if (code !== 0)
        reject(new Error(stderr.trim() || command + ' exited with code ' + code));
      else resolve({ stdout, stderr });
    });
    if (options.signal?.aborted) abort();
  });
}
