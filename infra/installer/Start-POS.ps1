param([string]$Root=(Join-Path $env:LOCALAPPDATA 'POSStore'),[switch]$Resume)
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'Pos.Install.ps1')
if(-not (Test-Path -LiteralPath (Join-Path $Root 'settings.json'))){throw 'Principal nao instalado.'}
$stopFile=Join-Path $Root 'stop.request'
if($Resume){Remove-Item -LiteralPath $stopFile -Force -ErrorAction SilentlyContinue}
if(Test-Path -LiteralPath $stopFile){exit 0}
try{$lock=New-Object IO.FileStream((Join-Path $Root 'supervisor.lock'),[IO.FileMode]::OpenOrCreate,[IO.FileAccess]::ReadWrite,[IO.FileShare]::None)}catch{exit 0}
$agent=$null
try {
  $settings=Get-PosSettings $Root
  if($settings.status -ne 'ready'){throw 'Instalacao/atualizacao pendente. Use o instalador para reparar ou o diagnostico.'}
  Prepare-PosDocker $false
  $null=Invoke-PosCompose $Root @('up','-d','--wait','--wait-timeout','180','--pull','never')
  $lastAttempt=[DateTime]::MinValue
  while(-not (Test-Path -LiteralPath $stopFile)) {
    if($null -eq $agent -or $agent.HasExited) {
      if($null -ne $agent){$agent.Dispose();Start-Sleep -Seconds 5}
      $settings=Get-PosSettings $Root
      $version=Join-Path (Join-Path $Root 'versions') $settings.version
      $secret=Read-PosSecret (Join-Path $Root 'secrets.bin')
      $info=New-Object Diagnostics.ProcessStartInfo
      $info.FileName=Join-Path $version 'runtime\node.exe'
      $info.Arguments=ConvertTo-PosArgument (Join-Path $version 'agent\pull-agent.mjs')
      $info.UseShellExecute=$false;$info.CreateNoWindow=$true
      $info.EnvironmentVariables['POS_AGENT_CONFIG']=Join-Path $Root 'agent.json'
      $info.EnvironmentVariables['PRINT_AGENT_TOKEN']=$secret.agent
      $info.EnvironmentVariables['NODE_EXTRA_CA_CERTS']=Join-Path $Root 'pki\root.crt'
      $agent=New-Object Diagnostics.Process;$agent.StartInfo=$info;$null=$agent.Start()
      Write-PosJson (Join-Path $Root 'runtime-status.json') @{state='running';atUtc=[DateTime]::UtcNow.ToString('o');supervisorPid=$PID;agentPid=$agent.Id}
    }
    $lastSuccess=[DateTime]::MinValue
    $backupFile=Join-Path $Root 'backup-status.json'
    if(Test-Path -LiteralPath $backupFile){$backup=Read-PosJson $backupFile;if($backup.lastSuccessUtc){$lastSuccess=[DateTime]::Parse($backup.lastSuccessUtc).ToUniversalTime()}}
    if(([DateTime]::UtcNow-$lastSuccess).TotalHours -ge 24 -and ([DateTime]::UtcNow-$lastAttempt).TotalHours -ge 1){
      $lastAttempt=[DateTime]::UtcNow
      try {
        $null=Invoke-PosCompose $Root @('exec','-T','api','node','dist/scripts/store-backup.js')
        Write-PosJson $backupFile @{ok=$true;lastSuccessUtc=[DateTime]::UtcNow.ToString('o');message='Backup e replica conferidos'}
      }catch{Write-PosJson $backupFile @{ok=$false;lastSuccessUtc=($lastSuccess.ToString('o'));message='Falha no backup. Abra Diagnosticar-POS e confira destino, espaco e Docker.'}}
    }
    Start-Sleep -Seconds 2
  }
} catch {
  Write-PosJson (Join-Path $Root 'runtime-status.json') @{state='error';atUtc=[DateTime]::UtcNow.ToString('o');message='Falha ao iniciar. Abra Diagnosticar-POS.'}
  throw
} finally {
  if($null -ne $agent){if(-not $agent.HasExited){if(-not $agent.WaitForExit(90000)){$agent.Kill()}};$agent.Dispose()}
  $lock.Dispose()
}
