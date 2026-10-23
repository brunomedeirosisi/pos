import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';

const app = express();
app.use(express.json());
const targetPrinter = process.env.PRINT_AGENT_TARGET_PRINTER || 'Epson LX-300+';
const printTimeoutMs = Number(process.env.PRINT_AGENT_JOB_TIMEOUT_MS || 15000);

type PrintJobPayload = {
  job_type?: string;
  printer_model?: string;
  mode?: string;
  copies?: number;
  locale?: string;
  receipt_code?: string;
  sale_id?: string;
  content?: string;
};

function escapePowerShell(value: string): string {
  return value.replace(/'/g, "''");
}

function runPowerShellPrint(filePath: string, copies: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const printerLiteral = escapePowerShell(targetPrinter);
    const fileLiteral = escapePowerShell(filePath);
    const script = `
$ErrorActionPreference = 'Stop'
1..${copies} | ForEach-Object {
  Get-Content -LiteralPath '${fileLiteral}' -Raw | Out-Printer -Name '${printerLiteral}'
}
`;

    const child = spawn('powershell', ['-NoProfile', '-NonInteractive', '-Command', script], {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stderr = '';
    let stdout = '';
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error(`print job timed out after ${printTimeoutMs}ms`));
    }, printTimeoutMs);

    child.stdout.on('data', (chunk) => {
      stdout += String(chunk);
    });

    child.stderr.on('data', (chunk) => {
      stderr += String(chunk);
    });

    child.on('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });

    child.on('close', (code) => {
      clearTimeout(timeout);
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(stderr.trim() || stdout.trim() || `powershell exited with code ${code}`));
    });
  });
}

async function printTextJob(content: string, copies: number): Promise<void> {
  if (process.platform !== 'win32') {
    throw new Error('local printing is currently implemented only for Windows hosts');
  }

  const tempFilePath = path.join(os.tmpdir(), `pos-receipt-${randomUUID()}.txt`);
  await fs.writeFile(tempFilePath, content, 'utf8');

  try {
    await runPowerShellPrint(tempFilePath, copies);
  } finally {
    await fs.rm(tempFilePath, { force: true }).catch(() => undefined);
  }
}

app.post('/print', async (req, res) => {
  const payload = (req.body ?? {}) as PrintJobPayload;

  if (typeof payload.content !== 'string' || payload.content.trim().length === 0) {
    res.status(400).json({ ok: false, message: 'missing receipt content' });
    return;
  }

  const copies = Number.isInteger(payload.copies) && (payload.copies ?? 0) > 0 ? Number(payload.copies) : 1;

  console.log('[agent] print job received:', {
    job_type: payload.job_type,
    printer_model: payload.printer_model ?? targetPrinter,
    mode: payload.mode,
    copies,
    locale: payload.locale,
    receipt_code: payload.receipt_code,
    sale_id: payload.sale_id,
  });

  try {
    await printTextJob(payload.content, copies);
    res.json({ ok: true, printer: targetPrinter, copies });
  } catch (error) {
    console.error('[agent] print failed:', error);
    res.status(503).json({
      ok: false,
      message: error instanceof Error ? error.message : 'print failed',
      printer: targetPrinter,
    });
  }
});

const port = 9222;
app.listen(port, '127.0.0.1', () => {
  console.log(`[agent] listening on http://127.0.0.1:${port}`);
});
