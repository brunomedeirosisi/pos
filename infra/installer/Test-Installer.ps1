param([string]$NodePath='')
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'Pos.Install.ps1')
$script:passed=0
function Check([bool]$Condition,[string]$Message){if(-not $Condition){throw ('Teste falhou: '+$Message)};$script:passed++}
function Reject([scriptblock]$Action,[string]$Message){$rejected=$false;try{& $Action | Out-Null}catch{$rejected=$true};Check $rejected $Message}
$testDirectory=Join-Path ([IO.Path]::GetTempPath()) ('pos-installer-test-'+[Guid]::NewGuid().ToString('N'))
$null=New-Item -ItemType Directory -Path $testDirectory
try {
  foreach($file in Get-ChildItem -LiteralPath $PSScriptRoot -Filter *.ps1){$tokens=$null;$errors=$null;$null=[Management.Automation.Language.Parser]::ParseFile($file.FullName,[ref]$tokens,[ref]$errors);Check ($errors.Count -eq 0) ('Sintaxe '+$file.Name)}
  foreach($value in @('192.168.1.22','10.10.0.1','172.16.0.1','172.31.255.1')){Assert-PosPrivateIp $value;Check $true ('IP privado '+$value)}
  foreach($value in @('127.0.0.1','8.8.8.8','172.32.0.1','::1','localhost','192.168.001.22')){Reject {Assert-PosPrivateIp $value} ('IP recusado '+$value)}
  $private=Join-Path $testDirectory 'private';Protect-PosFolder $private
  $secret=New-PosSecret;Check ($secret.Length -eq 64) 'Segredo aleatorio de 256 bits'
  $secretFile=Join-Path $private 'secret.bin';Save-PosSecret $secretFile @{value=$secret}
  Check ((Read-PosSecret $secretFile).value -eq $secret) 'DPAPI round trip'
  Check (-not ([Text.Encoding]::UTF8.GetString([IO.File]::ReadAllBytes($secretFile))).Contains($secret)) 'Sem segredo em texto no arquivo'
  $acl=Get-Acl -LiteralPath $private;Check $acl.AreAccessRulesProtected 'ACL sem heranca publica'
  $script:httpsAttempts=0
  $protocolBefore=[Net.ServicePointManager]::SecurityProtocol
  function Invoke-RestMethod {param($Uri,$TimeoutSec);$script:httpsAttempts++;if($script:httpsAttempts -eq 1){throw 'synthetic certificate still being issued'};return @{store_id='synthetic-store'}}
  try {
    Test-PosStore 'https://192.168.1.22' 'synthetic-store'
    Check ($script:httpsAttempts -eq 2) 'HTTPS aguarda emissao inicial sem desabilitar validacao'
    Check ([Net.ServicePointManager]::SecurityProtocol -eq $protocolBefore) 'TLS restaurado apos validacao'
    Reject {Test-PosStore 'https://192.168.1.22' 'another-store'} 'Identidade de outra loja recusada'
  } finally {Remove-Item Function:Invoke-RestMethod}
  if($NodePath){
    $echoFile=Join-Path $testDirectory 'echo.mjs';[IO.File]::WriteAllText($echoFile,'console.log(JSON.stringify(process.argv.slice(2)))')
    $values=@('C:\pasta com espacos\','aspas " no argumento','literal $() e &','')
    $result=Invoke-PosProcess $NodePath (@($echoFile)+$values) 30
    $parsed=ConvertFrom-Json $result;Check ($parsed.Count -eq $values.Count) 'Quantidade de argumentos nativos'
    for($i=0;$i -lt $values.Count;$i++){Check ($parsed[$i] -eq $values[$i]) ('Argumento nativo '+$i)}
  }
  $bundle=Join-Path $testDirectory 'package';$null=New-Item -ItemType Directory -Path $bundle
  $names=@('Instalar-POS.exe','Instalar-POS.ps1','Pos.Common.ps1','Pos.Install.ps1','LEIA-ME.txt','images.tar','Firewall-POS.ps1','Start-POS.ps1','empty.env','store.compose.yml')
  foreach($name in $names){[IO.File]::WriteAllText((Join-Path $bundle $name),'synthetic installer fixture')}
  $files=@(Get-ChildItem -LiteralPath $bundle -File | ForEach-Object{@{path=$_.Name;sha256=(Get-PosHash $_.FullName)}})
  $fakeImage='sha256:'+('a'*64)
  $manifest=@{schemaVersion=1;version='1.0.0-test';mode='Principal';compatibleFrom=@();images=@{api=$fakeImage;frontend=$fakeImage;db=$fakeImage;redis=$fakeImage;proxy=$fakeImage};files=$files}
  $manifestPath=Join-Path $bundle 'manifest.json';Write-PosJson $manifestPath $manifest
  $null=Assert-PosBundle $bundle;Check $true 'Pacote valido'
  $manifest.files[0].path='../outside';Write-PosJson $manifestPath $manifest
  Reject {Assert-PosBundle $bundle} 'Traversal recusado antes de ler arquivo'
  $manifest.files[0].path=$files[0].path
  # Restore from original file list because the hashtable was modified by reference.
  $manifest.files=@(Get-ChildItem -LiteralPath $bundle -File | Where-Object Name -ne 'manifest.json' | ForEach-Object{@{path=$_.Name;sha256=(Get-PosHash $_.FullName)}})
  Write-PosJson $manifestPath $manifest
  [IO.File]::AppendAllText((Join-Path $bundle 'images.tar'),'tampered')
  Reject {Assert-PosBundle $bundle} 'Imagem adulterada recusada'
  $manifest.files=@(Get-ChildItem -LiteralPath $bundle -File | Where-Object Name -ne 'manifest.json' | ForEach-Object{@{path=$_.Name;sha256=(Get-PosHash $_.FullName)}});Write-PosJson $manifestPath $manifest
  # Compile and exercise the real launcher before replacing OS effects with mocks.
  foreach($name in @('Instalar-POS.ps1','Pos.Common.ps1','Pos.Install.ps1')){Copy-Item -LiteralPath (Join-Path $PSScriptRoot $name) -Destination (Join-Path $bundle $name) -Force}
  $compiler=Join-Path $env:SystemRoot 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
  $null=Invoke-PosProcess $compiler @('/nologo','/target:winexe','/platform:x64','/reference:System.Windows.Forms.dll','/reference:System.Web.Extensions.dll',('/out:'+(Join-Path $bundle 'Instalar-POS.exe')),(Join-Path $PSScriptRoot 'Launcher.cs'))
  $manifest.files=@(Get-ChildItem -LiteralPath $bundle -File | Where-Object Name -ne 'manifest.json' | ForEach-Object{@{path=$_.Name;sha256=(Get-PosHash $_.FullName)}});Write-PosJson $manifestPath $manifest
  $null=Invoke-PosProcess (Join-Path $bundle 'Instalar-POS.exe') @('--validate') 60
  Check $true 'Launcher real valida pacote sem instalar'
  $ui=Invoke-PosProcess (Get-PosPowerShell) @('-NoProfile','-STA','-ExecutionPolicy','Bypass','-File',(Join-Path $bundle 'Instalar-POS.ps1'),'-UiCheck') 60
  Check ((ConvertFrom-Json $ui).uiReady -eq $true) 'Interface real construida sem exibir janela ou instalar'
  $guiFile=Join-Path $bundle 'Instalar-POS.ps1';$guiBytes=[IO.File]::ReadAllBytes($guiFile)
  $sentinel=Join-Path $testDirectory 'must-not-execute.txt'
  [IO.File]::WriteAllText($guiFile,('[IO.File]::WriteAllText('''+$sentinel.Replace("'","''")+''',''executed'');exit 0'))
  Reject {Invoke-PosProcess (Join-Path $bundle 'Instalar-POS.exe') @('--validate') 60} 'Launcher recusa codigo adulterado antes de executar PowerShell'
  Check (-not (Test-Path -LiteralPath $sentinel)) 'Codigo adulterado nao foi executado'
  [IO.File]::WriteAllBytes($guiFile,$guiBytes)
  $script:installRoot=Join-Path $testDirectory 'installed';$script:terminalRoot=Join-Path $testDirectory 'terminal';$script:effects=New-Object Collections.Generic.List[string]
  $script:originalOptions=(Get-Command Assert-PosPrincipalOptions).ScriptBlock
  function Get-PosInstallRoot{return $script:installRoot}
  function Get-PosTerminalRoot{return $script:terminalRoot}
  function Assert-PosPrincipalOptions($Options){& $script:originalOptions $Options $false}
  function Prepare-PosDocker([bool]$AllowInstall){$script:effects.Add('prepare-docker')}
  function Get-PosDocker{return 'docker.exe'}
  function Invoke-PosProcess([string]$File,[string[]]$Arguments,[int]$TimeoutSeconds=900){$script:effects.Add(('process '+($Arguments -join ' ')));if($Arguments[0] -eq 'info'){return 'linux/x86_64'};if($Arguments.Count -gt 2 -and $Arguments[0] -eq 'image' -and $Arguments[1] -eq 'inspect'){return $Arguments[2]};return ''}
  function Invoke-PosCompose([string]$Root,[string[]]$Arguments,[string]$VersionPath=''){$script:effects.Add(('compose '+($Arguments -join ' ')));if($Arguments[0] -eq 'cp'){[IO.File]::WriteAllText($Arguments[2],'synthetic certificate')};return ''}
  function Import-PosCertificate([string]$Path,[string]$ExpectedHash){Check ((Get-PosHash $Path) -eq $ExpectedHash) 'Certificado conferido antes de importar (mock)';$script:effects.Add('certificate-trust-mocked');return ('A'*40)}
  function Test-PosStore([string]$Url,[string]$StoreId){Check ($Url -eq 'https://192.168.1.22') 'Identidade HTTPS conferida (mock)'}
  function New-PosShortcut([string]$Path,[string]$Target,[string]$Arguments=''){$script:effects.Add('startup-shortcut-mocked')}
  function Write-PosUrlShortcut([string]$Url){$script:effects.Add('desktop-shortcut-mocked')}
  function Start-Process {param($FilePath,$ArgumentList,$Verb,$WindowStyle,[switch]$PassThru,[switch]$Wait);$script:effects.Add('windows-process-mocked');if($PassThru){return [pscustomobject]@{ExitCode=0}}}
  $backup=Join-Path $testDirectory 'external-backup';$null=New-Item -ItemType Directory -Path $backup
  $options=@{serverIp='192.168.1.22';printerName='Synthetic Printer';companyName='Synthetic Store';companyAddress='Synthetic Address';companyTaxId='Synthetic ID';backupDestination=$backup;backupIsExternal=$true;prepareDocker=$false;adminName='Synthetic Admin';adminEmail='synthetic@example.test';adminPassword='synthetic_only_password_2026'}
  $state=Install-PosPrincipal $bundle $options
  Check ($state.status -eq 'ready') 'Principal conclui com estado pronto'
  $saved=Read-PosSecret (Join-Path $script:installRoot 'secrets.bin')
  Check (-not ($saved.PSObject.Properties.Name -contains 'bootstrap')) 'Senha de bootstrap removida depois de criar administrador'
  Check ($script:effects.Contains('compose exec -T api node dist/scripts/store-backup.js')) 'Backup inicial obrigatorio'
  $terminalPackage=Join-Path $script:installRoot 'Terminal-POS'
  Check (-not (Test-Path -LiteralPath (Join-Path $terminalPackage 'secrets.bin'))) 'Pacote Terminal sem credenciais'
  Check (-not (Test-Path -LiteralPath (Join-Path $terminalPackage 'images.tar'))) 'Pacote Terminal leve sem imagens'
  $before=$saved.database+'|'+$saved.jwt+'|'+$saved.agent
  $null=Install-PosPrincipal $bundle $options
  $saved=Read-PosSecret (Join-Path $script:installRoot 'secrets.bin')
  Check (($saved.database+'|'+$saved.jwt+'|'+$saved.agent) -eq $before) 'Reparar preserva credenciais e identidade'
  $count=$script:effects.Count;Install-PosTerminal $terminalPackage
  $newEffects=@($script:effects|Select-Object -Skip $count)
  Check (-not ($newEffects -contains 'prepare-docker')) 'Terminal nao instala Docker'
  Check (Test-Path -LiteralPath (Join-Path $script:terminalRoot 'terminal.json')) 'Terminal registra pareamento'
  Check (-not (($script:effects -join ' ') -match 'down|truncate|benchmark|seed')) 'Fluxo sem exclusao de volumes ou seed de vendas'
  $lock=New-Object IO.FileStream((Join-Path $script:installRoot 'installer.lock'),[IO.FileMode]::OpenOrCreate,[IO.FileAccess]::ReadWrite,[IO.FileShare]::None)
  try{Reject {Install-PosPrincipal $bundle $options} 'Instalador concorrente recusado'}finally{$lock.Dispose()}
  $state=Read-PosJson (Join-Path $script:installRoot 'settings.json');$state.status='update_failed';Write-PosJson (Join-Path $script:installRoot 'settings.json') $state
  Reject {Install-PosPrincipal $bundle $options} 'Reparar nao volta automaticamente de atualizacao falha'
  $options.serverIp='8.8.8.8';Reject {Install-PosPrincipal $bundle $options} 'Principal recusa rede publica'
  @{passed=$script:passed;failed=0;windowsGlobalChanges='mocked';realChecks=@('PowerShell parser','DPAPI CurrentUser','private ACL','manifest hashes/traversal','native argument quoting','idempotent install state');testDirectory=$testDirectory}|ConvertTo-Json -Compress
} finally {
  $full=[IO.Path]::GetFullPath($testDirectory)
  $parent=[IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd([char]92)+[char]92
  if(-not $full.StartsWith($parent,[StringComparison]::OrdinalIgnoreCase) -or [IO.Path]::GetFileName($full) -notlike 'pos-installer-test-*'){throw 'Recusa de limpeza fora do diretorio temporario de teste.'}
  Remove-Item -LiteralPath $full -Recurse -Force
}
