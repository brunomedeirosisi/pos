# Instalação e uso na loja — dois caixas Windows e impressoras por caixa

Para servidor na internet, siga [NUVEM.md](NUVEM.md): o pacote POS-Nuvem conecta cada caixa por HTTPS, com impressora local opcional e sem Docker. Este guia descreve a hospedagem dentro da loja.

Para um ensaio temporário do checkout local pela internet, consulte [TESTE-INTERNET.md](TESTE-INTERNET.md): comandos em uma linha, duas janelas PowerShell, certificado, CORS, recuperação dos serviços e encerramento. Esse roteiro usa o Compose da raiz do projeto; os comandos do Principal instalado são diferentes.

Este guia cobre o instalador Windows do POS 1.0.0-store.3: **Caixa 1 Principal**, com aplicação/banco/impressora, e **Caixa 2 Terminal**, que acessa pelo navegador. O pacote inclui um executável de entrada e arquivos auxiliares; extraia o ZIP inteiro. O executável não funciona isolado.

A instalação fica pronta para homologação da infraestrutura. Antes de vendas reais, conclua os controles de crédito/cliente inativo, estoque não negativo e recuperação operacional pendentes no roadmap. “Instalação concluída” não certifica essas regras de negócio nem a saída física da impressora.

## 1. Preparação única

No Caixa 1:

- Windows x64 compatível com Docker Desktop, PowerShell 5.1/.NET Framework 4.8 ou posterior e virtualização/WSL funcionando. A preparação do Docker pode exigir internet, permissão administrativa e reinicialização. O instalador não força reinício nem altera BIOS.
- Use a mesma conta Windows para instalar, entrar no Windows, executar Docker Desktop e acessar a impressora. Não instale com outra conta de administrador para depois operar em um perfil diferente.
- Instale o driver da impressora e confirme seu nome exato em “Impressoras e scanners”. Imprima uma página de teste do Windows.
- Reserve um IP privado para o Caixa 1 no roteador, por exemplo `192.168.1.22`. O instalador verifica o IP existente; não muda o roteador ou o endereço da placa.
- Configure a conexão da loja como **Privada** no Windows. Os dois caixas devem estar na mesma rede com comunicação entre si.
- Prepare uma pasta de backup em outro dispositivo/computador, já acessível por essa conta e pelo Docker. Um diretório no próprio disco do Caixa 1 não protege contra perda desse disco. O verificador não comprova a localização física do destino.

No Caixa 2: navegador, acesso à rede e o pacote Terminal-POS recebido do Caixa 1. Para usar uma impressora própria, instale seu driver e selecione o modo Terminal com impressora; o runtime e o agente vêm no pacote. Docker e banco ficam no Principal. Veja [IMPRESSORAS.md](IMPRESSORAS.md).

Receba o ZIP e seu SHA256 por um canal confiável. Confira o hash antes de extrair:

```powershell
Get-FileHash ./POS-Loja-1.0.0-store.3.zip -Algorithm SHA256
```

Compare com o valor fornecido pelo responsável pela versão. O build local padrão não possui assinatura digital do instalador; o runtime Node incluído tem sua assinatura e checksum verificados no build. Não desative antivírus/SmartScreen para contornar um pacote desconhecido. Uma distribuição comercial deve usar certificado de assinatura confiável.

## 2. Instalar o Principal

1. Extraia o pacote em uma pasta local do Caixa 1 e execute **Instalar-POS.exe**.
2. Selecione **Principal**.
3. Informe o IP reservado, nome/endereço/identificação da empresa e nome exato da fila da impressora Windows.
4. Use **Teste** para enviar uma página de teste à impressora. Confira o papel; sucesso do spooler sozinho não comprova impressão física.
5. Escolha a pasta externa de backup e confirme que ela fica fora do disco do Principal.
6. Informe nome, e-mail e senha inicial do administrador, com pelo menos 12 caracteres. Guarde a senha com o responsável da loja.
7. Se Docker Desktop não estiver instalado, marque a preparação e leia/aceite os termos do fornecedor. Se o Windows solicitar reinicialização, conclua-a e execute novamente o instalador.
8. Clique em **Instalar / Reparar**. Autorize o auxiliar de firewall quando o Windows solicitar. Ele libera somente TCP 443 no IP selecionado, perfil Privado e origem da sub-rede local.

