function Assert-PosCloudOrigin([string]$Value) {
  if([string]::IsNullOrWhiteSpace($Value) -or $Value.Length -gt 2048 -or $Value -match '\s|[\\#?%]' -or $Value -notmatch '^https://[^/]+/?$'){throw 'Informe a origem HTTPS publica, sem caminho, parametros, fragmentos ou credenciais.'}
  $uri=$null
  if(-not [Uri]::TryCreate($Value,[UriKind]::Absolute,[ref]$uri) -or $uri.Scheme -ne 'https' -or $uri.Port -ne 443 -or $uri.UserInfo -or $uri.AbsolutePath -ne '/' -or $uri.Query -or $uri.Fragment){throw 'Use HTTPS na porta 443 e somente o dominio da aplicacao.'}
  $hostName=$uri.DnsSafeHost.ToLowerInvariant()
  $ip=$null
  if([Net.IPAddress]::TryParse($hostName,[ref]$ip) -or $uri.HostNameType -ne [UriHostNameType]::Dns -or $hostName.Length -gt 253 -or $hostName.EndsWith('.') -or $hostName -notmatch '^[a-z0-9]([a-z0-9.-]*[a-z0-9])?\.[a-z]{2,63}$' -or $hostName -match '(^|\.)(localhost|local|localdomain|internal|lan|home|invalid|test)$'){throw 'O Modo Nuvem requer um nome DNS publico completo, nao um IP ou nome de rede local.'}
  foreach($label in $hostName.Split('.')){if($label.Length -gt 63 -or $label -notmatch '^[a-z0-9]([a-z0-9-]*[a-z0-9])?$'){throw 'Dominio publico invalido.'}}
  return ('https://'+$hostName)
}
function New-PosCloudHandler {
  Add-Type -AssemblyName System.Net.Http
  return (New-Object Net.Http.HttpClientHandler)
}
function Invoke-PosCloudJson([string]$Origin,[string]$ApiPath,$Body=$null,$Headers=@{}) {
  $base=Assert-PosCloudOrigin $Origin
  if($ApiPath -notin @('/api/v1/store-info','/api/v1/print-agent/enroll','/api/v1/print-agent/status')){throw 'Operacao de nuvem nao autorizada.'}
  if($null -ne [Net.ServicePointManager]::ServerCertificateValidationCallback){throw 'A validacao TLS global foi personalizada. Abra o instalador pelo executavel oficial em um processo novo.'}
  Add-Type -AssemblyName System.Net.Http
  $handler=New-PosCloudHandler
  $handler.AllowAutoRedirect=$false;$handler.UseCookies=$false;$handler.UseDefaultCredentials=$false;$handler.Credentials=$null
  $handler.SslProtocols=[Security.Authentication.SslProtocols]::Tls12
  $handler.CheckCertificateRevocationList=$true
  $client=New-Object Net.Http.HttpClient($handler)
  $client.Timeout=[TimeSpan]::FromSeconds(15);$client.MaxResponseContentBufferSize=65536
  $request=$null;$response=$null
  $message='Nao foi possivel validar o servidor HTTPS. Confira dominio, internet, certificado publico e horario do Windows.'
  try {
    $method=[Net.Http.HttpMethod]::Get;if($null -ne $Body){$method=[Net.Http.HttpMethod]::Post}
    $request=New-Object Net.Http.HttpRequestMessage($method,($base+$ApiPath))
    $request.Headers.Accept.ParseAdd('application/json')
    foreach($key in $Headers.Keys){$null=$request.Headers.TryAddWithoutValidation([string]$key,[string]$Headers[$key])}
    if($null -ne $Body){
      $json=ConvertTo-Json -InputObject $Body -Compress
      if([Text.Encoding]::UTF8.GetByteCount($json) -gt 8192){$message='Dados de pareamento maiores que o permitido.';throw $message}
      $request.Content=New-Object Net.Http.StringContent($json,[Text.Encoding]::UTF8,'application/json')
    }
    $response=$client.SendAsync($request).GetAwaiter().GetResult()
    $code=[int]$response.StatusCode
    if($code -ge 300 -and $code -lt 400){$message='O servidor respondeu com redirecionamento. Informe a URL HTTPS final da aplicacao; credenciais nao serao reenviadas.';throw $message}
    if(-not $response.IsSuccessStatusCode){$message=('Servidor respondeu HTTP '+$code+'. Confira o endereco, a publicacao e a validade do codigo de pareamento.');throw $message}
    $media=$response.Content.Headers.ContentType
    if($null -eq $media -or $media.MediaType -notmatch '^application/(json|[a-z0-9.+-]+\+json)$'){$message='O servidor nao respondeu JSON. Confira a URL da aplicacao e o proxy.';throw $message}
    $text=$response.Content.ReadAsStringAsync().GetAwaiter().GetResult()
    try{return ConvertFrom-Json $text}catch{$message='Resposta JSON invalida do servidor.';throw $message}
  } catch {throw $message}
  finally {if($null -ne $response){$response.Dispose()};if($null -ne $request){$request.Dispose()};$client.Dispose()}
}
function Test-PosCloudStore([string]$Url,[string]$StoreId,[bool]$RequireQueue=$false) {
  $expected=[Guid]::Empty
  if(-not [Guid]::TryParse($StoreId,[ref]$expected) -or $expected -eq [Guid]::Empty){throw 'Informe o ID UUID da loja fornecido pelo responsavel pelo servidor.'}
  $result=Invoke-PosCloudJson $Url '/api/v1/store-info'
  if($null -eq $result -or $null -eq $result.PSObject.Properties['store_id'] -or $result.store_id -ne $expected.ToString()){throw 'O servidor respondeu com outra identidade de loja. Nenhum pareamento foi enviado.'}
  if($RequireQueue -and ($null -eq $result.PSObject.Properties['print_mode'] -or $result.print_mode -ne 'queue')){throw 'O servidor precisa habilitar PRINT_MODE=queue antes de parear impressoras.'}
}
function Set-PosTerminalTlsEnvironment($Info,$State,[string]$Root) {
  $Info.EnvironmentVariables['NODE_TLS_REJECT_UNAUTHORIZED']='1'
  $cloud=($null -ne $State.PSObject.Properties['connectionMode']) -and $State.connectionMode -eq 'cloud'
  if($cloud){$Info.EnvironmentVariables.Remove('NODE_EXTRA_CA_CERTS')}
  else{$Info.EnvironmentVariables['NODE_EXTRA_CA_CERTS']=Join-Path $Root 'pki\root.crt'}
}

