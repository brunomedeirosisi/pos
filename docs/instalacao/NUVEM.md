# Modo Nuvem — instalação e operação dos caixas Windows

Disponível em **1.0.0-store.3**. Cada caixa acessa a loja publicada na internet pelo navegador. Se tiver impressora própria, executa também um agente Windows que consulta a fila por HTTPS e envia os trabalhos ao spooler local. A aplicação e o banco ficam no servidor contratado.

O instalador conecta os caixas a um servidor existente. Ele não contrata hospedagem, cria domínio, publica o servidor, migra dados ou configura backups da nuvem. O pacote **POS-Nuvem** dispensa Docker nos caixas, imagens de servidor e certificado de rede local. O pacote completo POS-Loja também oferece os modos Nuvem.

Para disponibilizar o localhost temporariamente na internet antes de contratar hospedagem, siga [TESTE-INTERNET.md](TESTE-INTERNET.md). O roteiro registra o acesso pelo navegador com Cloudflare Tunnel, os comandos PowerShell que funcionaram e os requisitos adicionais de UUID/fila/origem estável para testar o instalador e a impressão.

## 1. Preparar o servidor com o responsável técnico

Antes de instalar os caixas, o responsável pela hospedagem deve entregar:

- A origem HTTPS pública final, por exemplo **https://caixa.sualoja.com.br**, na porta **443**, com frontend e API na mesma origem. Informe somente o domínio: sem caminho, parâmetros, usuário, senha ou redirecionamento.
- Certificado público válido para esse domínio, cadeia completa e compatibilidade com TLS 1.2. Windows e Node precisam reconhecer a cadeia; a CA interna do instalador local não serve para este modo.
- O **UUID da loja**, conferido no servidor por um canal confiável. A API precisa responder esse mesmo valor em GET /api/v1/store-info. O instalador verifica a identidade antes de enviar código/token.
- Aplicação atualizada com o frontend desta versão, autenticação, perfis e migrações de impressoras aplicados. O frontend .3 entende a seleção inicial obrigatória do destino de impressão nos caixas sem impressora.
- **PRINT_MODE=queue** quando houver impressão. Os endpoints de cadastro, pareamento e polling de agente devem estar disponíveis. Cada impressora recebe uma identidade e credencial próprias; o instalador não usa o token do Principal.
- Administração, monitoramento, backups externos e ensaio de restauração do servidor definidos. PostgreSQL, Redis, credenciais, arquivos de importação e métricas ficam protegidos na infraestrutura.

O Compose local usa CA interna e configurações de LAN; não constitui uma configuração de hospedagem pública permanente. O ensaio temporário por túnel mantém validação da origem e tem procedimento próprio em [TESTE-INTERNET.md](TESTE-INTERNET.md). A configuração do proxy público, rede privada do banco/Redis, segredos, persistência e recuperação pertence à implantação do servidor. A entrega atual não inclui um provisionador de nuvem ou isolamento de várias lojas. Comece com uma instância para sua loja; expansão para clientes independentes exige arquitetura e operação próprias.

## 2. Escolher o pacote e o modo

| Situação do caixa | Pacote recomendado | Modo |
|---|---|---|
| Somente navegador; usa impressora de outro caixa | POS-Nuvem-1.0.0-store.3.zip | Nuvem |
| Navegador e impressora conectada a este Windows | POS-Nuvem-1.0.0-store.3.zip | Nuvem com impressora |
| Serviços e banco continuam dentro da loja | POS-Loja-1.0.0-store.3.zip | Principal / Terminal; veja USO.md |

Para dois caixas e uma impressora, use **Nuvem com impressora** no computador onde ela está conectada e **Nuvem** no outro. Os dois escolhem o mesmo destino no sistema. Se os dois tiverem impressora, pareie cada um com um código diferente e confira o destino próprio em cada navegador.

Não é necessário compartilhar impressora no Windows ou abrir porta no roteador. O computador que imprime deve permanecer ligado e com a conta operacional conectada ao Windows. A impressão depende da conexão com a internet.

## 3. Pré-requisitos dos caixas

- Windows x64, PowerShell 5.1 e **.NET Framework 4.8 ou posterior**, navegador atualizado, horário correto e acesso de saída HTTPS ao domínio da loja. O runtime Node acompanha o pacote.
- Instale e opere usando a mesma conta Windows. O token usa DPAPI CurrentUser e não pode ser transferido simplesmente para outro usuário/computador.
- Com impressora: driver instalado, nome exato da fila Windows e página de teste legível, com acentos, papel e largura conferidos. Nenhuma alteração de impressora real é feita pelos testes automatizados do repositório.
- URL e UUID fornecidos pelo responsável. Com impressora, também um código válido gerado pelo administrador.

Receba o ZIP e seu SHA256 por canal confiável. Confira antes de extrair:

```powershell
Get-FileHash ./POS-Nuvem-1.0.0-store.3.zip -Algorithm SHA256
```

Compare com o hash distribuído pelo mantenedor. Extraia o **ZIP inteiro** em pasta local; o EXE depende dos arquivos vizinhos. O build sem certificado de assinatura é explicitamente não assinado. Hash comprova integridade quando obtido por canal confiável; para distribuição comercial, assine EXE/scripts com certificado próprio.