O instalador carrega as imagens prontas, cria volumes próprios, aplica schema/migrações, gera credenciais exclusivas, cria o administrador, configura HTTPS, verifica a réplica e cria o backup inicial. Depois remove a senha de bootstrap da configuração e recria somente a API. Nenhuma venda/produto de benchmark é inserida.

A instalação termina com o atalho **POS Loja** na área de trabalho e uma pasta **Terminal-POS** em:

```text
%LOCALAPPDATA%\POSStore\Terminal-POS
```

Se houver erro, leia a mensagem e preserve os arquivos/dados. Executar novamente a mesma versão com as mesmas configurações repara a instalação sem regenerar as credenciais. Os campos do administrador valem somente na primeira instalação; Reparar não redefine senha. Se a falha foi em uma atualização com possível mudança de schema, o reparo automático fica bloqueado.

## 3. Instalar o Terminal

1. Copie **somente a pasta Terminal-POS**, inteira, do Caixa 1 para o Caixa 2 por um meio confiável, como um pendrive entregue pelo responsável.
2. Execute seu **Instalar-POS.exe**. Selecione **Terminal** para usar a impressora central, ou **Terminal com impressora** para parear uma impressora local com código gerado em Administração > Sistema > Impressoras. Siga [o roteiro completo](IMPRESSORAS.md).
3. Confira o endereço e o SHA256 do certificado exibidos com os dados do pacote original do Principal. Confirme que o pacote veio da sua loja.
4. O instalador confia no certificado somente para o usuário atual, confere a identidade UUID da loja via HTTPS e cria o atalho **POS Loja**.
5. Abra o atalho e entre com um usuário autorizado. Crie contas individuais no cadastro de usuários para os operadores; evite compartilhar a senha do administrador.

O pacote Terminal não contém senha do banco, tokens de agente, segredo de sessão ou imagens Docker. Inclui runtime Node e worker para o modo opcional com impressora; sua credencial é criada e protegida localmente durante o pareamento. Não copie a pasta completa `POSStore`, `secrets.bin` ou as chaves da autoridade certificadora para o Caixa 2.

## 4. Rotina de abertura e fechamento

Entre no Windows do **Caixa 1**, usando a conta da instalação. O atalho da pasta Inicializar chama o supervisor: ele aguarda o Docker, inicia os containers e o agente e verifica a necessidade de backup. O login do Windows é necessário; não foi configurado login automático.

Abra o atalho POS Loja em cada caixa. O Caixa 1 precisa permanecer ligado, sem suspensão, com a sessão iniciada, para os dois caixas funcionarem. Bloquear a tela não equivale a sair da conta; confirme esse comportamento na homologação local. Se o Principal ou a rede parar, o Terminal não tem operação independente offline.

Para manutenção programada, termine as operações e confira a fila de impressão antes de parar. Abra PowerShell na conta da instalação:

```powershell
$posBase = Join-Path $env:LOCALAPPDATA 'POSStore'
$posState = Get-Content (Join-Path $posBase 'settings.json') -Raw | ConvertFrom-Json
$posTools = Join-Path (Join-Path $posBase 'versions') $posState.version
powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $posTools 'Parar-POS.ps1')
```

