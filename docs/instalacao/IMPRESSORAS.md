# Impressoras por caixa — instalação, operação e manutenção

A partir de **1.0.0-store.2**, cada caixa pode possuir sua impressora. O Principal mantém aplicação/banco e seu agente. O Terminal recebe um agente leve Windows, sem Docker. Os dois acessam a mesma API por HTTPS; nenhum agente abre porta de entrada.

## 1. Instalar ou atualizar o Principal

Em uma instalação nova, use o pacote 1.0.0-store.2 e siga [USO.md](USO.md). Quem já usa 1.0.0-store.1 deve atualizar o Principal com `Atualizar-POS.ps1`, em manutenção e com backup/réplica acessível, antes de instalar o novo Terminal. O pacote precisa declarar compatibilidade com a versão instalada.

A migração preserva o destino `principal`, trabalhos, conteúdo e credencial existentes. Novos campos identificam o destino e seu nome no histórico. O agente antigo do Principal continua restrito a `principal`. A atualização não distribui sua credencial para outros computadores.

Depois da atualização, copie novamente a pasta `%LOCALAPPDATA%\POSStore\Terminal-POS`. O pacote novo inclui os scripts do Terminal, runtime Node e agente, além do certificado público. Não contém imagens Docker nem credenciais da loja. Não reutilize o pacote antigo para habilitar esta função.

## 2. Autorizar a impressora do Terminal

No navegador do Principal, entre como administrador e abra **Administração > Sistema > Impressoras**.

1. Informe um nome identificável, por exemplo **Caixa 2 — Balcão**. Esse é o nome lógico exibido na aplicação.
2. Clique em **Gerar código de pareamento**.
3. Entregue o código somente ao responsável pela instalação desse Terminal. Ele vale por **15 minutos** e permite cadastrar um único agente. Não envie o código em URL, logs ou capturas públicas.

O administrador padrão possui acesso. Para delegar esta função a outro perfil, conceda `printers:manage` pelo cadastro de perfis. Operadores com `sales:read` podem selecionar destinos habilitados da mesma loja e consultar seus estados; isso não lhes permite cadastrar ou revogar agentes.

## 3. Instalar Terminal com impressora

No Caixa 2, entre na conta Windows usada pelo operador e:

1. Instale o driver da impressora. Confirme o nome exato da fila em **Impressoras e scanners** e teste papel/acentos/largura.
2. Extraia/copie a pasta Terminal-POS completa recebida do Principal e execute **Instalar-POS.exe**.
3. Selecione **Terminal com impressora**.
4. Informe a fila Windows **deste computador** e o código gerado na administração. O nome lógico do caixa pode ser diferente do nome do driver.
5. Confirme o endereço e o SHA256 da CA com o responsável pelo Principal.
6. Conclua e abra pelo atalho **POS Loja**. Na aplicação, confira **Destino da impressão** antes do primeiro teste.

O instalador gera um token exclusivo, o protege com DPAPI antes do pareamento e recebe a identidade da impressora por HTTPS. Remove o código temporário depois da confirmação, cria configuração/journal próprios e inicialização após login. Não configura Docker, firewall, compartilhamento SMB ou listener HTTP no Terminal.

No modo **Terminal** sem impressora, o navegador continua usando o Principal por padrão. O runtime pode estar presente no pacote recebido, mas o agente não é instalado/iniciado por esse modo. A impressão pela prévia do navegador continua disponível com diálogo de escolha do Windows.

## 4. Destino padrão e troca explícita

| Caixa | Destino padrão ao abrir seu atalho |
|---|---|
| Principal | Caixa 1 / principal |
| Terminal com impressora | Impressora pareada desse Terminal |
| Terminal sem impressora | Caixa 1 / principal |

O atalho contém apenas os identificadores públicos da loja e da impressora (`pos_store` e `pos_printer`). A aplicação registra o destino antes do redirecionamento de login. A preferência pertence ao navegador/loja, não à conta do operador. Não há senha ou token nessa URL.

No PDV após finalizar a venda, ou nos detalhes da venda, o campo **Destino da impressão** mostra as impressoras habilitadas e sua conectividade. Escolha outra explicitamente quando precisar. A escolha permanece nesse navegador até nova escolha ou abertura de um atalho que configure novamente o destino. Uma nova instalação/pareamento gera o atalho apropriado.

Use o atalho no navegador/perfil operacional. Se abrir por outro navegador, outro perfil ou apagar os dados do navegador, abra novamente o atalho e confira o destino. O identificador público é uma preferência de roteamento; a autorização é aplicada pela sessão humana e pela credencial do agente no servidor.

## 5. Impressora desconectada, erro ou papel incerto

