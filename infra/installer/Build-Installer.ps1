[CmdletBinding()]
param([string]$Version='1.0.0-store.2',[string[]]$CompatibleFrom=@(),[string]$SigningThumbprint='')
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'Pos.Common.ps1')
if($Version -notmatch '^[0-9A-Za-z][0-9A-Za-z.-]{0,79}$'){throw 'Versao invalida.'}
$repoRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
$artifacts=Join-Path $repoRoot 'artifacts'
$destination=Join-Path $artifacts ('POS-Loja-'+$Version)
$zipPath=$destination+'.zip'
if((Test-Path -LiteralPath $destination) -or (Test-Path -LiteralPath $zipPath)){throw 'Versao ja empacotada. Use outra versao; pacotes existentes nao sao sobrescritos.'}
$stage=Join-Path ([IO.Path]::GetTempPath()) ('pos-store-build-'+[Guid]::NewGuid().ToString('N'))
$bundle=Join-Path $stage 'bundle';$null=New-Item -ItemType Directory -Path $bundle -Force
Write-Host ('Area de build: '+$stage)
$docker=Get-PosDocker
if((Invoke-PosProcess $docker @('info','--format','{{.OSType}}/{{.Architecture}}')) -ne 'linux/x86_64'){throw 'O build requer Docker Linux/amd64.'}
$apiTag='pos-store-api:'+ $Version.ToLowerInvariant();$frontendTag='pos-store-frontend:'+$Version.ToLowerInvariant()
Write-Host 'Construindo API e frontend pelo lockfile...'
$null=Invoke-PosProcess $docker @('build','--tag',$apiTag,(Join-Path $repoRoot 'backend')) 1800
$null=Invoke-PosProcess $docker @('build','--tag',$frontendTag,(Join-Path $repoRoot 'frontend')) 1800
$references=@{
  api=$apiTag;frontend=$frontendTag;
  db='postgres:16-alpine@sha256:721873c34ceb9f8d8fc265984940dc982404c105f19ad51be9fdc5970a6080ea';
  redis='redis:7-alpine@sha256:892022f9f18c26c92c30e15194d132f90044af87b94a491a75429bbc3982eab1';
  proxy='caddy:2-alpine@sha256:eb4d35b7452d1ab6171fbdbe8d9275b2301dad6dad92115d91e19fb9b24d510f'
}
$images=@{}
foreach($key in @('db','redis','proxy')){$null=Invoke-PosProcess $docker @('pull',$references[$key])}
foreach($key in $references.Keys){$images[$key]=Invoke-PosProcess $docker @('image','inspect',$references[$key],'--format','{{.Id}}')}
Write-Host 'Exportando imagens para instalacao sem build na loja...'
$null=Invoke-PosProcess $docker (@('image','save','--output',(Join-Path $bundle 'images.tar'))+@($images.Values)) 1800
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
& (Join-Path $PSScriptRoot 'Test-Installer.ps1') -NodePath $node
foreach($name in @('Instalar-POS.ps1','Pos.Common.ps1','Pos.Install.ps1','Pos.Terminal.ps1','Start-Terminal.ps1','Parar-Terminal.ps1','Diagnosticar-Terminal.ps1','Firewall-POS.ps1','Start-POS.ps1','Parar-POS.ps1','Diagnosticar-POS.ps1','Atualizar-POS.ps1','Desativar-POS.ps1','store.compose.yml','Caddyfile')) {
  $source=Join-Path $PSScriptRoot $name;$target=Join-Path $bundle $name
  if($name.EndsWith('.ps1')){[IO.File]::WriteAllText($target,[IO.File]::ReadAllText($source),(New-Object Text.UTF8Encoding($true)))}else{Copy-Item -LiteralPath $source -Destination $target}
}
Copy-Item -LiteralPath (Join-Path $repoRoot 'backend\sql\init.sql') -Destination (Join-Path $bundle 'init.sql')
[IO.File]::WriteAllText((Join-Path $bundle 'empty.env'),'')
$compiler=Join-Path $env:SystemRoot 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
$null=Invoke-PosProcess $compiler @('/nologo','/target:winexe','/platform:x64','/reference:System.Windows.Forms.dll','/reference:System.Web.Extensions.dll',('/out:'+(Join-Path $bundle 'Instalar-POS.exe')),(Join-Path $PSScriptRoot 'Launcher.cs'))
$null=New-Item -ItemType Directory -Path (Join-Path $bundle 'documentacao')
foreach($name in @('USO.md','TECNICO.md','HOMOLOGACAO.md','IMPRESSORAS.md')){Copy-Item -LiteralPath (Join-Path $repoRoot ('docs\instalacao\'+$name)) -Destination (Join-Path $bundle ('documentacao\'+$name))}
$readme='POS Loja '+$Version+[Environment]::NewLine+'Extraia o ZIP completo e execute Instalar-POS.exe. Leia documentacao/USO.md antes de instalar.'+[Environment]::NewLine+'Principal: mesmo usuario Windows que executa Docker Desktop e a impressora. Terminal: copie somente Terminal-POS gerado pelo Principal.'+[Environment]::NewLine+'O pacote nao inclui dados sinteticos de vendas. Preserve dados/volumes e conclua homologacao de rede, impressora e recuperacao.'
[IO.File]::WriteAllText((Join-Path $bundle 'LEIA-ME.txt'),$readme,(New-Object Text.UTF8Encoding($true)))
if($SigningThumbprint){
  $cert=Get-Item -LiteralPath ('Cert:\CurrentUser\My\'+$SigningThumbprint)
  foreach($file in @(Get-Item -LiteralPath (Join-Path $bundle 'Instalar-POS.exe'))+@(Get-ChildItem -LiteralPath $bundle -Filter *.ps1)){
    $signed=Set-AuthenticodeSignature -LiteralPath $file.FullName -Certificate $cert -HashAlgorithm SHA256
    if($signed.Status -ne 'Valid'){throw 'Falha ao assinar o pacote.'}
  }
}
$files=@(Get-ChildItem -LiteralPath $bundle -Recurse -File | ForEach-Object {@{path=$_.FullName.Substring($bundle.Length+1).Replace('\','/');sha256=(Get-PosHash $_.FullName)}})
$head=Invoke-PosProcess 'git.exe' @('-C',$repoRoot,'rev-parse','HEAD')
$dirty=Invoke-PosProcess 'git.exe' @('-C',$repoRoot,'status','--porcelain')
$manifest=@{schemaVersion=1;version=$Version;mode='Principal';builtAtUtc=[DateTime]::UtcNow.ToString('o');sourceHead=$head;sourceWasDirty=([bool]$dirty);compatibleFrom=@($CompatibleFrom);images=$images;nodeVersion=$nodeVersion;nodeArchiveSha256=$expected;codeSigned=([bool]$SigningThumbprint);files=$files}
Write-PosJson (Join-Path $bundle 'manifest.json') $manifest
$null=Assert-PosBundle $bundle
$null=Invoke-PosProcess (Get-PosPowerShell) @('-NoProfile','-ExecutionPolicy','Bypass','-File',(Join-Path $bundle 'Instalar-POS.ps1'),'-ValidateOnly')
$check=Start-Process -FilePath (Join-Path $bundle 'Instalar-POS.exe') -ArgumentList '--validate' -WindowStyle Hidden -PassThru -Wait
try {if($check.ExitCode -ne 0){throw 'Launcher nao passou na validacao sem instalacao.'}} finally {$check.Dispose()}
$null=New-Item -ItemType Directory -Path $artifacts -Force
if(-not ([IO.Path]::GetFullPath($destination)).StartsWith(([IO.Path]::GetFullPath($artifacts)+'\'),[StringComparison]::OrdinalIgnoreCase)){throw 'Destino fora de artifacts.'}
Move-Item -LiteralPath $bundle -Destination $destination
Add-Type -AssemblyName System.IO.Compression.FileSystem
Add-Type -AssemblyName System.IO.Compression
$archive=[IO.Compression.ZipFile]::Open($zipPath,[IO.Compression.ZipArchiveMode]::Create)
try {
  foreach($file in Get-ChildItem -LiteralPath $destination -Recurse -File) {
    $relative=$file.FullName.Substring($destination.Length+1).Replace('\','/')
    $null=[IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive,$file.FullName,$relative,[IO.Compression.CompressionLevel]::Optimal)
  }
} finally {$archive.Dispose()}
$hash=Get-PosHash $zipPath
[IO.File]::WriteAllText(($zipPath+'.sha256'),($hash+'  '+[IO.Path]::GetFileName($zipPath)))
Write-Host ('Pacote: '+$zipPath)
Write-Host ('SHA256: '+$hash)
