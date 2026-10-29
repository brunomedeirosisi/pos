param([string]$Root=(Join-Path $env:LOCALAPPDATA 'POSTerminal'))
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'Pos.Common.ps1')
. (Join-Path $PSScriptRoot 'Pos.Terminal.ps1')
$state=Get-PosTerminalSettings $Root
Write-Host ('Loja: '+$state.storeId+' | versao: '+$state.version+' | estado: '+$state.status)
$connectionMode='lan'
if(($state.PSObject.Properties.Name -contains 'connectionMode') -and $state.connectionMode -eq 'cloud'){$connectionMode='cloud';Test-PosCloudStore $state.serverUrl $state.storeId $state.withPrinter}
else{Test-PosStore $state.serverUrl $state.storeId}
if($state.withPrinter){
  $credential=Read-PosSecret (Join-Path $Root 'terminal-agent.bin')
  $status=Invoke-PosTerminalApi $state.serverUrl '/status' $null @{'x-print-agent-token'=$credential.token;'x-print-printer-id'=$state.printerId} $connectionMode
  $status|ConvertTo-Json -Depth 4|Write-Host
}
if(Test-Path -LiteralPath (Join-Path $Root 'runtime-status.json')){Get-Content -LiteralPath (Join-Path $Root 'runtime-status.json') -Encoding UTF8|Write-Host}
Write-Host 'Nenhum codigo/token foi incluido. Aceitacao pelo Windows nao confirma saida fisica.'
