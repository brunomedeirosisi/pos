function Get-PosBrowserUrl([string]$ServerUrl,[string]$StoreId,[string]$PrinterId='principal') {
  return ($ServerUrl.TrimEnd('/')+'/?pos_store='+[Uri]::EscapeDataString($StoreId)+'&pos_printer='+[Uri]::EscapeDataString($PrinterId))
}
function Get-PosTerminalSettings([string]$Root) {
  $state=Read-PosJson (Join-Path $Root 'terminal.json')
  if(-not ($state.PSObject.Properties.Name -contains 'ownerSid') -or $state.ownerSid -ne (Get-PosOwner)){throw 'Use a conta Windows que instalou o Terminal.'}
  return $state
}
function Assert-PosTerminalPrinter([string]$Name) {
  if([string]::IsNullOrWhiteSpace($Name) -or $Name.Length -gt 200 -or -not (Get-Printer | Where-Object Name -eq $Name)){throw 'Instale/teste o driver e informe a fila exata da impressora neste Terminal.'}
}
function Invoke-PosTerminalApi([string]$Url,[string]$Route,$Body=$null,$Headers=@{}) {
  $previousProtocol=[Net.ServicePointManager]::SecurityProtocol
  try {
    [Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12
    $request=@{Uri=($Url.TrimEnd('/')+'/api/v1/print-agent'+$Route);TimeoutSec=15;Headers=$Headers}
    if($null -ne $Body){$request.Method='POST';$request.ContentType='application/json';$request.Body=(ConvertTo-Json -InputObject $Body -Compress)}
    return Invoke-RestMethod @request
  } finally {[Net.ServicePointManager]::SecurityProtocol=$previousProtocol}
}
function Install-PosTerminalCore([string]$Bundle,[bool]$WithPrinter,[string]$PrinterName,[string]$EnrollmentCode,[string]$Root) {
  $manifest=Assert-PosBundle $Bundle
  if($manifest.mode -ne 'Terminal'){throw 'Use o pacote Terminal-POS gerado pelo Principal atualizado.'}
  $pair=Read-PosJson (Join-Path $Bundle 'pairing.json')
  $guid=[Guid]::Empty
  if($pair.schemaVersion -ne 1 -or -not [Guid]::TryParse($pair.storeId,[ref]$guid)){throw 'Pareamento invalido.'}
  $uri=[Uri]$pair.serverUrl;Assert-PosPrivateIp $uri.Host
  if($uri.Scheme -ne 'https' -or $uri.Port -ne 443 -or $uri.UserInfo -or $uri.AbsolutePath -ne '/' -or $uri.Query -or $uri.Fragment){throw 'Endereco de pareamento invalido.'}
  $stateFile=Join-Path $Root 'terminal.json'
  $previous=$null
  if(Test-Path -LiteralPath $stateFile){
    $previous=Read-PosJson $stateFile
    if($previous.storeId -ne $pair.storeId -or $previous.serverUrl -ne $pair.serverUrl){throw 'Este perfil ja pertence a outra loja. Preserve a configuracao existente.'}
    if(($previous.PSObject.Properties.Name -contains 'ownerSid') -and $previous.ownerSid -ne (Get-PosOwner)){throw 'Use a conta que instalou este Terminal.'}
    if(($previous.PSObject.Properties.Name -contains 'withPrinter') -and $previous.withPrinter -and -not $WithPrinter){throw 'Este Terminal possui agente. Use o modo com impressora para reparar; Parar-Terminal para interromper sem redirecionar a fila.'}
  }
  if($WithPrinter){
    Assert-PosTerminalPrinter $PrinterName
    if($EnrollmentCode -and $EnrollmentCode -notmatch '^[a-f0-9]{48}$'){throw 'Informe o codigo de 48 caracteres gerado em Administracao > Impressoras.'}
    if(-not $EnrollmentCode -and -not (Test-Path -LiteralPath (Join-Path $Root 'terminal-agent.bin'))){throw 'Gere um codigo em Administracao > Impressoras antes de parear este Terminal.'}
  }
  Write-PosStep 'Conferindo certificado e identidade da loja...'
  $thumbprint=Import-PosCertificate (Join-Path $Bundle 'root.crt') $pair.certificateSha256
  Test-PosStore $pair.serverUrl $pair.storeId
  if($null -ne $previous -and ($previous.PSObject.Properties.Name -contains 'withPrinter') -and $previous.withPrinter){
    $stopScript=Join-Path (Join-Path (Join-Path $Root 'versions') $previous.version) 'Parar-Terminal.ps1'
    if(Test-Path -LiteralPath $stopScript){
      $null=Invoke-PosProcess (Get-PosPowerShell) @('-NoProfile','-ExecutionPolicy','Bypass','-File',$stopScript,'-Root',$Root)
    }else{
      # A lost enrollment reply can leave state before any release/worker was installed.
      try{$probe=New-Object IO.FileStream((Join-Path $Root 'supervisor.lock'),[IO.FileMode]::OpenOrCreate,[IO.FileAccess]::ReadWrite,[IO.FileShare]::None);$probe.Dispose()}catch{throw 'Supervisor ativo sem script de parada. Preserve o estado e execute o diagnostico.'}
    }
  }
  $state=@{schemaVersion=2;ownerSid=(Get-PosOwner);storeId=$pair.storeId;serverUrl=$pair.serverUrl;certificateThumbprint=$thumbprint;withPrinter=$WithPrinter;version=$manifest.version;status='installing';printerId='principal';printerName=$PrinterName}
  Write-PosJson $stateFile $state
  if($WithPrinter){
    $credentialPath=Join-Path $Root 'terminal-agent.bin'
    $credential=$null
    if(Test-Path -LiteralPath $credentialPath){$credential=Read-PosSecret $credentialPath}
    if($EnrollmentCode){
      if($EnrollmentCode -notmatch '^[a-f0-9]{48}$'){throw 'Informe o codigo gerado em Administracao > Impressoras (48 caracteres).'}
      if($null -eq $credential -or -not ($credential.PSObject.Properties.Name -contains 'code') -or $credential.code -ne $EnrollmentCode){
        Save-PosSecret $credentialPath @{token=(New-PosSecret);code=$EnrollmentCode}
        $credential=Read-PosSecret $credentialPath
      }
    }
    if($null -eq $credential){throw 'Gere um codigo em Administracao > Impressoras no Principal e informe-o neste instalador.'}
    if($credential.PSObject.Properties.Name -contains 'code'){
      Write-PosStep 'Pareando uma credencial exclusiva para a impressora deste Terminal...'
      $result=Invoke-PosTerminalApi $pair.serverUrl '/enroll' @{code=$credential.code;token=$credential.token}
      $printerGuid=[Guid]::Empty
      if($result.store_id -ne $pair.storeId -or -not [Guid]::TryParse($result.printer_id,[ref]$printerGuid)){throw 'Resposta de pareamento de outra loja ou destino invalido.'}
      Save-PosSecret $credentialPath @{token=$credential.token;printerId=$result.printer_id;displayName=$result.display_name}
      $credential=Read-PosSecret $credentialPath
    }
    $state.printerId=$credential.printerId
    $release=Join-Path (Join-Path $Root 'versions') $manifest.version
    $null=New-Item -ItemType Directory -Path $release -Force
    if([IO.Path]::GetFullPath($Bundle).TrimEnd([char]92) -ne [IO.Path]::GetFullPath($release).TrimEnd([char]92)){
      Get-ChildItem -LiteralPath $Bundle | ForEach-Object {Copy-Item -LiteralPath $_.FullName -Destination $release -Recurse -Force}
    }
    $null=Assert-PosBundle $release
    $pki=Join-Path $Root 'pki';$null=New-Item -ItemType Directory -Path $pki -Force
    Copy-Item -LiteralPath (Join-Path $Bundle 'root.crt') -Destination (Join-Path $pki 'root.crt') -Force
    $journal=Join-Path (Join-Path $Root 'print-journal') $state.printerId
    Write-PosJson (Join-Path $Root 'agent.json') @{serverUrl=$pair.serverUrl;printerId=$state.printerId;printerName=$PrinterName;journalDirectory=$journal;printTimeoutMs=15000;stopFile=(Join-Path $Root 'stop.request')}
    $state.status='ready';Write-PosJson $stateFile $state
    $startArgs=@('-NoProfile','-WindowStyle','Hidden','-ExecutionPolicy','Bypass','-File',(Join-Path $release 'Start-Terminal.ps1'),'-Root',$Root)
    New-PosShortcut (Join-Path ([Environment]::GetFolderPath('Startup')) 'POS Terminal Impressora.lnk') (Get-PosPowerShell) (($startArgs|ForEach-Object{ConvertTo-PosArgument $_}) -join ' ')
    Start-Process -FilePath (Get-PosPowerShell) -ArgumentList ((($startArgs+@('-Resume'))|ForEach-Object{ConvertTo-PosArgument $_}) -join ' ') -WindowStyle Hidden
  }else{$state.status='ready';Write-PosJson $stateFile $state}
  Write-PosUrlShortcut (Get-PosBrowserUrl $pair.serverUrl $pair.storeId $state.printerId)
  Write-PosStep 'Terminal pronto. Abra o atalho POS Loja para usar o destino configurado. Nao e necessario Docker neste caixa.'
  return $state
}
function Install-PosTerminal([string]$Bundle,[switch]$WithPrinter,[string]$PrinterName='',[string]$EnrollmentCode='') {
  $root=Get-PosTerminalRoot;Protect-PosFolder $root
  try{$lock=New-Object IO.FileStream((Join-Path $root 'installer.lock'),[IO.FileMode]::OpenOrCreate,[IO.FileAccess]::ReadWrite,[IO.FileShare]::None)}catch{throw 'Outro instalador Terminal esta ativo.'}
  try{return Install-PosTerminalCore $Bundle ([bool]$WithPrinter) $PrinterName $EnrollmentCode $root}finally{$lock.Dispose()}
}
