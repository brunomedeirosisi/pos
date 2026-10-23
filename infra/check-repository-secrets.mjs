import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = fileURLToPath(new URL('../', import.meta.url));

const files = execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8', windowsHide: true }).split('\0').filter(Boolean);
const failures = [];
for (const filename of files) {
  if (/(^|\/)\.env(?:\.|$)/.test(filename) && !filename.endsWith('.env.example')) {
    failures.push(`${filename}: local environment file must not be tracked`);
    continue;
  }
  const fullPath = path.join(root, filename);
  if (!existsSync(fullPath)) continue;
  const bytes = readFileSync(fullPath);
  if (bytes.includes(0)) continue;
  const text = bytes.toString('utf8');
  if (/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(text)) failures.push(`${filename}: private key`);
  if (/\bAKIA[0-9A-Z]{16}\b/.test(text)) failures.push(`${filename}: possible cloud credential`);
}
if (failures.length) {
  console.error(failures.join('\n'));
  process.exitCode = 1;
} else console.log('Repository secret checks passed; no credential values were printed.');
