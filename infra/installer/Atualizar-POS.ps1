param([Parameter(Mandatory=$true)][string]$Package,[string]$Root=(Join-Path $env:LOCALAPPDATA 'POSStore'))
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'Pos.Install.ps1')
$next=Assert-PosBundle $Package
$settings=Get-PosSettings $Root
try{$installLock=New-Object IO.FileStream((Join-Path $Root 'installer.lock'),[IO.FileMode]::OpenOrCreate,[IO.FileAccess]::ReadWrite,[IO.FileShare]::None)}catch{throw 'Outro instalador/atualizador ja esta ativo.'}
try {
if($settings.status -ne 'ready'){throw 'Instalacao/atualizacao pendente exige recuperacao assistida antes de outra atualizacao.'}
if($next.mode -ne 'Principal' -or $next.version -eq $settings.version){throw 'Use Reparar para a mesma versao; atualizacao exige um pacote Principal novo.'}
if(-not ($next.compatibleFrom -contains $settings.version)){throw 'Este pacote nao declara compatibilidade com a versao instalada. Atualizacao bloqueada antes de alterar dados.'}
$oldVersion=Join-Path (Join-Path $Root 'versions') $settings.version
$nextVersion=Join-Path (Join-Path $Root 'versions') $next.version
if(Test-Path -LiteralPath $nextVersion){throw 'Pasta da nova versao ja existe. Preserve-a para diagnostico.'}
Write-PosStep 'Criando backup com replica antes da atualizacao...'
$null=Invoke-PosCompose $Root @('exec','-T','api','node','dist/scripts/store-backup.js')
$null=New-Item -ItemType Directory -Path $nextVersion
Get-ChildItem -LiteralPath $Package | ForEach-Object { Copy-Item -LiteralPath $_.FullName -Destination $nextVersion -Recurse -Force }
$null=Assert-PosBundle $nextVersion
$null=Invoke-PosProcess (Get-PosDocker) @('load','--input',(Join-Path $nextVersion 'images.tar'))
foreach($image in $next.images.PSObject.Properties){$actual=Invoke-PosProcess (Get-PosDocker) @('image','inspect',$image.Value,'--format','{{.Id}}');if($actual -ne $image.Value){throw 'Imagem diferente do manifesto.'}}
& (Join-Path $oldVersion 'Parar-POS.ps1') -Root $Root
$settings.status='updating';Write-PosJson (Join-Path $Root 'settings.json') $settings
try {
  $null=Invoke-PosCompose $Root @('up','-d','--wait','--wait-timeout','180','--pull','never') $nextVersion
  Test-PosStore $settings.serverUrl $settings.storeId
  $null=Invoke-PosCompose $Root @('exec','-T','api','node','dist/scripts/store-backup.js','--check') $nextVersion
  $settings.version=$next.version;$settings.status='ready';Write-PosJson (Join-Path $Root 'settings.json') $settings
  Export-PosTerminal $Root $nextVersion
  Write-PosUrlShortcut (Get-PosBrowserUrl $settings.serverUrl $settings.storeId 'principal')
  $startArgs=@('-NoProfile','-WindowStyle','Hidden','-ExecutionPolicy','Bypass','-File',(Join-Path $nextVersion 'Start-POS.ps1'),'-Root',$Root)
  New-PosShortcut (Join-Path ([Environment]::GetFolderPath('Startup')) 'POS Principal.lnk') (Get-PosPowerShell) (($startArgs|ForEach-Object{ConvertTo-PosArgument $_}) -join ' ')
  Start-Process -FilePath (Get-PosPowerShell) -ArgumentList ((($startArgs+@('-Resume'))|ForEach-Object{ConvertTo-PosArgument $_}) -join ' ') -WindowStyle Hidden
  Write-PosStep 'Atualizacao concluida. A versao anterior e os volumes foram preservados.'
} catch {
  $settings.status='update_failed';Write-PosJson (Join-Path $Root 'settings.json') $settings
  throw 'Atualizacao incompleta: nao ha rollback automatico de banco. Preserve volumes/backups e consulte o procedimento tecnico de recuperacao.'
}

} finally { $installLock.Dispose() }
