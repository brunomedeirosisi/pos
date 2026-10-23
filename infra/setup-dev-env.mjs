import { randomBytes } from 'node:crypto';
import { readFile, writeFile, access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const filename = path.join(root, '.env');
const rotateAuth = process.argv.includes('--rotate-auth');
let contents;
try {
  contents = await readFile(filename, 'utf8');
  if (!rotateAuth) throw new Error('.env already exists; use --rotate-auth to rotate only JWT/metrics secrets. Database credentials will be preserved.');
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
  contents = await readFile(path.join(root, '.env.example'), 'utf8');
  contents = contents.replace(/^POSTGRES_PASSWORD=.*$/m, `POSTGRES_PASSWORD=${randomBytes(32).toString('hex')}`);
}
const jwtSecret = randomBytes(48).toString('hex');
const metricsSecret = randomBytes(32).toString('hex');
function setValue(text, key, value) {
  const expression = new RegExp(`^${key}=.*$`, 'm');
  return expression.test(text) ? text.replace(expression, `${key}=${value}`) : `${text.trimEnd()}\n${key}=${value}\n`;
}
contents = setValue(setValue(contents, 'JWT_SECRET', jwtSecret), 'METRICS_TOKEN', metricsSecret);
await writeFile(filename, contents, { mode: 0o600 });
const backendEnv = path.join(root, 'backend/.env');
try {
  await access(backendEnv);
  await writeFile(backendEnv, setValue(setValue(await readFile(backendEnv, 'utf8'), 'JWT_SECRET', jwtSecret), 'METRICS_TOKEN', metricsSecret), { mode: 0o600 });
} catch (error) { if (error.code !== 'ENOENT') throw error; }
console.log('Development environment configured. JWT/metrics secrets were generated without displaying them.');
console.log('Existing database credentials were preserved. Use separate generated credentials for every new environment.');
