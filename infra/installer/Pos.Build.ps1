function Add-PosPackageRuntime([string]$Stage,[string]$Bundle,[string]$RepoRoot) {
Write-Host 'Obtendo runtime Windows oficial com SHA256 e assinatura Authenticode...'
[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12
$nodeVersion='24.21.0';$name='node-v'+$nodeVersion+'-win-x64.zip'
$checksumPath=Join-Path $stage 'SHASUMS256.txt';$runtimeZip=Join-Path $stage $name
Invoke-WebRequest -UseBasicParsing -Uri ('https://nodejs.org/dist/v'+$nodeVersion+'/SHASUMS256.txt') -OutFile $checksumPath
$line=Get-Content -LiteralPath $checksumPath | Where-Object {$_ -match ('  '+[regex]::Escape($name)+'$')} | Select-Object -First 1
if(-not $line){throw 'Runtime nao consta do manifesto oficial Node.js.'}
$expected=($line -split '\s+')[0]
Invoke-WebRequest -UseBasicParsing -Uri ('https://nodejs.org/dist/v'+$nodeVersion+'/'+$name) -OutFile $runtimeZip
if((Get-PosHash $runtimeZip) -ne $expected){throw 'Runtime com checksum divergente.'}
$runtimeSource=Join-Path (Join-Path $stage 'node') ('node-v'+$nodeVersion+'-win-x64')
$null=New-Item -ItemType Directory -Path $runtimeSource -Force
Add-Type -AssemblyName System.IO.Compression.FileSystem
$nodeArchive=[IO.Compression.ZipFile]::OpenRead($runtimeZip)
try {
  foreach($runtimeFile in @('node.exe','LICENSE')) {
    $entry=$nodeArchive.GetEntry(('node-v'+$nodeVersion+'-win-x64/'+$runtimeFile))
    if(-not $entry){throw ('Runtime sem arquivo obrigatorio: '+$runtimeFile)}
    [IO.Compression.ZipFileExtensions]::ExtractToFile($entry,(Join-Path $runtimeSource $runtimeFile))
  }
} finally {$nodeArchive.Dispose()}
$node=Join-Path $runtimeSource 'node.exe'
$signature=Get-AuthenticodeSignature -LiteralPath $node
if($signature.Status -ne 'Valid' -or $signature.SignerCertificate.Subject -notmatch 'OpenJS|Node.js'){throw 'Assinatura do runtime Node.js nao validada.'}
$null=New-Item -ItemType Directory -Path (Join-Path $bundle 'runtime')
Copy-Item -LiteralPath $node -Destination (Join-Path $bundle 'runtime\node.exe')
Copy-Item -LiteralPath (Join-Path $runtimeSource 'LICENSE') -Destination (Join-Path $bundle 'runtime\LICENSE-node.txt')
$null=New-Item -ItemType Directory -Path (Join-Path $bundle 'agent')
Copy-Item -LiteralPath (Join-Path $repoRoot 'agent\src\pull-agent.mjs') -Destination (Join-Path $bundle 'agent\pull-agent.mjs')
if((Invoke-PosProcess $node @('--version')) -ne ('v'+$nodeVersion)){throw 'Versao do runtime inesperada.'}
  return @{node=$node;nodeVersion=$nodeVersion;archiveSha256=$expected}
}
