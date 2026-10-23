param([string]$Root=(Join-Path $env:LOCALAPPDATA 'POSStore'))
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'Pos.Common.ps1')
$null=Get-PosSettings $Root
[IO.File]::WriteAllText((Join-Path $Root 'stop.request'),'operator requested stop')
$free=$false
for($i=0;$i -lt 100;$i++) {
  try{$lock=New-Object IO.FileStream((Join-Path $Root 'supervisor.lock'),[IO.FileMode]::OpenOrCreate,[IO.FileAccess]::ReadWrite,[IO.FileShare]::None);$lock.Dispose();$free=$true;break}catch{Start-Sleep -Seconds 1}
}
if(-not $free){throw 'Supervisor ainda ativo. Confira trabalhos pendentes antes de interromper manualmente.'}
$null=Invoke-PosCompose $Root @('stop')
Write-Host 'POS parado; dados e volumes preservados. Use Start-POS.ps1 -Resume para iniciar.'
