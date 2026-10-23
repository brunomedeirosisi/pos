[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = Split-Path -Parent $scriptDir
$certificateDestination = Join-Path $scriptDir 'caddy-local-root.crt'
$serviceName = 'reverse-proxy'
$containerCertificatePath = '/data/caddy/pki/authorities/local/root.crt'

function Write-Step([string] $Message) {
  Write-Host "[tls] $Message"
}

Push-Location $projectRoot
try {
  Write-Step 'starting reverse-proxy to ensure the local Caddy CA exists'
  docker compose up -d $serviceName | Out-Host

  Write-Step 'exporting the Caddy local root certificate from the container'
  docker compose cp "${serviceName}:${containerCertificatePath}" $certificateDestination | Out-Host

  if (-not (Test-Path -LiteralPath $certificateDestination)) {
    throw "certificate was not exported to $certificateDestination"
  }

  $certificate = New-Object System.Security.Cryptography.X509Certificates.X509Certificate2($certificateDestination)
  $thumbprint = $certificate.Thumbprint
  $storeLocation = 'Cert:\CurrentUser\Root'
  $existing = Get-ChildItem -Path $storeLocation | Where-Object Thumbprint -eq $thumbprint

  if ($existing) {
    Write-Step "certificate already trusted in $storeLocation"
  }
  else {
    Write-Step "importing certificate into $storeLocation"
    Import-Certificate -FilePath $certificateDestination -CertStoreLocation $storeLocation | Out-Null
  }

  Write-Step 'certificate ready; reopen https://pos.localhost if the warning page is still open'
}
finally {
  Pop-Location
}
