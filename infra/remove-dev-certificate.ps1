[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$certificatePath = Join-Path $scriptDir 'caddy-local-root.crt'
$storeLocation = 'Cert:\CurrentUser\Root'

if (-not (Test-Path -LiteralPath $certificatePath)) {
  throw "certificate file not found at $certificatePath"
}

$certificate = New-Object System.Security.Cryptography.X509Certificates.X509Certificate2($certificatePath)
$thumbprint = $certificate.Thumbprint
$matches = Get-ChildItem -Path $storeLocation | Where-Object Thumbprint -eq $thumbprint

if (-not $matches) {
  Write-Host "[tls] certificate is not present in $storeLocation"
  exit 0
}

foreach ($match in $matches) {
  Remove-Item -LiteralPath $match.PSPath
}

Write-Host "[tls] certificate removed from $storeLocation"