## 4. Instalar sem impressora local

1. Execute **Instalar-POS.exe** na conta operacional.
2. Escolha **Nuvem**.
3. Informe a **URL HTTPS pública** e o **ID UUID da loja**.
4. Clique em **Instalar / Reparar**. O instalador valida o pacote, HTTPS e identidade e cria o atalho **POS Nuvem**.
5. Abra esse atalho e faça login com seu usuário. Em **Destino da impressão**, escolha uma impressora habilitada e confira o nome antes do primeiro pedido.

Neste modo não há agente, credencial de impressão ou inicialização automática de processos. O atalho solicita uma escolha explícita: não presume que existe uma impressora Principal na nuvem. O botão de imprimir fica bloqueado enquanto o destino não for escolhido/validado. O navegador guarda a preferência por UUID da loja; abrir novamente o atalho sem impressora pode solicitar a seleção outra vez.

Para usar o sistema sem impressão, basta o login no navegador. Para imprimir em outro caixa, ele precisa estar pareado, ligado e conectado. Offline não troca automaticamente o destino.

## 5. Instalar com impressora neste caixa

No navegador, entre com um administrador em **Administração > Sistema > Impressoras**:

1. Informe um nome lógico, por exemplo **Caixa 1 — Balcão**.
2. Gere um código de pareamento e entregue-o somente ao responsável por esse caixa. Ele vale **15 minutos** e cadastra um agente.

No Windows do caixa:

1. Confirme a página de teste do driver e o nome exato da fila.
2. Execute o instalador e escolha **Nuvem com impressora**.
3. Informe URL, UUID, **fila Windows deste computador** e o código de 48 caracteres.
4. Conclua. O instalador verifica a identidade/PRINT_MODE, gera um token exclusivo, protege-o com DPAPI, faz o pareamento e inicia o agente.
5. Abra **POS Nuvem**, entre e confira o destino próprio. Faça um pedido sintético e verifique o papel e o histórico.

O código não é a senha do usuário. A credencial do agente não vai no atalho ou em argumentos de processo. O atalho carrega apenas UUIDs públicos de loja/destino. A entrada **POS Terminal Impressora** na pasta Inicializar retoma o agente após login; não há serviço SYSTEM ou login automático.

Permissão de cadastro/revogação: **printers:manage**; o administrador padrão já a possui. Usuários com **sales:read** podem imprimir nos destinos habilitados da loja. A credencial de cada agente só acessa a própria fila.

## 6. Rotina, diagnóstico e reparo

Abra POS Nuvem em cada caixa. Mantenha conectado ao Windows o computador da impressora; sair da conta encerra o agente. A aplicação não oferece venda offline. Uma interrupção de internet pode deixar impressão pendente/incerta; confira papel e histórico antes de solicitar outra cópia. Aceitação pelo spooler não comprova saída física.

Execute os comandos na mesma conta Windows da instalação. Para caixa com impressora:

```powershell
$posClient = Join-Path $env:LOCALAPPDATA 'POSTerminal'
$posState = Get-Content (Join-Path $posClient 'terminal.json') -Raw | ConvertFrom-Json
$posTools = Join-Path (Join-Path $posClient 'versions') $posState.version
powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $posTools 'Diagnosticar-Terminal.ps1')
powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $posTools 'Parar-Terminal.ps1')
# Depois da manutencao, retomar explicitamente:
powershell.exe -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File (Join-Path $posTools 'Start-Terminal.ps1') -Resume
```

O diagnóstico verifica identidade e estado da fila sem imprimir código/token. Parar cria um sinal persistente: o login seguinte não retoma sozinho até usar -Resume. Antes de manutenção, termine as operações e confira trabalhos em andamento. No caixa sem impressora não existe release de agente em versions; execute Diagnosticar-Terminal.ps1 a partir da pasta extraída do pacote.

Para **reparar** o mesmo caixa, execute a mesma versão, URL e UUID. No modo com impressora, deixe o código **vazio** para reutilizar a credencial; informe a fila correta. Um novo código solicita um novo pareamento. O instalador preserva journals dos destinos anteriores, mas não transfere seus trabalhos. Confira/revogue o cadastro anterior no painel para não deixar um destino antigo selecionável.

Troca de conta, Windows ou computador exige novo pareamento e revogação do antigo, após revisar fila/papel. Não copie terminal-agent.bin como se fosse uma senha portável. Atualize o cliente distribuindo o novo pacote verificado e valide o contrato da API antes da liberação. O pacote Nuvem não atualiza o servidor.

## 7. Migrar de instalação local

A migração precisa de manutenção programada: backup/réplica validados, ensaio de restauração em alvo isolado, publicação do servidor, preservação do UUID e dos dados conforme o plano técnico, reconciliação de filas/journals e teste dos dois caixas. O instalador não move volumes, dados, impressões pendentes ou credenciais do Principal para a nuvem.

