param([string]$Root=(Join-Path $env:LOCALAPPDATA 'POSStore'),[switch]$RemoveTrust)
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'Pos.Common.ps1')
$settings=Get-PosSettings $Root
& (Join-Path $PSScriptRoot 'Parar-POS.ps1') -Root $Root
$startup=Join-Path ([Environment]::GetFolderPath('Startup')) 'POS Principal.lnk'
Remove-Item -LiteralPath $startup -Force -ErrorAction SilentlyContinue
$helper=Join-Path $PSScriptRoot 'Firewall-POS.ps1'
$arguments=@('-NoProfile','-ExecutionPolicy','Bypass','-File',$helper,'-Address',$settings.serverIp,'-Project',$settings.project,'-Remove')
$process=Start-Process -FilePath (Get-PosPowerShell) -ArgumentList (($arguments|ForEach-Object{ConvertTo-PosArgument $_}) -join ' ') -Verb RunAs -WindowStyle Hidden -PassThru -Wait
if($process.ExitCode -ne 0){throw 'A regra de firewall nao foi removida.'}
if($RemoveTrust -and $settings.certificateThumbprint -match '^[a-fA-F0-9]{40}$') { Remove-Item -LiteralPath ('Cert:\CurrentUser\Root\'+$settings.certificateThumbprint) -Force }
Write-Host 'POS desativado. Banco, volumes, backups e credenciais foram preservados. Nenhum down --volumes foi executado.'
