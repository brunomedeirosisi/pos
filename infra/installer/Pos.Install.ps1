. (Join-Path $PSScriptRoot 'Pos.Common.ps1')

function Write-PosStep([string]$Text) {
  Write-Host $Text
  if (Get-Variable -Name PosProgress -Scope Global -ErrorAction SilentlyContinue) { & $global:PosProgress $Text }
}
function Prepare-PosDocker([bool]$AllowInstall) {
  try { $docker=Get-PosDocker } catch {
    if (-not $AllowInstall) { throw 'Instale Docker Desktop ou marque Preparar Docker (aceite os termos).' }
    Write-PosStep 'Instalando Docker Desktop pelo gerenciador oficial do Windows...'
    $winget=Get-Command winget.exe -ErrorAction Stop
    $null=Invoke-PosProcess $winget.Source @('install','--id','Docker.DockerDesktop','--exact','--source','winget','--silent','--accept-package-agreements','--accept-source-agreements','--disable-interactivity') 1800
    $docker=Get-PosDocker
  }
  try { $null=Invoke-PosProcess $docker @('info','--format','{{.OSType}}') 20; return }
  catch {
    $desktop=@((Join-Path $env:ProgramFiles 'Docker\Docker\Docker Desktop.exe'),(Join-Path $env:LOCALAPPDATA 'Programs\DockerDesktop\Docker Desktop.exe')) | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
    if (-not $desktop) { throw 'Abra Docker Desktop, conclua o preparo do WSL e reinicie o Windows se solicitado.' }
    Start-Process -FilePath $desktop -WindowStyle Hidden
    Write-PosStep 'Aguardando Docker Desktop/WSL. Se o Windows pedir reinicio, repita o instalador depois.'
    for($i=0;$i -lt 60;$i++) {
      try { $os=Invoke-PosProcess $docker @('info','--format','{{.OSType}}') 10; if($os -ne 'linux'){throw 'Selecione Linux containers no Docker Desktop.'}; return } catch { Start-Sleep -Seconds 3; if(Get-Variable PosGuiPump -Scope Global -ErrorAction SilentlyContinue){& $global:PosGuiPump} }
    }
    throw 'Docker nao ficou pronto. Conclua o WSL/virtualizacao, reinicie se necessario e execute novamente.'
  }
}
function Assert-PosPrincipalOptions($Options, [bool]$CheckMachine=$true) {
  Assert-PosPrivateIp $Options.serverIp
  foreach($key in @('printerName','companyName','companyAddress','companyTaxId','backupDestination')) {
    if ([string]::IsNullOrWhiteSpace([string]$Options.$key) -or ([string]$Options.$key).Length -gt 250 -or ([string]$Options.$key).IndexOf([char]0) -ge 0) { throw ('Campo invalido: '+$key) }
  }
  if (-not (Test-Path -LiteralPath $Options.backupDestination -PathType Container)) { throw 'Escolha um destino de backup existente em outro dispositivo/computador.' }
  if (-not $Options.backupIsExternal) { throw 'Confirme que o destino de backup esta fora do disco do Principal.' }
  if($CheckMachine) {
    $interface=Get-NetIPAddress -AddressFamily IPv4 | Where-Object IPAddress -eq $Options.serverIp | Select-Object -First 1
    if(-not $interface){throw 'O IP escolhido nao pertence a este computador. Reserve-o no roteador antes.'}
    $profile=Get-NetConnectionProfile -InterfaceIndex $interface.InterfaceIndex -ErrorAction Stop
    if($profile.NetworkCategory -ne 'Private'){throw 'Configure a rede da loja como Privada no Windows antes de instalar.'}
    if(-not (Get-Printer | Where-Object Name -eq $Options.printerName)){throw 'Instale/teste o driver da impressora no Windows e selecione a fila correta.'}
  }
}
function Install-PosPrincipalCore([string]$Bundle, $Options, [string]$Root=(Get-PosInstallRoot)) {
  Write-PosStep 'Conferindo pacote e configuracao...'
  $manifest=Assert-PosBundle $Bundle
  if($manifest.mode -ne 'Principal'){throw 'Este pacote e apenas Terminal.'}
  Assert-PosPrincipalOptions $Options
  $fullRoot=[IO.Path]::GetFullPath($Root).TrimEnd('\')
  $allowed=[IO.Path]::GetFullPath((Get-PosInstallRoot)).TrimEnd('\')
  if($fullRoot -ne $allowed){throw 'O Principal usa somente a pasta POSStore do usuario atual.'}
  $backup=[IO.Path]::GetFullPath($Options.backupDestination).TrimEnd('\')
  if($backup -eq $fullRoot -or $backup.StartsWith($fullRoot+'\',[StringComparison]::OrdinalIgnoreCase)){throw 'Backup nao pode ficar dentro da instalacao.'}
  Prepare-PosDocker ([bool]$Options.prepareDocker)
  if((Invoke-PosProcess (Get-PosDocker) @('info','--format','{{.OSType}}/{{.Architecture}}')) -ne 'linux/x86_64'){throw 'Use Docker Desktop em modo Linux/amd64 neste instalador x64.'}
  Protect-PosFolder $Root
  if(Test-Path -LiteralPath (Join-Path $Root 'settings.json')) {
    $existing=Get-PosSettings $Root
    if($existing.status -in @('updating','update_failed')){throw 'Atualizacao pendente exige recuperacao assistida. Reparar nao pode voltar automaticamente ao schema anterior.'}
    if($existing.version -ne $manifest.version){throw 'Ja existe outra versao. Use Atualizar-POS.ps1; os dados foram preservados.'}
    if($existing.serverIp -ne $Options.serverIp -or $existing.printerName -ne $Options.printerName -or $existing.backupDestination -ne $Options.backupDestination){throw 'Use a configuracao original para Reparar. Mudancas de rede/impressora exigem reconfiguracao documentada.'}
    $settings=$existing
    $version=Join-Path (Join-Path $Root 'versions') $settings.version
    $null=Assert-PosBundle $version
    if($existing.status -eq 'ready'){$null=Invoke-PosProcess (Get-PosPowerShell) @('-NoProfile','-ExecutionPolicy','Bypass','-File',(Join-Path $version 'Parar-POS.ps1'),'-Root',$Root)}
  } else {
    if($Options.adminEmail -notmatch '^[^@\s]+@[^@\s]+\.[^@\s]+$' -or $Options.adminPassword.Length -lt 12 -or [string]::IsNullOrWhiteSpace($Options.adminName)){throw 'Informe nome, e-mail e senha inicial de pelo menos 12 caracteres.'}
    $storeId=[Guid]::NewGuid().ToString()
    $project='pos-store-'+$storeId.Replace('-','').Substring(0,8)
    $version=Join-Path (Join-Path $Root 'versions') $manifest.version
    $null=New-Item -ItemType Directory -Path (Split-Path -Parent $version) -Force
    if(Test-Path -LiteralPath $version){throw 'Pasta de versao sem estado encontrada. Preserve-a e consulte o diagnostico.'}
    $null=New-Item -ItemType Directory -Path $version
    Get-ChildItem -LiteralPath $Bundle | ForEach-Object { Copy-Item -LiteralPath $_.FullName -Destination $version -Recurse -Force }
    $null=Assert-PosBundle $version
    $settings=[pscustomobject]@{schemaVersion=1;ownerSid=(Get-PosOwner);storeId=$storeId;project=$project;version=$manifest.version;status='installing';serverIp=$Options.serverIp;serverUrl=('https://'+$Options.serverIp);printerName=$Options.printerName;companyName=$Options.companyName;companyAddress=$Options.companyAddress;companyTaxId=$Options.companyTaxId;backupDestination=$Options.backupDestination;certificateThumbprint=''}
    $secrets=@{database=(New-PosSecret);jwt=(New-PosSecret);metrics=(New-PosSecret);agent=(New-PosSecret);bootstrap=@{email=$Options.adminEmail;password=$Options.adminPassword;name=$Options.adminName}}
    Save-PosSecret (Join-Path $Root 'secrets.bin') $secrets
    Write-PosJson (Join-Path $Root 'settings.json') $settings
  }
  Write-PosStep 'Carregando as imagens prontas. Nenhum dado sintetico sera instalado...'
  $null=Invoke-PosProcess (Get-PosDocker) @('load','--input',(Join-Path $version 'images.tar'))
  foreach($image in $manifest.images.PSObject.Properties){$id=Invoke-PosProcess (Get-PosDocker) @('image','inspect',$image.Value,'--format','{{.Id}}');if($id -ne $image.Value){throw 'Imagem diverge do manifesto.'}}
  Write-PosStep 'Iniciando banco e aplicacao...'
  $null=Invoke-PosCompose $Root @('up','-d','--wait','--wait-timeout','180','--pull','never')
  $pki=Join-Path $Root 'pki';$null=New-Item -ItemType Directory -Path $pki -Force
  $ca=Join-Path $pki 'root.crt'; $exported=$false
  for($i=0;$i -lt 20;$i++){try{$null=Invoke-PosCompose $Root @('cp','proxy:/data/caddy/pki/authorities/local/root.crt',$ca);$exported=$true;break}catch{Start-Sleep -Seconds 1}}
  if(-not $exported){throw 'Nao foi possivel obter o certificado do servidor.'}
  $settings.certificateThumbprint=Import-PosCertificate $ca (Get-PosHash $ca)
  Write-PosJson (Join-Path $Root 'settings.json') $settings
  Test-PosStore $settings.serverUrl $settings.storeId
  Write-PosStep 'Conferindo segunda copia de backup e criando backup inicial...'
  $null=Invoke-PosCompose $Root @('exec','-T','api','node','dist/scripts/store-backup.js')
  Write-PosJson (Join-Path $Root 'backup-status.json') @{ok=$true;lastSuccessUtc=[DateTime]::UtcNow.ToString('o');message='Backup inicial e replica conferidos'}
  # Remove bootstrap credentials from both DPAPI payload and container environment.
  $saved=Read-PosSecret (Join-Path $Root 'secrets.bin')
  Save-PosSecret (Join-Path $Root 'secrets.bin') @{database=$saved.database;jwt=$saved.jwt;metrics=$saved.metrics;agent=$saved.agent}
  $null=Invoke-PosCompose $Root @('up','-d','--no-deps','--force-recreate','--wait','--wait-timeout','180','--pull','never','api')
  Write-PosStep 'Configurando acesso HTTPS apenas na rede privada...'
  $helper=Join-Path $version 'Firewall-POS.ps1'
  $arguments=@('-NoProfile','-ExecutionPolicy','Bypass','-File',$helper,'-Address',$settings.serverIp,'-Project',$settings.project)
  $process=Start-Process -FilePath (Get-PosPowerShell) -ArgumentList (($arguments|ForEach-Object{ConvertTo-PosArgument $_}) -join ' ') -Verb RunAs -WindowStyle Hidden -PassThru -Wait
  if($process.ExitCode -ne 0){throw 'A regra de rede nao foi criada. Autorize apenas o auxiliar de firewall do POS.'}
  $agentConfig=@{printerId='principal';serverUrl=$settings.serverUrl;printerName=$settings.printerName;journalDirectory=(Join-Path $Root 'print-journal');printTimeoutMs=15000;stopFile=(Join-Path $Root 'stop.request')}
  Write-PosJson (Join-Path $Root 'agent.json') $agentConfig
  $settings.status='ready';Write-PosJson (Join-Path $Root 'settings.json') $settings
  $startArgs=@('-NoProfile','-WindowStyle','Hidden','-ExecutionPolicy','Bypass','-File',(Join-Path $version 'Start-POS.ps1'),'-Root',$Root)
  New-PosShortcut (Join-Path ([Environment]::GetFolderPath('Startup')) 'POS Principal.lnk') (Get-PosPowerShell) (($startArgs|ForEach-Object{ConvertTo-PosArgument $_}) -join ' ')
  Write-PosUrlShortcut (Get-PosBrowserUrl $settings.serverUrl $settings.storeId 'principal')
  Export-PosTerminal $Root $version
  Write-PosStep ('Certificado SHA256 para conferir no Terminal: '+(Get-PosHash $ca))
  Start-Process -FilePath (Get-PosPowerShell) -ArgumentList ((($startArgs+@('-Resume'))|ForEach-Object{ConvertTo-PosArgument $_}) -join ' ') -WindowStyle Hidden
  Write-PosStep ('Instalacao concluida. Terminal em '+(Join-Path $Root 'Terminal-POS')+'. Abra '+$settings.serverUrl)
  return $settings
}
function Install-PosPrincipal([string]$Bundle, $Options, [string]$Root=(Get-PosInstallRoot)) {
  if([IO.Path]::GetFullPath($Root).TrimEnd([char]92) -ne [IO.Path]::GetFullPath((Get-PosInstallRoot)).TrimEnd([char]92)){throw 'Pasta de instalacao invalida.'}
  Protect-PosFolder $Root
  try{$lock=New-Object IO.FileStream((Join-Path $Root 'installer.lock'),[IO.FileMode]::OpenOrCreate,[IO.FileAccess]::ReadWrite,[IO.FileShare]::None)}catch{throw 'Outro instalador/atualizador ja esta ativo.'}
  try{return Install-PosPrincipalCore $Bundle $Options $Root}finally{$lock.Dispose()}
}
function Export-PosTerminal([string]$Root,[string]$Version) {
  $settings=Get-PosSettings $Root
  $destination=Join-Path $Root 'Terminal-POS';$null=New-Item -ItemType Directory -Path $destination -Force
  foreach($name in @('Instalar-POS.exe','Instalar-POS.ps1','Pos.Common.ps1','Pos.Install.ps1','Pos.Terminal.ps1','Start-Terminal.ps1','Parar-Terminal.ps1','Diagnosticar-Terminal.ps1','LEIA-ME.txt')){Copy-Item -LiteralPath (Join-Path $Version $name) -Destination (Join-Path $destination $name) -Force}
  foreach($folder in @('runtime','agent','documentacao')){Copy-Item -LiteralPath (Join-Path $Version $folder) -Destination $destination -Recurse -Force}
  Copy-Item -LiteralPath (Join-Path $Root 'pki\root.crt') -Destination (Join-Path $destination 'root.crt') -Force
  Write-PosJson (Join-Path $destination 'pairing.json') @{schemaVersion=1;storeId=$settings.storeId;serverUrl=$settings.serverUrl;certificateSha256=(Get-PosHash (Join-Path $destination 'root.crt'))}
  $files=@(Get-ChildItem -LiteralPath $destination -Recurse -File | Where-Object {$_.FullName -ne (Join-Path $destination 'manifest.json')} | ForEach-Object{@{path=$_.FullName.Substring($destination.Length+1).Replace('\','/');sha256=(Get-PosHash $_.FullName)}})
  Write-PosJson (Join-Path $destination 'manifest.json') @{schemaVersion=1;version=$settings.version;mode='Terminal';files=$files}
}
. (Join-Path $PSScriptRoot 'Pos.Terminal.ps1')
