param([Parameter(Mandatory=$true)][string]$NodePath)
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'Pos.Common.ps1')
. (Join-Path $PSScriptRoot 'Pos.Cloud.ps1')
Add-Type -AssemblyName System.Net.Http
$directory=Join-Path ([IO.Path]::GetTempPath()) ('pos-cloud-https-'+[Guid]::NewGuid().ToString('N'))
Protect-PosFolder $directory
$fixture=$null;$rsa=$null;$certificate=$null;$script:passed=0
function Check($Condition,[string]$Message){if(-not $Condition){throw ('Falha: '+$Message)};$script:passed++}
function Reject($Action,[string]$Message){$failed=$false;try{& $Action|Out-Null}catch{$failed=$true};Check $failed $Message}
function Base64Url([byte[]]$Bytes){return [Convert]::ToBase64String($Bytes).TrimEnd('=').Replace('+','-').Replace('/','_')}
try {
  $rsa=[Security.Cryptography.RSA]::Create(2048)
  if($rsa.PSObject.Properties['PersistKeyInCsp']){$rsa.PersistKeyInCsp=$false}
  $request=[Security.Cryptography.X509Certificates.CertificateRequest]::new('CN=loja.example.com',$rsa,[Security.Cryptography.HashAlgorithmName]::SHA256,[Security.Cryptography.RSASignaturePadding]::Pkcs1)
  $san=New-Object Security.Cryptography.X509Certificates.SubjectAlternativeNameBuilder;$san.AddDnsName('loja.example.com');$request.CertificateExtensions.Add($san.Build())
  $certificate=$request.CreateSelfSigned([DateTimeOffset]::UtcNow.AddMinutes(-5),[DateTimeOffset]::UtcNow.AddDays(1))
  $parameters=$rsa.ExportParameters($true)
  $storeId=[Guid]::NewGuid().ToString();$printerId=[Guid]::NewGuid().ToString()
  Write-PosJson (Join-Path $directory 'fixture.json') @{certificate=[Convert]::ToBase64String($certificate.RawData);storeId=$storeId;printerId=$printerId;key=@{kty='RSA';n=(Base64Url $parameters.Modulus);e=(Base64Url $parameters.Exponent);d=(Base64Url $parameters.D);p=(Base64Url $parameters.P);q=(Base64Url $parameters.Q);dp=(Base64Url $parameters.DP);dq=(Base64Url $parameters.DQ);qi=(Base64Url $parameters.InverseQ)}}
  $args=@((Join-Path $PSScriptRoot 'cloud-https-fixture.mjs'),$directory)
  $fixture=Start-Process -FilePath $NodePath -ArgumentList (($args|ForEach-Object{ConvertTo-PosArgument $_}) -join ' ') -WindowStyle Hidden -PassThru
  for($i=0;$i -lt 100;$i++){if(Test-Path -LiteralPath (Join-Path $directory 'ready.json')){break};if($fixture.HasExited){throw 'Fixture HTTPS nao iniciou.'};Start-Sleep -Milliseconds 100}
  $ready=Read-PosJson (Join-Path $directory 'ready.json')
  Add-Type -ReferencedAssemblies ([Net.Http.HttpClient].Assembly.Location) -TypeDefinition @'
using System;
using System.Net;
using System.Net.Http;
using System.Net.Security;
using System.Security.Cryptography.X509Certificates;
public static class PosFixtureTls {
  public static int Port;
  public static string Thumbprint;
  public static bool TrustFixture;
  public static HttpClientHandler Create() {
    var handler=new HttpClientHandler { Proxy=new WebProxy("http://127.0.0.1:"+Port), UseProxy=true };
    if(TrustFixture) handler.ServerCertificateCustomValidationCallback=(request,cert,chain,errors)=>{
      // Trust exactly this ephemeral test leaf, including its hostname and validity.
      // This callback exists only in the test process; production uses system trust.
      if(cert==null || cert.Thumbprint!=Thumbprint || cert.NotBefore.ToUniversalTime()>DateTime.UtcNow || cert.NotAfter.ToUniversalTime()<DateTime.UtcNow) return false;
      return (errors & SslPolicyErrors.RemoteCertificateNameMismatch)==0 && (errors & SslPolicyErrors.RemoteCertificateNotAvailable)==0;
    };
    return handler;
  }
}
'@
  [PosFixtureTls]::Port=$ready.proxyPort;[PosFixtureTls]::Thumbprint=$certificate.Thumbprint
  function New-PosCloudHandler {return [PosFixtureTls]::Create()}
  $token=New-PosSecret;$body=@{code=('a'*48);token=$token}
  Reject {Invoke-PosCloudJson 'https://loja.example.com' '/api/v1/print-agent/enroll' $body} 'Certificado nao confiavel e recusado pela validacao padrao'
  Check (-not (Test-Path -LiteralPath (Join-Path $directory 'requests.jsonl'))) 'Falha TLS ocorre antes de transmitir codigo/token'
  [PosFixtureTls]::TrustFixture=$true
  $result=Invoke-PosCloudJson 'https://loja.example.com' '/api/v1/store-info'
  Check ($result.store_id -eq $storeId) 'HTTP real com TLS e identidade correta'
  Test-PosCloudStore 'https://loja.example.com' $storeId $true;Check $true 'Validacao real de UUID e modo de fila'
  $before=@(Get-Content -LiteralPath (Join-Path $directory 'requests.jsonl')).Count
  Reject {Invoke-PosCloudJson 'https://other.example.com' '/api/v1/print-agent/enroll' $body} 'Nome TLS divergente recusado mesmo com certificado de teste conhecido'
  Check (@(Get-Content -LiteralPath (Join-Path $directory 'requests.jsonl')).Count -eq $before) 'Nome divergente nao recebe credenciais'
  $paired=Invoke-PosCloudJson 'https://loja.example.com' '/api/v1/print-agent/enroll' $body
  Check ($paired.printer_id -eq $printerId) 'POST HTTPS real de pareamento'
  foreach($mode in @('redirect','large','html','invalid-json')){Reject {Invoke-PosCloudJson 'https://loja.example.com' '/api/v1/print-agent/enroll' $body @{'x-test-mode'=$mode}} ('Resposta '+$mode+' recusada')}
  $message=''
  try{Invoke-PosCloudJson 'https://loja.example.com' '/api/v1/print-agent/enroll' $body @{'x-test-mode'='forbidden'}|Out-Null}catch{$message=$_.Exception.Message}
  Check ($message -match 'HTTP 403' -and -not $message.Contains($token)) 'Mensagem de erro nao ecoa token devolvido pelo servidor'
  $lines=@(Get-Content -LiteralPath (Join-Path $directory 'requests.jsonl')|ForEach-Object{ConvertFrom-Json $_})
  Check (@($lines|Where-Object path -eq '/sink').Count -eq 0) 'Redirecionamento nao recebeu nenhum pedido ou credencial'
  Check (@($lines|Where-Object tls -ne 'TLSv1.2').Count -eq 0) 'Todas as chamadas negociaram TLS 1.2'
  Check ($null -eq [Net.ServicePointManager]::ServerCertificateValidationCallback) 'Nenhuma validacao TLS global foi alterada'
  @{passed=$script:passed;failed=0;transport='real HTTPS through loopback CONNECT proxy';windowsCertificateTrustChanged=$false;testTrust='per-handler exact ephemeral certificate pin plus hostname/validity';credentialsLeakedToRedirect=$false}|ConvertTo-Json -Compress
}finally{
  if($null -ne $fixture){[IO.File]::WriteAllText((Join-Path $directory 'stop'),'stop');if(-not $fixture.WaitForExit(5000)){$fixture.Kill()};$fixture.Dispose()}
  if($null -ne $certificate){$certificate.Dispose()};if($null -ne $rsa){$rsa.Dispose()}
  $full=[IO.Path]::GetFullPath($directory);$temp=[IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd([char]92)+[char]92
  if(-not $full.StartsWith($temp,[StringComparison]::OrdinalIgnoreCase) -or [IO.Path]::GetFileName($full) -notlike 'pos-cloud-https-*'){throw 'Destino de limpeza inesperado.'}
  Remove-Item -LiteralPath $full -Recurse -Force
}