Um perfil POSTerminal existente fica vinculado à origem/UUID original. A instalação recusa trocar silenciosamente para outro servidor. Preserve o diretório completo e seus journals; planeje um perfil Windows novo ou uma migração assistida do estado depois da parada/revogação. Não apague o estado para contornar a proteção enquanto houver fila a reconciliar.

No computador que hospedava o **Principal**, Nuvem com impressora exige que o Principal local esteja parado e desativado: conclua a migração, confira filas e use **Desativar-POS.ps1** do release instalado. O instalador exige stop.request e ausência de supervisor ativo. Desativar preserva os dados locais; pode afetar os Terminais ainda dependentes do Principal, portanto só faça no corte planejado. Não volte a iniciar simultaneamente o agente antigo na mesma impressora. O modo Nuvem sem impressora pode ser usado para validar o servidor antes do corte.

O atalho novo chama-se POS Nuvem e não sobrescreve POS Loja. A pasta privada do cliente é POSTerminal; POSStore e seus volumes permanecem sob responsabilidade do plano de migração. Após o corte, oriente os operadores sobre o atalho/destino correto.

## 8. Problemas comuns

| Mensagem ou sintoma | Ação |
|---|---|
| Origem HTTPS inválida | Informe somente https://dominio.publico na porta 443. IP, localhost, nomes locais, caminhos e parâmetros são recusados. |
| Erro HTTPS | Confira DNS, internet, relógio, cadeia pública e nome do certificado. Não desative validação TLS nem importe a CA da antiga rede local. |
| Redirecionamento | Use a origem final entregue pelo responsável. O instalador não segue redirects com código/token. |
| Outra identidade de loja | Interrompa; confira URL e UUID por canal confiável antes de parear. |
| PRINT_MODE precisa ser queue | O administrador da infraestrutura deve habilitar a fila e aplicar as migrações. |
| Código inválido/expirado | Gere outro código no painel e use-o no caixa correspondente. Não envie tokens em chamados. |
| Destino indisponível | Confira login Windows do caixa que imprime, internet, driver, diagnóstico e revogação. Não há troca automática de destino. |
| Perfil pertence a outra loja | Preserve o estado; siga o plano de migração assistida. |
| Caixa sem impressora não imprime | Selecione um destino habilitado no navegador; confirme que o computador correspondente está operacional. |

## 9. Detalhes técnicos e reprodução

O launcher e Assert-PosBundle conferem hashes/caminhos antes da execução. Pos.Cloud.ps1 valida a origem e usa HttpClient com confiança normal do Windows, TLS 1.2, revogação de certificados, timeout de 15 segundos e resposta limitada a 64 KiB. Não usa cookies ou credenciais Windows e recusa redirecionamentos. Erros HTTP/JSON são sanitizados e não ecoam resposta do servidor.

O worker usa confiança TLS normal do Node e redirect: error; o supervisor força NODE_TLS_REJECT_UNAUTHORIZED=1 e remove a CA local herdada de NODE_EXTRA_CA_CERTS no modo Nuvem. Nenhuma CA é importada, listener é aberto ou regra de firewall criada. O instalador usa apenas conexões de saída; o ambiente pode exigir liberação de saída/DNS e endpoints públicos da cadeia de certificados conforme a política da organização.

Estado: terminal.json schemaVersion 3 com connectionMode cloud, SID, origem, UUIDs e versão; terminal-agent.bin com DPAPI CurrentUser; agent.json sem token; print-journal/<printerId> para reconciliação. O instalador serializa operações por lock e conserva a credencial em reparos sem código. Estado LAN antigo sem connectionMode continua usando a CA local.

Build do cliente no Windows, sem Docker e sem Node previamente instalado:

```powershell
./infra/installer/Build-CloudInstaller.ps1 -Version '1.0.0-store.3'
# Opcional: -SigningThumbprint '<certificado de assinatura CurrentUser/My>'
```

O builder baixa o runtime oficial, confere SHA256/Authenticode, executa contratos Windows e compila o launcher. Gera pasta, ZIP e arquivo SHA256 em artifacts/POS-Nuvem-<versão>. O pacote contém runtime, agente, scripts, manifesto e documentação; não contém imagens Docker, banco, CA local ou pairing.json. A seleção Nuvem dentro do pacote completo também copia somente o cliente para o release instalado.

Testes reproduzíveis, com Node disponível no host:

```powershell
./infra/installer/Test-Installer.ps1 -NodePath (Get-Command node.exe).Source
./infra/installer/Test-CloudHttps.ps1 -NodePath (Get-Command node.exe).Source
node infra/test-disposable.mjs --docker --images --backups
```

O teste HTTPS usa servidor/proxy efêmeros em loopback e certificado temporário: verifica rejeição de certificado não confiável, nome divergente e redirects, limites/erros e ausência de vazamento de credenciais. A confiança específica existe somente no handler do teste; não altera certificados ou TLS global. Os testes de instalação simulam efeitos globais. Homologue internet real, certificado público, reboot/login e saída física na loja usando [HOMOLOGACAO.md](HOMOLOGACAO.md). Arquitetura e manutenção geral: [TECNICO.md](TECNICO.md); impressão: [IMPRESSORAS.md](IMPRESSORAS.md).