- **Desconectada — pedidos aguardarão:** o agente não consultou a API nos últimos 30 segundos. Isso não mede papel, tinta ou funcionamento do driver. É permitido enfileirar; os trabalhos aguardam o agente daquele destino.
- Uma fila ocupada no Caixa 2 não bloqueia o Caixa 1. Cada impressora possui reserva e limite de pendências próprios (padrão 500).
- Pedidos não mudam automaticamente de destino. Uma impressora revogada/desconhecida bloqueia novos pedidos; o operador precisa selecionar outra explicitamente.
- **Aceito pelo Windows** confirma a conclusão do comando de spool, não a impressão física. **Resultado incerto** exige conferir papel e spooler antes de solicitar outra via.
- Uma nova ação de impressão é um novo pedido. Escolher outra impressora não move/cancela o pedido anterior. Confira a fila antiga antes de emitir outra via, para evitar duas saídas quando ela voltar.
- O mesmo UUID não pode ser reutilizado com outro destino. O histórico mostra o destino original de cada pedido.

## 6. Diagnosticar, parar e retomar

Na conta Windows da instalação, encontre a versão ativa:

```powershell
$terminalBase = Join-Path $env:LOCALAPPDATA 'POSTerminal'
$terminalState = Get-Content (Join-Path $terminalBase 'terminal.json') -Raw | ConvertFrom-Json
$terminalTools = Join-Path (Join-Path $terminalBase 'versions') $terminalState.version
powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $terminalTools 'Diagnosticar-Terminal.ps1')
```

Parar preservando a fila/journal:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $terminalTools 'Parar-Terminal.ps1')
powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $terminalTools 'Start-Terminal.ps1') -Resume
```

A parada manual persiste nos próximos logins até `-Resume`. Para retirar também o atalho da pasta Inicializar, use `Parar-Terminal.ps1 -DisableStartup`. A retomada manual funciona, mas uma reinstalação/reparo é necessária para recriar a inicialização automática removida.

O PC e a sessão do Terminal precisam estar ativos para sua impressora receber trabalhos. O Principal também precisa estar disponível porque hospeda a aplicação e a fila. O Terminal não opera vendas sozinho se o servidor parar.

## 7. Reparar, atualizar ou substituir um Terminal

- Execute novamente o pacote recebido, no modo com impressora e na mesma conta. Sem novo código, o reparo mantém a identidade/token existentes. Não gera outro agente.
- Se a resposta de pareamento se perder, o instalador conserva código/token protegidos para tentar novamente. Uma confirmação já consumida só pode ser recuperada com o mesmo token. Se o código expirou antes de ser usado, gere outro e informe-o explicitamente.
- Para atualizar o agente, atualize primeiro o Principal e receba novamente Terminal-POS. Execute esse pacote no Terminal, mantendo o modo com impressora e deixando o código vazio. O instalador para o supervisor anterior antes de trocar os arquivos. Cada novo pareamento tem journal separado.
- Para substituir computador/perfil Windows, revogue o agente antigo na administração, gere outro código e instale na conta nova. DPAPI não é portátil entre contas/computadores.
- Se informar um novo código explicitamente em um Terminal já instalado, ele será pareado como outro destino. Revogue o cadastro anterior e confira seus pedidos antes de descartá-lo. Os pedidos antigos não são transferidos.
- O modo de reparo sem impressora não desativa silenciosamente um agente existente: use os comandos de parada e a revogação administrativa.

A administração oferece **Revogar agente** com confirmação. Isso retira o token do servidor e impede novas consultas. Um envio já iniciado pode terminar; confira a saída física. Trabalhos pendentes/incertos e histórico continuam vinculados ao cadastro antigo. Reemitir exige ação explícita e conferência do operador.

## 8. Segurança, backup e homologação

`terminal-agent.bin` usa DPAPI CurrentUser e a pasta privada tem DACL restrita. `terminal.json` e `agent.json` não contêm token. O token é fornecido ao processo por ambiente. Não copie arquivos privados do Principal nem compartilhe uma credencial entre caixas. O código de pareamento fica somente como hash no banco e é limitado por validade e consumo.

O backup do banco inclui impressoras, hashes e trabalhos. Ele não inclui os segredos DPAPI, os journals locais ou a configuração Windows dos caixas. Em recuperação assistida, reconcilie estado/journal/saídas físicas e revise as credenciais e revogações antes de retomar; um snapshot antigo do banco pode representar permissões/filas antigas. Restore operacional continua sujeito aos gates do roadmap.

Teste os dois caixas simultaneamente com dados sintéticos, desligamento de um agente, falta de papel e saída incerta. Use [HOMOLOGACAO.md](HOMOLOGACAO.md). A homologação física de Windows, driver, rede e papel continua necessária; a validação automatizada usa transporte de saída simulado.
