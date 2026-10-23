param([Parameter(Mandatory=$true)][string]$Address,[Parameter(Mandatory=$true)][string]$Project,[switch]$Remove)
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'Pos.Common.ps1')
Assert-PosPrivateIp $Address
if($Project -notmatch '^pos-store-[a-f0-9]{8}$'){throw 'Projeto invalido.'}
$identity=[Security.Principal.WindowsIdentity]::GetCurrent()
$principal=New-Object Security.Principal.WindowsPrincipal($identity)
if(-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)){throw 'Apenas este auxiliar exige elevacao.'}
$name='POS-HTTPS-'+$Project
if($Remove){Get-NetFirewallRule -Name $name -ErrorAction SilentlyContinue | Remove-NetFirewallRule;exit 0}
$interface=Get-NetIPAddress -AddressFamily IPv4 | Where-Object IPAddress -eq $Address | Select-Object -First 1
if(-not $interface){throw 'IP nao pertence a esta maquina.'}
if((Get-NetConnectionProfile -InterfaceIndex $interface.InterfaceIndex).NetworkCategory -ne 'Private'){throw 'A rede deve ser Privada.'}
Get-NetFirewallRule -Name $name -ErrorAction SilentlyContinue | Remove-NetFirewallRule
$null=New-NetFirewallRule -Name $name -DisplayName ('POS HTTPS '+$Project) -Group 'POS Loja' -Direction Inbound -Action Allow -Protocol TCP -LocalPort 443 -LocalAddress $Address -RemoteAddress LocalSubnet -Profile Private
