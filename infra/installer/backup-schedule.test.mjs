import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = name => readFile(new URL(name,import.meta.url),'utf8');
test('Windows supervisor cannot dispatch backups independently of the backend schedule',async()=>{
  const script=await source('Start-POS.ps1');
  assert.doesNotMatch(script,/store-backup\.js|lastSuccessUtc|TotalHours\s+-ge\s+24/);
});
test('supervisor continues starting Docker and supervising the print agent',async()=>{
  const script=await source('Start-POS.ps1');
  assert.match(script,/Invoke-PosCompose[^\r\n]+up/);
  assert.match(script,/pull-agent\.mjs/);assert.match(script,/supervisor\.lock/);
});
test('installation and upgrades still create their required system backups',async()=>{
  assert.match(await source('Pos.Install.ps1'),/store-backup\.js/);
  assert.match(await source('Atualizar-POS.ps1'),/store-backup\.js/);
});
test('explicit diagnostic backup remains available when daily scheduling is off',async()=>{
  assert.match(await source('Diagnosticar-POS.ps1'),/if\s*\(\$BackupNow\)\s*\{[^\r\n]*store-backup\.js/);
});