A parada aguarda o agente, conserva banco, backups e volumes e impede reinício automático até uma retomada explícita:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $posTools 'Start-POS.ps1') -Resume
```

Esses comandos usam política de execução apenas nesse processo; não alteram a política global do Windows. Execute somente scripts do pacote verificado.

Na tela de vendas, **Data da venda** sugere hoje e permite escolher um dia anterior pelo calendário ou digitação. Confira a data no resumo antes de confirmar. O preenchimento é obrigatório; datas inexistentes e futuras são recusadas. A data escolhida é conservada em caso de falha no envio e volta a sugerir hoje após a venda ser concluída. Consulte [as regras de data da venda](../sale-date.md).

O campo **Vendedor** é opcional. Sem seleção, a venda usa o vendedor vinculado ao usuário conectado; sem vínculo, cria seu vendedor automaticamente ao concluir a primeira venda. Em **Perfis e permissões → Vendedores dos usuários**, quem possui `users:write` pode configurar o vínculo individual, inclusive com um vendedor legado existente. A seleção manual na venda tem prioridade. [Detalhes do vínculo e validações](../user-sellers.md).

## 5. Como funciona a impressão compartilhada

Os dois caixas solicitam impressão à mesma aplicação. Os trabalhos ficam no PostgreSQL, vinculados ao destino escolhido. Cada agente consulta somente a fila de sua impressora por HTTPS e entrega os textos ao Windows local. O atalho configura o destino padrão de cada caixa; o PDV permite seleção explícita. Não é necessário compartilhar a porta 9222 ou abrir uma porta de impressão na rede.

Nos detalhes da venda, “Impressões” mostra os trabalhos recentes:

| Estado | Significado | Ação |
|---|---|---|
| Aguardando impressora | Trabalho persistido, ainda não recebido pelo agente. | Verifique se o Principal/agente está ativo. |
| Recebido pelo agente | Há uma reserva temporária do trabalho. | Aguarde. |
| Enviando ao Windows | O agente pode ter iniciado o envio ao spooler. | Aguarde e confira a fila do Windows. |
| Aceito pela fila do Windows | O comando foi aceito pelo spooler. | Confira o papel e eventuais erros físicos. |
| Recusado antes da impressão | O trabalho foi rejeitado sem iniciar a saída. | Corrija a causa e solicite novamente. |
| Resultado incerto | Houve interrupção/timeout com possibilidade de saída. | Confira papel e spooler **antes** de pedir outra via. |

Resultado incerto **não é reimpresso automaticamente**. Uma nova ação do operador solicita uma nova via. Pedidos repetidos com o mesmo identificador lógico são deduplicados. A prévia de recibo e a impressão pelo navegador continuam sendo alternativas distintas; cuide para não emitir cópias adicionais sem conferir a fila.

## 6. Backups

A instalação exige um backup inicial com réplica verificada. Depois, o supervisor tenta um novo backup quando o último sucesso tem pelo menos 24 horas, enquanto a conta do Principal estiver conectada e o supervisor ativo. Se falhar, registra a falha e tenta novamente após uma hora. Ao iniciar depois de um período desligado, verifica se há backup atrasado.

Confira regularmente a tela de backups e o diagnóstico. Para criar/verificar um backup manual:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $posTools 'Diagnosticar-POS.ps1') -BackupNow
```

Os ZIPs contêm dados da loja e **não são criptografados pela aplicação**. Proteja o destino com permissões e proteção de disco/rede apropriadas. A retenção local segue a aplicação; as réplicas externas não são apagadas automaticamente. Monitore capacidade e defina retenção externa com o responsável técnico.

O instalador mantém a restauração desativada por padrão. Sua habilitação exige validar antes um backup nativo em ambiente descartável. Quando habilitada, a tela exige senha e confirmação, interrompe o atendimento durante a recuperação e diferencia sucesso de rollback. Após sucesso, entre novamente. Consulte o [procedimento de backup e restauração](../backup-restore-runbook.md) antes de substituir dados; em incidente, preserve volumes, arquivos e configurações.

## 7. Problemas comuns

| Sintoma | Verificação |
|---|---|
| Docker não inicia | Conclua instalação/WSL, confira virtualização, reinicie quando solicitado e entre na conta correta. |
| Terminal não acessa | Confira login/Docker no Caixa 1, IP reservado, perfil Privado, regra HTTPS e isolamento de clientes no roteador. |
| Erro de certificado | Use o pacote Terminal da mesma loja. Não ignore a validação HTTPS ou baixe certificados de um endereço não verificado. |
| Fila não anda | Abra diagnóstico, confira agente, nome da impressora, permissões da conta e spooler do Windows. |
| Resultado incerto | Confira saída física antes de reimprimir. Não limpe o journal para forçar repetição. |
| Backup inicial falha | Confira espaço, pasta existente, acesso pelo Docker e suporte a publicação exclusiva/hardlinks. Um NAS/UNC pode exigir preparo adicional. |
| Entrou com outro usuário Windows | Volte à conta da instalação; DPAPI não permite usar os mesmos segredos em outro perfil. |
| IP/printer mudou | Não edite arquivos aleatoriamente. Reconfigure de forma assistida e gere novo pareamento se o endereço/certificado mudar. |

