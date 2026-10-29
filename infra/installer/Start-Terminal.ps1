param([string]$Root=(Join-Path $env:LOCALAPPDATA 'POSTerminal'),[switch]$Resume)
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'Pos.Common.ps1')
. (Join-Path $PSScriptRoot 'Pos.Terminal.ps1')
$state=Get-PosTerminalSettings $Root
if(-not $state.withPrinter -or $state.status -ne 'ready'){throw 'Terminal com impressora ainda nao esta pronto.'}
$stopFile=Join-Path $Root 'stop.request'
if($Resume){Remove-Item -LiteralPath $stopFile -Force -ErrorAction SilentlyContinue}
if(Test-Path -LiteralPath $stopFile){exit 0}
try{$lock=New-Object IO.FileStream((Join-Path $Root 'supervisor.lock'),[IO.FileMode]::OpenOrCreate,[IO.FileAccess]::ReadWrite,[IO.FileShare]::None)}catch{exit 0}
$agent=$null
try {
  while(-not (Test-Path -LiteralPath $stopFile)){
    if($null -eq $agent -or $agent.HasExited){
      if($null -ne $agent){$agent.Dispose();Start-Sleep -Seconds 5}
      $release=Join-Path (Join-Path $Root 'versions') $state.version
      $null=Assert-PosBundle $release
      $credential=Read-PosSecret (Join-Path $Root 'terminal-agent.bin')
      if($credential.printerId -ne $state.printerId){throw 'Credencial e destino do Terminal divergem.'}
      $info=New-Object Diagnostics.ProcessStartInfo
      $info.FileName=Join-Path $release 'runtime\node.exe'
      $info.Arguments=ConvertTo-PosArgument (Join-Path $release 'agent\pull-agent.mjs')
      $info.UseShellExecute=$false;$info.CreateNoWindow=$true
      $info.EnvironmentVariables['POS_AGENT_CONFIG']=Join-Path $Root 'agent.json'
      $info.EnvironmentVariables['PRINT_AGENT_TOKEN']=$credential.token
      Set-PosTerminalTlsEnvironment $info $state $Root
      $agent=New-Object Diagnostics.Process;$agent.StartInfo=$info;$null=$agent.Start()
      Write-PosJson (Join-Path $Root 'runtime-status.json') @{state='running';atUtc=[DateTime]::UtcNow.ToString('o');printerId=$state.printerId;supervisorPid=$PID;agentPid=$agent.Id}
    }
    Start-Sleep -Seconds 2
  }
} catch {
  Write-PosJson (Join-Path $Root 'runtime-status.json') @{state='error';atUtc=[DateTime]::UtcNow.ToString('o');message='Abra Diagnosticar-Terminal na conta da instalacao.'}
  throw
} finally {
  if($null -ne $agent){
    if(-not $agent.HasExited){[IO.File]::WriteAllText($stopFile,'terminal supervisor stopped');if(-not $agent.WaitForExit(90000)){$agent.Kill()}}
    $agent.Dispose()
  }
  $lock.Dispose()
}
