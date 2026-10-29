[CmdletBinding()]
param([ValidateSet('Principal','Terminal','TerminalPrinter','Cloud','CloudPrinter')][string]$Mode='', [switch]$ValidateOnly, [switch]$UiCheck)
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'Pos.Install.ps1')
$manifest=Assert-PosBundle $PSScriptRoot
if($ValidateOnly){@{valid=$true;version=$manifest.version;mode=$manifest.mode;files=$manifest.files.Count}|ConvertTo-Json -Compress;exit 0}
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
[Windows.Forms.Application]::EnableVisualStyles()
$form=New-Object Windows.Forms.Form
$form.Text='POS Loja - Instalador';$form.Size=New-Object Drawing.Size(760,845);$form.StartPosition='CenterScreen';$form.Font=New-Object Drawing.Font('Segoe UI',9);$form.AutoScroll=$true
$heading=New-Object Windows.Forms.Label;$heading.Text='Dois caixas Windows, uma loja e impressoras por caixa';$heading.Location=New-Object Drawing.Point(20,15);$heading.Size=New-Object Drawing.Size(700,28);$heading.Font=New-Object Drawing.Font('Segoe UI',13);$form.Controls.Add($heading)
$modeBox=New-Object Windows.Forms.ComboBox;$modeBox.DropDownStyle='DropDownList';$modeBox.Location=New-Object Drawing.Point(225,55);$modeBox.Width=440
$modeNames=@{Principal='Principal';Terminal='Terminal';TerminalPrinter='Terminal com impressora';Cloud='Nuvem';CloudPrinter='Nuvem com impressora'}
if($manifest.mode -eq 'Principal'){$null=$modeBox.Items.Add('Principal')}
if($manifest.mode -ne 'Cloud'){$null=$modeBox.Items.Add('Terminal');$null=$modeBox.Items.Add('Terminal com impressora')}
$null=$modeBox.Items.Add('Nuvem');$null=$modeBox.Items.Add('Nuvem com impressora')
$modeBox.SelectedIndex=0
if($Mode){if(-not $modeBox.Items.Contains($modeNames[$Mode])){throw 'Modo nao disponivel neste pacote.'};$modeBox.SelectedItem=$modeNames[$Mode]}
$form.Controls.Add($modeBox)
$modeLabel=New-Object Windows.Forms.Label;$modeLabel.Text='Modo de instalacao';$modeLabel.Location=New-Object Drawing.Point(20,58);$modeLabel.Width=200;$form.Controls.Add($modeLabel)
$fields=@{};$labels=@{};$fieldY=@{}
function Add-Field([string]$Key,[string]$Caption,[int]$Y,[bool]$Secret=$false){
  $fieldY[$Key]=$Y
  $label=New-Object Windows.Forms.Label;$label.Text=$Caption;$label.Location=New-Object Drawing.Point(20,($Y+3));$label.Size=New-Object Drawing.Size(200,25);$form.Controls.Add($label);$labels[$Key]=$label
  $box=New-Object Windows.Forms.TextBox;$box.Location=New-Object Drawing.Point(225,$Y);$box.Size=New-Object Drawing.Size(440,25);$box.UseSystemPasswordChar=$Secret;$form.Controls.Add($box);$fields[$Key]=$box
}
Add-Field 'serverIp' 'IP reservado do Caixa 1' 95
Add-Field 'companyName' 'Nome da empresa' 130
Add-Field 'companyAddress' 'Endereco da empresa' 165
Add-Field 'companyTaxId' 'CNPJ / identificacao' 200
Add-Field 'printerName' 'Fila da impressora Windows' 235
Add-Field 'backupDestination' 'Pasta externa de backup' 270
Add-Field 'adminName' 'Nome do administrador' 305
Add-Field 'adminEmail' 'E-mail do administrador' 340
Add-Field 'adminPassword' 'Senha inicial (12+ caracteres)' 375 $true
Add-Field 'terminalPackage' 'Pasta Terminal-POS recebida' 410
Add-Field 'enrollmentCode' 'Codigo de pareamento' 445 $true
Add-Field 'cloudUrl' 'URL HTTPS da aplicacao' 95
Add-Field 'cloudStoreId' 'ID UUID da loja' 130
$fields.terminalPackage.Text=$PSScriptRoot
try{$fields.serverIp.Text=(Get-NetIPAddress -AddressFamily IPv4 | Where-Object {$_.IPAddress -match '^(192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[01])\.)'}|Select-Object -First 1).IPAddress}catch{}
try{$fields.printerName.Text=(Get-Printer | Select-Object -First 1).Name}catch{}
$existingPath=Join-Path $env:LOCALAPPDATA 'POSStore\settings.json'
if(Test-Path -LiteralPath $existingPath){try{$saved=Read-PosJson $existingPath;foreach($key in @('serverIp','companyName','companyAddress','companyTaxId','printerName','backupDestination')){$fields[$key].Text=[string]$saved.$key}}catch{}}
$terminalStatePath=Join-Path $env:LOCALAPPDATA 'POSTerminal\terminal.json'
if(Test-Path -LiteralPath $terminalStatePath){try{$terminalState=Read-PosJson $terminalStatePath;if(($terminalState.PSObject.Properties.Name -contains 'withPrinter') -and $terminalState.withPrinter){$fields.printerName.Text=$terminalState.printerName;if(-not $Mode -and $manifest.mode -eq 'Terminal'){$modeBox.SelectedItem='Terminal com impressora'}}}catch{}}
if(Test-Path -LiteralPath $terminalStatePath){try{
  $cloudState=Read-PosJson $terminalStatePath
  if(($cloudState.PSObject.Properties.Name -contains 'connectionMode') -and $cloudState.connectionMode -eq 'cloud'){
    $fields.cloudUrl.Text=$cloudState.serverUrl;$fields.cloudStoreId.Text=$cloudState.storeId
    if(-not $Mode){if($cloudState.withPrinter){$modeBox.SelectedItem='Nuvem com impressora'}else{$modeBox.SelectedItem='Nuvem'}}
  }
}catch{}}
$browse=New-Object Windows.Forms.Button;$browse.Text='...';$browse.Location=New-Object Drawing.Point(675,270);$browse.Width=35;$form.Controls.Add($browse)
$browse.Add_Click({$dialog=New-Object Windows.Forms.FolderBrowserDialog;if($dialog.ShowDialog() -eq 'OK'){$fields.backupDestination.Text=$dialog.SelectedPath}})
$testPrinter=New-Object Windows.Forms.Button;$testPrinter.Text='Teste';$testPrinter.Location=New-Object Drawing.Point(675,235);$testPrinter.Width=40;$form.Controls.Add($testPrinter)
$testPrinter.Add_Click({try{if(-not (Get-Printer | Where-Object Name -eq $fields.printerName.Text)){throw 'Fila de impressora nao encontrada.'};('TESTE DE IMPRESSAO POS - '+(Get-Date).ToString('s'))|Out-Printer -Name $fields.printerName.Text;[Windows.Forms.MessageBox]::Show('Teste enviado ao Windows. Confira a saida no papel.','Teste da impressora')|Out-Null}catch{[Windows.Forms.MessageBox]::Show($_.Exception.Message,'Falha no teste')|Out-Null}})
$pairBrowse=New-Object Windows.Forms.Button;$pairBrowse.Text='...';$pairBrowse.Location=New-Object Drawing.Point(675,410);$pairBrowse.Width=35;$form.Controls.Add($pairBrowse)
$pairBrowse.Add_Click({$dialog=New-Object Windows.Forms.FolderBrowserDialog;if($dialog.ShowDialog() -eq 'OK'){$fields.terminalPackage.Text=$dialog.SelectedPath}})
$external=New-Object Windows.Forms.CheckBox;$external.Text='Confirmei: o backup fica em outro dispositivo/computador, fora do disco do Caixa 1.';$external.Location=New-Object Drawing.Point(20,485);$external.Size=New-Object Drawing.Size(700,25);$form.Controls.Add($external)
$docker=New-Object Windows.Forms.CheckBox;$docker.Text='Preparar Docker Desktop se ausente. Li e aceito os termos do fornecedor.';$docker.Location=New-Object Drawing.Point(20,515);$docker.Size=New-Object Drawing.Size(700,25);$form.Controls.Add($docker)
$link=New-Object Windows.Forms.LinkLabel;$link.Text='Requisitos e termos do Docker Desktop';$link.Location=New-Object Drawing.Point(225,545);$link.Size=New-Object Drawing.Size(420,25);$form.Controls.Add($link);$link.Add_LinkClicked({Start-Process 'https://docs.docker.com/desktop/setup/install/windows-install/'})
$notice=New-Object Windows.Forms.Label;$notice.Text='O instalador confiara no certificado HTTPS da loja para este usuario. No Principal, o Windows pedira permissao para liberar somente HTTPS na rede privada. Nenhum seed de vendas sera instalado.';$notice.Location=New-Object Drawing.Point(20,575);$notice.Size=New-Object Drawing.Size(690,48);$form.Controls.Add($notice)
$status=New-Object Windows.Forms.TextBox;$status.Multiline=$true;$status.ReadOnly=$true;$status.ScrollBars='Vertical';$status.Location=New-Object Drawing.Point(20,635);$status.Size=New-Object Drawing.Size(690,100);$form.Controls.Add($status)
$button=New-Object Windows.Forms.Button;$button.Text='Instalar / Reparar';$button.Location=New-Object Drawing.Point(480,750);$button.Size=New-Object Drawing.Size(230,35);$form.Controls.Add($button)
$global:PosGuiPump={ [Windows.Forms.Application]::DoEvents() }
$global:PosProgress={param($text)$status.AppendText($text+[Environment]::NewLine);$status.SelectionStart=$status.Text.Length;$status.ScrollToCaret();[Windows.Forms.Application]::DoEvents()}
$script:busy=$false
$updateMode={
  $principal=$modeBox.SelectedItem -eq 'Principal'
  $cloud=$modeBox.SelectedItem -in @('Nuvem','Nuvem com impressora')
  $withPrinter=$modeBox.SelectedItem -in @('Terminal com impressora','Nuvem com impressora')
  foreach($key in $fields.Keys){
    $visible=if($cloud){$key -in @('cloudUrl','cloudStoreId') -or ($withPrinter -and $key -in @('printerName','enrollmentCode'))}else{$key -notin @('cloudUrl','cloudStoreId')}
    $fields[$key].Visible=$visible;$labels[$key].Visible=$visible
    $fields[$key].Location=New-Object Drawing.Point(225,$fieldY[$key]);$labels[$key].Location=New-Object Drawing.Point(20,($fieldY[$key]+3))
    $fields[$key].Enabled=$principal
  }
  $fields.cloudUrl.Enabled=$cloud;$fields.cloudStoreId.Enabled=$cloud
  $fields.printerName.Enabled=$principal -or $withPrinter;$fields.enrollmentCode.Enabled=$withPrinter
  $fields.terminalPackage.Enabled=-not $principal -and -not $cloud
  $browse.Visible=-not $cloud;$browse.Enabled=$principal
  $pairBrowse.Visible=-not $cloud;$pairBrowse.Enabled=-not $principal
  $testPrinter.Visible=$principal -or $withPrinter;$testPrinter.Enabled=$principal -or $withPrinter
  $external.Visible=-not $cloud;$external.Enabled=$principal;$docker.Visible=-not $cloud;$docker.Enabled=$principal;$link.Visible=-not $cloud;$link.Enabled=$principal
  if($cloud){
    $fields.printerName.Location=New-Object Drawing.Point(225,165);$labels.printerName.Location=New-Object Drawing.Point(20,168);$testPrinter.Location=New-Object Drawing.Point(675,165)
    $fields.enrollmentCode.Location=New-Object Drawing.Point(225,200);$labels.enrollmentCode.Location=New-Object Drawing.Point(20,203)
    $notice.Text='Use a URL e o ID da loja fornecidos pelo responsavel pelo servidor. HTTPS publico sera validado. Este modo nao instala Docker, banco ou certificados e nao altera firewall.'
    $notice.Location=New-Object Drawing.Point(20,245);$status.Location=New-Object Drawing.Point(20,310);$button.Location=New-Object Drawing.Point(480,425);$form.Size=New-Object Drawing.Size(760,520)
  }else{
    $testPrinter.Location=New-Object Drawing.Point(675,235)
    $notice.Text='Na rede local, confirme o certificado HTTPS da loja. O Principal pedira permissao para liberar HTTPS apenas na rede privada. Nenhum seed de vendas sera instalado.'
    $notice.Location=New-Object Drawing.Point(20,575);$status.Location=New-Object Drawing.Point(20,635);$button.Location=New-Object Drawing.Point(480,750);$form.Size=New-Object Drawing.Size(760,845)
  }
}
$modeBox.Add_SelectedIndexChanged($updateMode);& $updateMode
$form.Add_FormClosing({param($sender,$event)if($script:busy){$event.Cancel=$true}})
$button.Add_Click({
  $button.Enabled=$false;$modeBox.Enabled=$false;$script:busy=$true
  foreach($field in $fields.Values){$field.Enabled=$false};$browse.Enabled=$false;$pairBrowse.Enabled=$false;$testPrinter.Enabled=$false;$external.Enabled=$false;$docker.Enabled=$false
  try {
    if($modeBox.SelectedItem -in @('Nuvem','Nuvem com impressora')){
      $withPrinter=$modeBox.SelectedItem -eq 'Nuvem com impressora'
      $null=Install-PosTerminal $PSScriptRoot -ConnectionMode cloud -ServerUrl $fields.cloudUrl.Text.Trim() -StoreId $fields.cloudStoreId.Text.Trim() -WithPrinter:$withPrinter -PrinterName $fields.printerName.Text -EnrollmentCode $fields.enrollmentCode.Text.Trim()
      $fields.enrollmentCode.Clear()
    }elseif($modeBox.SelectedItem -ne 'Principal'){
      $null=Assert-PosBundle $fields.terminalPackage.Text
      $pair=Read-PosJson (Join-Path $fields.terminalPackage.Text 'pairing.json')
      $answer=[Windows.Forms.MessageBox]::Show(('Servidor: '+$pair.serverUrl+[Environment]::NewLine+'Certificado SHA256: '+$pair.certificateSha256+[Environment]::NewLine+'Este pacote veio do seu Caixa 1? Confiar no certificado e instalar o Terminal?'),'Pareamento da loja','YesNo','Question')
      if($answer -ne 'Yes'){return}
      $withPrinter=$modeBox.SelectedItem -eq 'Terminal com impressora'
      $null=Install-PosTerminal $fields.terminalPackage.Text -WithPrinter:$withPrinter -PrinterName $fields.printerName.Text -EnrollmentCode $fields.enrollmentCode.Text
      $fields.enrollmentCode.Clear()
    }else{
      $options=@{};foreach($key in @('serverIp','companyName','companyAddress','companyTaxId','printerName','backupDestination','adminName','adminEmail','adminPassword')){$options[$key]=$fields[$key].Text}
      $options.prepareDocker=$docker.Checked;$options.backupIsExternal=$external.Checked
      $null=Install-PosPrincipal $PSScriptRoot $options
      $fields.adminPassword.Clear();$options.adminPassword=''
    }
    [Windows.Forms.MessageBox]::Show('Configuracao concluida. Consulte o guia para testar os dois caixas e uma impressao real.','POS Loja','OK','Information')|Out-Null
  }catch{
    & $global:PosProgress ('Falha: '+$_.Exception.Message)
    [Windows.Forms.MessageBox]::Show($_.Exception.Message,'Instalacao pendente - dados preservados','OK','Error')|Out-Null
  }finally{$script:busy=$false;$button.Enabled=$true;$modeBox.Enabled=$true;& $updateMode}
})
if($UiCheck){@{uiReady=$true;mode=$modeBox.SelectedItem;controls=$form.Controls.Count;cloudFieldsEnabled=($fields.cloudUrl.Enabled -and $fields.cloudStoreId.Enabled);printerEnabled=$fields.printerName.Enabled}|ConvertTo-Json -Compress;$form.Dispose();Remove-Variable PosGuiPump,PosProgress -Scope Global -ErrorAction SilentlyContinue;exit 0}
[void]$form.ShowDialog()
Remove-Variable PosGuiPump,PosProgress -Scope Global -ErrorAction SilentlyContinue
