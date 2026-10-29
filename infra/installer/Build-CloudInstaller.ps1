[CmdletBinding()]
param([string]$Version='1.0.0-store.3',[string]$SigningThumbprint='')
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'Pos.Common.ps1')
. (Join-Path $PSScriptRoot 'Pos.Build.ps1')
if($Version -notmatch '^[0-9A-Za-z][0-9A-Za-z.-]{0,79}$'){throw 'Versao invalida.'}
$repoRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
$artifacts=Join-Path $repoRoot 'artifacts';$destination=Join-Path $artifacts ('POS-Nuvem-'+$Version);$zipPath=$destination+'.zip'
if((Test-Path -LiteralPath $destination) -or (Test-Path -LiteralPath $zipPath)){throw 'Pacote existente. Use outra versao.'}
$stage=Join-Path ([IO.Path]::GetTempPath()) ('pos-cloud-build-'+[Guid]::NewGuid().ToString('N'));$bundle=Join-Path $stage 'bundle'
$null=New-Item -ItemType Directory -Path $bundle -Force
Write-Host ('Area de build: '+$stage)
# This client-only builder never discovers or invokes Docker.
$runtime=Add-PosPackageRuntime $stage $bundle $repoRoot
& (Join-Path $PSScriptRoot 'Test-Installer.ps1') -NodePath $runtime.node
foreach($name in @('Instalar-POS.ps1','Pos.Common.ps1','Pos.Install.ps1','Pos.Terminal.ps1','Pos.Cloud.ps1','Start-Terminal.ps1','Parar-Terminal.ps1','Diagnosticar-Terminal.ps1')){
  [IO.File]::WriteAllText((Join-Path $bundle $name),[IO.File]::ReadAllText((Join-Path $PSScriptRoot $name)),(New-Object Text.UTF8Encoding($true)))
}
$compiler=Join-Path $env:SystemRoot 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
$null=Invoke-PosProcess $compiler @('/nologo','/target:winexe','/platform:x64','/reference:System.Windows.Forms.dll','/reference:System.Web.Extensions.dll',('/out:'+(Join-Path $bundle 'Instalar-POS.exe')),(Join-Path $PSScriptRoot 'Launcher.cs'))
$docs=Join-Path $bundle 'documentacao';$null=New-Item -ItemType Directory -Path $docs
foreach($name in @('NUVEM.md','USO.md','TECNICO.md','HOMOLOGACAO.md','IMPRESSORAS.md','TESTE-INTERNET.md')){Copy-Item -LiteralPath (Join-Path $repoRoot ('docs\instalacao\'+$name)) -Destination (Join-Path $docs $name)}
[IO.File]::WriteAllText((Join-Path $bundle 'LEIA-ME.txt'),('POS Nuvem '+$Version+[Environment]::NewLine+'Extraia o ZIP completo e execute Instalar-POS.exe. Leia documentacao/NUVEM.md.'+[Environment]::NewLine+'Informe URL HTTPS publica, ID UUID da loja e, se houver impressora, fila Windows e codigo do administrador.'+[Environment]::NewLine+'Este pacote conecta um caixa a um servidor existente. Nao publica servidor, instala Docker ou modifica certificados/firewall.'),(New-Object Text.UTF8Encoding($true)))
if($SigningThumbprint){
  $cert=Get-Item -LiteralPath ('Cert:\CurrentUser\My\'+$SigningThumbprint)
  foreach($file in @(Get-Item -LiteralPath (Join-Path $bundle 'Instalar-POS.exe'))+@(Get-ChildItem -LiteralPath $bundle -Filter *.ps1)){
    $signed=Set-AuthenticodeSignature -LiteralPath $file.FullName -Certificate $cert -HashAlgorithm SHA256
    if($signed.Status -ne 'Valid'){throw 'Falha ao assinar o pacote.'}
  }
}
$files=@(Get-ChildItem -LiteralPath $bundle -Recurse -File|ForEach-Object{@{path=$_.FullName.Substring($bundle.Length+1).Replace('\','/');sha256=(Get-PosHash $_.FullName)}})
$head=Invoke-PosProcess 'git.exe' @('-C',$repoRoot,'rev-parse','HEAD');$dirty=Invoke-PosProcess 'git.exe' @('-C',$repoRoot,'status','--porcelain')
Write-PosJson (Join-Path $bundle 'manifest.json') @{schemaVersion=1;mode='Cloud';version=$Version;builtAtUtc=[DateTime]::UtcNow.ToString('o');sourceHead=$head;sourceWasDirty=([bool]$dirty);nodeVersion=$runtime.nodeVersion;nodeArchiveSha256=$runtime.archiveSha256;codeSigned=([bool]$SigningThumbprint);files=$files}
$null=Assert-PosBundle $bundle
$null=Invoke-PosProcess (Join-Path $bundle 'Instalar-POS.exe') @('--validate') 60
$ui=Invoke-PosProcess (Get-PosPowerShell) @('-NoProfile','-STA','-ExecutionPolicy','Bypass','-File',(Join-Path $bundle 'Instalar-POS.ps1'),'-UiCheck') 60
if(-not (ConvertFrom-Json $ui).cloudFieldsEnabled){throw 'Pacote Nuvem nao abriu o formulario de nuvem.'}
$null=New-Item -ItemType Directory -Path $artifacts -Force
if(-not ([IO.Path]::GetFullPath($destination)).StartsWith(([IO.Path]::GetFullPath($artifacts)+'\'),[StringComparison]::OrdinalIgnoreCase)){throw 'Destino fora de artifacts.'}
Move-Item -LiteralPath $bundle -Destination $destination
Add-Type -AssemblyName System.IO.Compression.FileSystem;Add-Type -AssemblyName System.IO.Compression
$archive=[IO.Compression.ZipFile]::Open($zipPath,[IO.Compression.ZipArchiveMode]::Create)
try{foreach($file in Get-ChildItem -LiteralPath $destination -Recurse -File){$relative=$file.FullName.Substring($destination.Length+1).Replace('\','/');$null=[IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive,$file.FullName,$relative,[IO.Compression.CompressionLevel]::Optimal)}}finally{$archive.Dispose()}
$hash=Get-PosHash $zipPath;[IO.File]::WriteAllText(($zipPath+'.sha256'),($hash+'  '+[IO.Path]::GetFileName($zipPath)))
Write-Host ('Pacote: '+$zipPath);Write-Host ('SHA256: '+$hash)
