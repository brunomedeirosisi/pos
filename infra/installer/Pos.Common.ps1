Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Write-PosJson([string]$Path, $Value) {
  $text = ConvertTo-Json -InputObject $Value -Depth 20
  $temp = $Path + '.tmp'
  [IO.File]::WriteAllText($temp, $text, (New-Object Text.UTF8Encoding($false)))
  Move-Item -LiteralPath $temp -Destination $Path -Force
}
function Read-PosJson([string]$Path) { return (Get-Content -LiteralPath $Path -Raw -Encoding UTF8 | ConvertFrom-Json) }
function Get-PosHash([string]$Path) { return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant() }
function Get-PosOwner { return [Security.Principal.WindowsIdentity]::GetCurrent().User.Value }
function Get-PosInstallRoot { return (Join-Path $env:LOCALAPPDATA 'POSStore') }
function Get-PosTerminalRoot { return (Join-Path $env:LOCALAPPDATA 'POSTerminal') }
function Protect-PosFolder([string]$Path) {
  $null = New-Item -ItemType Directory -Path $Path -Force
  $directory = Get-Item -LiteralPath $Path
  if(($directory.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0){throw 'A pasta privada nao pode ser link/junction.'}
  $acl = $directory.GetAccessControl([Security.AccessControl.AccessControlSections]::Access)
  $acl.SetAccessRuleProtection($true, $false)
  foreach($existing in @($acl.Access)) { $acl.RemoveAccessRuleSpecific($existing) }
  foreach ($id in @((Get-PosOwner), 'S-1-5-18', 'S-1-5-32-544')) {
    $sid = New-Object Security.Principal.SecurityIdentifier($id)
    $rule = New-Object Security.AccessControl.FileSystemAccessRule($sid, 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow')
    $acl.AddAccessRule($rule)
  }
  $directory.SetAccessControl($acl)
}
function Save-PosSecret([string]$Path, $Value) {
  Add-Type -AssemblyName System.Security
  $plain = [Text.Encoding]::UTF8.GetBytes((ConvertTo-Json -InputObject $Value -Depth 10))
  try { $encrypted = [Security.Cryptography.ProtectedData]::Protect($plain, $null, [Security.Cryptography.DataProtectionScope]::CurrentUser); [IO.File]::WriteAllBytes($Path, $encrypted) }
  finally { [Array]::Clear($plain, 0, $plain.Length) }
}
function Read-PosSecret([string]$Path) {
  Add-Type -AssemblyName System.Security
  $plain = [Security.Cryptography.ProtectedData]::Unprotect([IO.File]::ReadAllBytes($Path), $null, [Security.Cryptography.DataProtectionScope]::CurrentUser)
  try { return ([Text.Encoding]::UTF8.GetString($plain) | ConvertFrom-Json) }
  finally { [Array]::Clear($plain, 0, $plain.Length) }
}
function New-PosSecret {
  $bytes = New-Object byte[] 32
  $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
  try { $rng.GetBytes($bytes); return ([BitConverter]::ToString($bytes)).Replace('-', '').ToLowerInvariant() }
  finally { $rng.Dispose() }
}
function Get-PosTokenHash([string]$Token) {
  $sha = [Security.Cryptography.SHA256]::Create()
  try { return ([BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($Token)))).Replace('-', '').ToLowerInvariant() }
  finally { $sha.Dispose() }
}
function Assert-PosPrivateIp([string]$Value) {
  $ip = $null
  if (-not [Net.IPAddress]::TryParse($Value, [ref]$ip) -or $ip.AddressFamily -ne [Net.Sockets.AddressFamily]::InterNetwork) { throw 'Informe um IPv4 privado da rede da loja.' }
  $b = $ip.GetAddressBytes()
  if (-not ($b[0] -eq 10 -or ($b[0] -eq 172 -and $b[1] -ge 16 -and $b[1] -le 31) -or ($b[0] -eq 192 -and $b[1] -eq 168))) { throw 'O instalador aceita apenas IP privado da loja (10/172.16-31/192.168).' }
  if ($ip.ToString() -ne $Value) { throw 'Use IPv4 no formato decimal normalizado.' }
}
function Assert-PosBundle([string]$Directory) {
  if(((Get-Item -LiteralPath $Directory).Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0){throw 'A pasta do pacote nao pode ser link/junction.'}
  $base = [IO.Path]::GetFullPath($Directory).TrimEnd('\') + '\'
  $manifest = Read-PosJson (Join-Path $Directory 'manifest.json')
  if ($manifest.schemaVersion -ne 1 -or $manifest.version -notmatch '^[0-9A-Za-z][0-9A-Za-z.-]{0,79}$') { throw 'Manifesto de pacote invalido.' }
  if($manifest.mode -notin @('Principal','Terminal') -or @($manifest.files).Count -lt 1){throw 'Manifesto sem modo/arquivos validos.'}
  $seen=New-Object 'Collections.Generic.HashSet[string]' ([StringComparer]::OrdinalIgnoreCase)
  foreach ($entry in $manifest.files) {
    if($entry.sha256 -notmatch '^[a-f0-9]{64}$' -or -not $seen.Add($entry.path)){throw 'Hash ou entrada duplicada no manifesto.'}
    $parts=$entry.path.Replace([char]92,[char]47).Split([char]47)
    if ([IO.Path]::IsPathRooted($entry.path) -or $parts -contains '..' -or $parts -contains '.' -or $entry.path.Contains(':')) { throw 'Caminho invalido no pacote.' }
    $file = [IO.Path]::GetFullPath((Join-Path $Directory $entry.path))
    if (-not $file.StartsWith($base, [StringComparison]::OrdinalIgnoreCase)) { throw 'Arquivo fora do pacote.' }
    $cursor = Get-Item -LiteralPath $file
    while ($null -ne $cursor -and $cursor.FullName.Length -ge $base.Length) {
      if (($cursor.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'Links/junctions nao sao aceitos no pacote.' }
      if ($cursor -is [IO.FileInfo]) { $cursor = $cursor.Directory } else { $cursor = $cursor.Parent }
      if ($null -eq $cursor -and $file -eq (Join-Path $Directory $entry.path)) { break }
    }
    if ((Get-PosHash $file) -ne $entry.sha256) { throw ('Checksum divergente: ' + $entry.path) }
  }
  return $manifest
}
function ConvertTo-PosArgument([string]$Value) {
  $builder = New-Object Text.StringBuilder
  $null = $builder.Append([char]34); $slashes = 0
  foreach ($c in $Value.ToCharArray()) {
    if ($c -eq [char]92) { $slashes++; continue }
    if ($c -eq [char]34) { $null = $builder.Append(('\' * ($slashes * 2 + 1))); $null = $builder.Append($c) }
    else { $null = $builder.Append(('\' * $slashes)); $null = $builder.Append($c) }
    $slashes = 0
  }
  $null = $builder.Append(('\' * ($slashes * 2))); $null = $builder.Append([char]34)
  return $builder.ToString()
}
function Invoke-PosProcess([string]$File, [string[]]$Arguments, [int]$TimeoutSeconds = 900) {
  $info = New-Object Diagnostics.ProcessStartInfo
  $info.FileName = $File; $info.Arguments = (($Arguments | ForEach-Object { ConvertTo-PosArgument $_ }) -join ' ')
  $info.UseShellExecute = $false; $info.CreateNoWindow = $true; $info.RedirectStandardOutput = $true; $info.RedirectStandardError = $true
  $process = New-Object Diagnostics.Process; $process.StartInfo = $info
  try {
    $null = $process.Start(); $stdout = $process.StandardOutput.ReadToEndAsync(); $stderr = $process.StandardError.ReadToEndAsync()
    $watch = [Diagnostics.Stopwatch]::StartNew()
    while (-not $process.WaitForExit(200)) {
      if ($watch.Elapsed.TotalSeconds -gt $TimeoutSeconds) { $process.Kill(); throw 'Tempo limite excedido. Confira o diagnostico antes de repetir.' }
      if (Get-Variable -Name PosGuiPump -Scope Global -ErrorAction SilentlyContinue) { & $global:PosGuiPump }
    }
    $text = $stdout.GetAwaiter().GetResult(); $err = $stderr.GetAwaiter().GetResult()
    if ($process.ExitCode -ne 0) { throw ('Comando falhou (' + [IO.Path]::GetFileName($File) + ', codigo ' + $process.ExitCode + '). ' + $err.Substring(0, [Math]::Min(1500,$err.Length))) }
    return $text.Trim()
  } finally { $process.Dispose() }
}
function Get-PosDocker {
  $command = Get-Command docker.exe -ErrorAction SilentlyContinue
  if ($command) { return $command.Source }
  foreach ($candidate in @((Join-Path $env:ProgramFiles 'Docker\Docker\resources\bin\docker.exe'), (Join-Path $env:LOCALAPPDATA 'Programs\DockerDesktop\resources\bin\docker.exe'))) { if (Test-Path -LiteralPath $candidate) { return $candidate } }
  throw 'Docker Desktop nao encontrado. Use Preparar Docker e reinicie o Windows se solicitado.'
}
function Get-PosSettings([string]$Root) {
  $settings = Read-PosJson (Join-Path $Root 'settings.json')
  if ($settings.ownerSid -ne (Get-PosOwner)) { throw 'Entre com a conta Windows que instalou o Principal (credenciais protegidas por DPAPI).' }
  if ($settings.project -notmatch '^pos-store-[a-f0-9]{8}$') { throw 'Identidade do projeto invalida.' }
  return $settings
}
function Invoke-PosCompose([string]$Root, [string[]]$Arguments, [string]$VersionPath = '') {
  $settings = Get-PosSettings $Root
  if (-not $VersionPath) { $VersionPath = Join-Path (Join-Path $Root 'versions') $settings.version }
  $manifest = Assert-PosBundle $VersionPath
  $secret = Read-PosSecret (Join-Path $Root 'secrets.bin')
  $values = @{
    STORE_IP=$settings.serverIp; STORE_ID=$settings.storeId; PRINT_PRINTER_NAME=$settings.printerName;
    COMPANY_NAME=$settings.companyName; COMPANY_ADDRESS=$settings.companyAddress; COMPANY_TAX_ID=$settings.companyTaxId;
    BACKUP_DESTINATION=$settings.backupDestination; POSTGRES_PASSWORD=$secret.database; JWT_SECRET=$secret.jwt;
    METRICS_TOKEN=$secret.metrics; PRINT_AGENT_TOKEN_SHA256=(Get-PosTokenHash $secret.agent);
    API_IMAGE=$manifest.images.api; FRONTEND_IMAGE=$manifest.images.frontend; DB_IMAGE=$manifest.images.db;
    REDIS_IMAGE=$manifest.images.redis; PROXY_IMAGE=$manifest.images.proxy;
    BOOTSTRAP_ADMIN_EMAIL=''; BOOTSTRAP_ADMIN_PASSWORD=''; BOOTSTRAP_ADMIN_FULL_NAME=''
  }
  if ($secret.PSObject.Properties.Name -contains 'bootstrap') {
    $values.BOOTSTRAP_ADMIN_EMAIL=$secret.bootstrap.email; $values.BOOTSTRAP_ADMIN_PASSWORD=$secret.bootstrap.password; $values.BOOTSTRAP_ADMIN_FULL_NAME=$secret.bootstrap.name
  }
  $previous = @{}
  try {
    foreach ($key in $values.Keys) { $previous[$key]=[Environment]::GetEnvironmentVariable($key,'Process'); [Environment]::SetEnvironmentVariable($key,[string]$values[$key],'Process') }
    return Invoke-PosProcess (Get-PosDocker) (@('compose','--project-directory',$VersionPath,'--env-file',(Join-Path $VersionPath 'empty.env'),'-p',$settings.project,'-f',(Join-Path $VersionPath 'store.compose.yml')) + $Arguments)
  } finally { foreach ($key in $previous.Keys) { [Environment]::SetEnvironmentVariable($key,$previous[$key],'Process') } }
}
function Test-PosStore([string]$Url, [string]$StoreId) {
  $uri = [Uri]$Url
  if ($uri.Scheme -ne 'https' -or $uri.UserInfo -or $uri.AbsolutePath -ne '/') { throw 'Endereco HTTPS da loja invalido.' }
  $previousProtocol=[Net.ServicePointManager]::SecurityProtocol
  try {
    [Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12
    for($attempt=0;$attempt -lt 10;$attempt++) {
      try {
        $result = Invoke-RestMethod -Uri ($Url.TrimEnd('/') + '/api/v1/store-info') -TimeoutSec 5
        break
      } catch {
        if($attempt -eq 9){throw}
        Start-Sleep -Seconds 1
        if(Get-Variable PosGuiPump -Scope Global -ErrorAction SilentlyContinue){& $global:PosGuiPump}
      }
    }
  } finally {[Net.ServicePointManager]::SecurityProtocol=$previousProtocol}
  if ($result.store_id -ne $StoreId) { throw 'O servidor respondeu com outra identidade de loja.' }
}
function New-PosShortcut([string]$Path, [string]$Target, [string]$Arguments = '') {
  $shell = New-Object -ComObject WScript.Shell; $shortcut = $shell.CreateShortcut($Path)
  $shortcut.TargetPath=$Target; $shortcut.Arguments=$Arguments; $shortcut.WorkingDirectory=[IO.Path]::GetDirectoryName($Target); $shortcut.WindowStyle=7; $shortcut.Save()
}
function Write-PosUrlShortcut([string]$Url) {
  $shortcut=Join-Path ([Environment]::GetFolderPath('Desktop')) 'POS Loja.url'
  if(Test-Path -LiteralPath $shortcut){
    $line=Get-Content -LiteralPath $shortcut|Where-Object {$_ -like 'URL=*'}|Select-Object -First 1
    if(-not $line -or ([Uri]$line.Substring(4)).GetLeftPart([UriPartial]::Authority) -ne ([Uri]$Url).GetLeftPart([UriPartial]::Authority)){throw 'Ja existe um atalho POS Loja para outro endereco. Preserve ou renomeie esse atalho antes.'}
  }
  [IO.File]::WriteAllText($shortcut,('[InternetShortcut]'+[Environment]::NewLine+'URL='+$Url+[Environment]::NewLine))
}
function Get-PosPowerShell { return (Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe') }
function Import-PosCertificate([string]$Path, [string]$ExpectedHash) {
  if ((Get-PosHash $Path) -ne $ExpectedHash) { throw 'Certificado divergente do pacote de pareamento.' }
  $cert = New-Object Security.Cryptography.X509Certificates.X509Certificate2($Path)
  if ($cert.NotAfter -lt (Get-Date)) { throw 'Certificado expirado.' }
  $null = Import-Certificate -FilePath $Path -CertStoreLocation 'Cert:\CurrentUser\Root'
  return $cert.Thumbprint
}
