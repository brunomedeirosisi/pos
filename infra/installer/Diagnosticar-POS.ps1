param([string]$Root=(Join-Path $env:LOCALAPPDATA 'POSStore'),[switch]$BackupNow)
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'Pos.Common.ps1')
$settings=Get-PosSettings $Root
Write-Host ('Loja: '+$settings.storeId+' | versao: '+$settings.version+' | estado: '+$settings.status)
Write-Host ('Acesso: '+$settings.serverUrl+' | impressora: '+$settings.printerName)
$null=Invoke-PosCompose $Root @('ps')
Test-PosStore $settings.serverUrl $settings.storeId
if($BackupNow){$null=Invoke-PosCompose $Root @('exec','-T','api','node','dist/scripts/store-backup.js');Write-PosJson (Join-Path $Root 'backup-status.json') @{ok=$true;lastSuccessUtc=[DateTime]::UtcNow.ToString('o');message='Backup manual e replica conferidos'}}
else{$null=Invoke-PosCompose $Root @('exec','-T','api','node','dist/scripts/store-backup.js','--check')}
if(Test-Path -LiteralPath (Join-Path $Root 'backup-status.json')){Get-Content -LiteralPath (Join-Path $Root 'backup-status.json') -Encoding UTF8 | Write-Host}
$secret=Read-PosSecret (Join-Path $Root 'secrets.bin')
$status=Invoke-RestMethod -Uri ($settings.serverUrl+'/api/v1/print-agent/status') -Headers @{'x-print-agent-token'=$secret.agent} -TimeoutSec 15
$status | ConvertTo-Json -Depth 4 | Write-Host
Write-Host 'Nenhuma senha/token foi incluido no diagnostico. Submissao ao spooler nao comprova saida fisica.'