function Assert-PosLocalPrincipalStopped {
  $principalRoot=Get-PosInstallRoot
  if(-not (Test-Path -LiteralPath (Join-Path $principalRoot 'settings.json'))){return}
  if(-not (Test-Path -LiteralPath (Join-Path $principalRoot 'stop.request'))){throw 'Existe um Principal local neste perfil. Conclua a migracao, confira filas e execute Desativar-POS antes de habilitar impressao na nuvem.'}
  try{$probe=New-Object IO.FileStream((Join-Path $principalRoot 'supervisor.lock'),[IO.FileMode]::OpenOrCreate,[IO.FileAccess]::ReadWrite,[IO.FileShare]::None);$probe.Dispose()}catch{throw 'O supervisor do Principal local ainda esta ativo. Aguarde sua parada antes de usar o agente da nuvem.'}
}
function Copy-PosCloudClientRelease([string]$Source,[string]$Destination,$SourceManifest) {
  foreach($name in @('Instalar-POS.exe','Instalar-POS.ps1','Pos.Common.ps1','Pos.Install.ps1','Pos.Terminal.ps1','Pos.Cloud.ps1','Start-Terminal.ps1','Parar-Terminal.ps1','Diagnosticar-Terminal.ps1')){Copy-Item -LiteralPath (Join-Path $Source $name) -Destination (Join-Path $Destination $name) -Force}
  foreach($folder in @('runtime','agent','documentacao')){Copy-Item -LiteralPath (Join-Path $Source $folder) -Destination $Destination -Recurse -Force}
  [IO.File]::WriteAllText((Join-Path $Destination 'LEIA-ME.txt'),'POS Nuvem: cliente Windows. Leia documentacao/NUVEM.md. O servidor da loja deve estar publicado com HTTPS valido.')
  $files=@(Get-ChildItem -LiteralPath $Destination -Recurse -File|Where-Object {$_.FullName -ne (Join-Path $Destination 'manifest.json')}|ForEach-Object{@{path=$_.FullName.Substring($Destination.Length+1).Replace('\','/');sha256=(Get-PosHash $_.FullName)}})
  Write-PosJson (Join-Path $Destination 'manifest.json') @{schemaVersion=1;mode='Cloud';version=$SourceManifest.version;files=$files}
}
