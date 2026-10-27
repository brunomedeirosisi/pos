param([string]$Root=(Join-Path $env:LOCALAPPDATA 'POSTerminal'),[switch]$DisableStartup)
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'Pos.Common.ps1')
. (Join-Path $PSScriptRoot 'Pos.Terminal.ps1')
$null=Get-PosTerminalSettings $Root
[IO.File]::WriteAllText((Join-Path $Root 'stop.request'),'operator requested stop')
$free=$false
for($i=0;$i -lt 100;$i++){
  try{$lock=New-Object IO.FileStream((Join-Path $Root 'supervisor.lock'),[IO.FileMode]::OpenOrCreate,[IO.FileAccess]::ReadWrite,[IO.FileShare]::None);$lock.Dispose();$free=$true;break}catch{Start-Sleep -Seconds 1}
}
if(-not $free){throw 'Agente ainda ativo. Confira a impressora antes de interromper manualmente.'}
if($DisableStartup){Remove-Item -LiteralPath (Join-Path ([Environment]::GetFolderPath('Startup')) 'POS Terminal Impressora.lnk') -Force -ErrorAction SilentlyContinue}
Write-Host 'Agente Terminal parado. Fila e journal preservados. Use Start-Terminal -Resume para retomar. Revogue a credencial na administracao para retirar o dispositivo.'