Diagnóstico sem exibir senhas/tokens:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $posTools 'Diagnosticar-POS.ps1')
```

## 8. Atualizar ou desativar

Atualize fora do expediente, com os dois caixas parados para manutenção e backup externo acessível. O pacote novo deve declarar compatibilidade com a versão instalada. Use:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $posTools 'Atualizar-POS.ps1') -Package 'C:/Pacotes/POS-Loja-NOVA-VERSAO'
```

O atualizador faz backup antes da troca, verifica imagens e saúde e preserva a versão anterior e os volumes. Se a atualização falhar após possível migração, não volta automaticamente o banco nem a imagem antiga: bloqueia o reinício para diagnóstico/recuperação assistida.

Para retirar a inicialização automática e a regra HTTPS sem excluir dados:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $posTools 'Desativar-POS.ps1')
```

`-RemoveTrust` também retira o certificado dessa conta do Principal. Dados/volumes/backups permanecem preservados. No Terminal, a retirada do atalho e da CA identificada em `%LOCALAPPDATA%\POSTerminal\terminal.json` é uma operação local assistida; não remova certificados sem conferir a identificação.

Impressoras por caixa: [IMPRESSORAS.md](IMPRESSORAS.md). Documentação técnica: [TECNICO.md](TECNICO.md). Checklist de aceitação: [HOMOLOGACAO.md](HOMOLOGACAO.md).

### Navegação nas listagens

Use os controles abaixo das tabelas para mudar de página, ir diretamente a um número ou escolher 10, 25, 50 ou 100 registros. Pesquisar ou mudar filtros volta à primeira página. Ao voltar dos detalhes, a navegação da sessão é preservada. Os seletores permitem escrever e navegar pelas páginas de opções. Recibos e relatórios impressos continuam completos. Veja o inventário e os detalhes em [Paginação](../pagination.md).

### Formato das datas

Todos os campos de data usam **DD/MM/YYYY**, em português e inglês, independentemente do idioma do navegador. Digite a data (as barras são incluídas automaticamente ao escrever apenas números) ou use o botão de calendário. No PDV, a sugestão é hoje e datas futuras são bloqueadas. Datas impossíveis ou incompletas exibem orientação de correção.

### Quantidade na venda

Informe unidades inteiras (1, 2, 3…). Os controles aumentam ou diminuem uma unidade. Frações, zero e negativos são recusados. Para retirar um produto do carrinho, use **Excluir**.

### Preço e saldo devedor no fechamento

A forma de pagamento não altera o preço do produto: o fechamento mantém o preço exibido no carrinho. O preço à vista do cadastro é usado para todas as formas; se estiver ausente, o preço base é utilizado.

Ao selecionar um cliente, confira o **Saldo devedor do cliente após a venda** no fechamento. Apenas **À prazo** e a parte não paga de **À prazo com entrada** aumentam a dívida. Dinheiro, cartão, transferência e outro exigem quitação integral; o troco não abate dívidas anteriores.

Exemplo: com dívida anterior de R$ 500,00 e compra de R$ 100,00, o saldo será R$ 500,00 no pagamento imediato, R$ 600,00 à prazo ou R$ 580,00 com entrada de R$ 20,00. O valor antes de confirmar é estimado; a confirmação mostra o saldo efetivamente gravado.

O recibo mostra esse saldo e o preserva nas reimpressões, mesmo após outros recebimentos ou vendas. Vendas anteriores a essa atualização não têm um saldo gravado naquele momento e mostram **Indisponivel** no recibo. Se a consulta do saldo falhar, use **Tentar novamente** antes de confirmar. A interface e os recibos também estão disponíveis em inglês.
