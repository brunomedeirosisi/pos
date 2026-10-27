# Impressoras por caixa — implementação e validação

Registro de **23/10/2026**. Escopo aprovado: ampliar o instalador e a aplicação para um Terminal Windows com impressora própria, preservando o Principal. Base: commit 01989f9618ac2d4773db96493b7c60ba2d99bf9a, árvore inicialmente limpa. Não foi instalada/atualizada uma loja real nesta sessão.

## Entrega e operação

Pacote: `artifacts/POS-Loja-1.0.0-store.2.zip`, 284.358.594 bytes, SHA256 `203cac83b2c4493990569036e3ef14a4c86cfd9904ccccfa1efb189efaadca7d`. Os 27 arquivos do manifesto foram verificados no diretório e diretamente no ZIP. Vinte comparações confirmaram correspondência com scripts/configurações, worker e quatro guias de origem.

Para usar:

1. Instalar o Principal novo ou atualizar 1.0.0-store.1 em manutenção, com backup e réplica verificados.
2. Na aplicação, abrir **Administração > Sistema > Impressoras**, informar o nome lógico do Caixa 2 e gerar o código de 15 minutos.
3. Copiar novamente o Terminal-POS gerado pelo Principal atualizado.
4. No Caixa 2, instalar/testar o driver e executar o instalador no modo **Terminal com impressora**, informando a fila Windows local e o código.
5. Abrir o atalho POS Loja em cada caixa e conferir o destino antes de testar a saída física.

O Terminal mantém a opção de navegador sem agente. Não precisa Docker. Seu pacote contém runtime/worker opcionais e certificado público, sem credenciais do Principal, banco ou imagens Docker.

Guias atualizados: [instalação/uso](../instalacao/USO.md), [impressoras por caixa](../instalacao/IMPRESSORAS.md), [documentação técnica](../instalacao/TECNICO.md) e [homologação](../instalacao/HOMOLOGACAO.md).

## Aplicação, fila e segurança

A migração 20261023_001_print_printers.sql acrescenta cadastro de destinos, pareamentos e snapshot de nome/FK nos trabalhos. Preserva IDs, conteúdo, request_id, estados e credencial do Principal. Clientes/agentes anteriores continuam no destino principal por omissão.

Cada Terminal gera um token aleatório de 256 bits, protegido com DPAPI CurrentUser antes da chamada de pareamento. O servidor guarda SHA256. Códigos de 192 bits valem 15 minutos, são armazenados por hash e consumidos sob lock; um retry com a mesma credencial recupera resposta perdida sem outro cadastro. O código temporário é removido do DPAPI após confirmação.

A permissão printers:manage autoriza gerar códigos/revogar agentes; o administrador padrão já possui wildcard. sales:read autoriza imprimir nos destinos habilitados da loja. Não houve alteração nos seeds de vendas/usuários.

O cabeçalho x-print-printer-id limita cada credencial a um destino. Claim, leitura de recuperação, start, finish e contagens são isolados, inclusive quando alguém conhece o claim_token de outro trabalho. Locks, reserva viva e capacidade pendente são independentes por impressora.

O frontend captura os identificadores públicos do atalho antes do redirect de login e guarda a preferência por UUID da loja/navegador. PDV e detalhes apresentam seleção explícita, conectividade atualizada a cada dez segundos e histórico com destino. Um destino revogado/desconhecido bloqueia impressão; um destino offline mantém a fila. Nenhum pedido é transferido automaticamente.

Nova ação em outro destino é outra via; não cancela o pedido anterior. O operador precisa conferir a fila/papel antes de reemitir. Estados incertos não são repetidos automaticamente. Revogar um agente não interrompe com garantia um envio físico já iniciado.

## Instalador e manutenção

O launcher/GUI aceita TerminalPrinter. Pos.Terminal.ps1 valida CA/UUID, cria ou reutiliza a credencial local, mantém journal por printerId e copia a versão do agente. Start-Terminal.ps1 inicia após login, com lock e token por ambiente. Parar-Terminal.ps1 preserva dados e pode retirar a inicialização automática. Diagnosticar-Terminal.ps1 consulta estado sem exibir segredos.

Reparar com código vazio mantém identidade/token. Código novo explícito permite outro pareamento, conservando os journals anteriores. A conta Windows precisa ser a mesma. Não são criadas portas de entrada, compartilhamentos SMB, regras de firewall ou instalação Docker no Terminal.

Uma falha de pareamento anterior à cópia da versão pode deixar estado pendente sem script de parada. O reparo agora distingue esse caso verificando o lock do supervisor, permitindo recuperar a resposta perdida com segurança. O teste de processos simulados também verifica que scripts apontados realmente existem.

## Verificações executadas

- **319 testes únicos da versão final passaram**: backend unitário 144, integração PostgreSQL/Redis 81, regressão 4, controles de medição 7, frontend 74 e agente 9. Nenhuma falha/skip na validação final.
- A execução completa `node infra/test-disposable.mjs --docker --images --backups` passou com 317 testes e frontend 72. Após o ajuste de polling e dois testes do hook, o frontend foi reconstruído/revalidado em Docker com 74 testes, lint, controles de lint, tipos e build. Backend/agente permaneceram iguais. Há 16 controles adicionais de lint/seleção vazia.
- Os dois seeds sintéticos passaram na execução inicial com --seeds e não foram alterados. As repetições após correção de OpenAPI não semearam novamente.
- As imagens finais passaram por autenticação/revogação, SPA, métricas, backup/restore real, 21 FKs e persistência após recriar a API.
- **83 verificações Windows passaram**, inclusive parser, DPAPI/DACL reais, argumentos nativos, compilação/execução do EXE e construção oculta da GUI. Docker, trust, firewall, startup e impressão foram simulados nesse teste. O builder final também executou essas 83 verificações.
- Instalação nova do pacote: carregamento real de images.tar, HTTPS com CA do processo, duas sessões, dois destinos/agentes simultâneos, deduplicação, bloqueio de acesso cruzado, estado incerto, fila offline sem redirecionamento, revogação, remoção de bootstrap, réplica via bind Windows/checksum e recriação da API passaram. O catálogo inicial estava vazio.
- Upgrade real da imagem 1.0.0-store.1 para 1.0.0-store.2: sessão e token legados, venda, UUID idempotente, trabalho em spool e trabalho aguardando permaneceram válidos. SHA256 de cada snapshot/request_id foi comparado antes/depois da migração no PostgreSQL, sem depender de horários de geração. Depois, o mesmo ensaio de duas impressoras/backup/revogação passou na versão atualizada.

O primeiro ensaio da imagem encontrou OpenAPI inválido, que impedia a API de iniciar. O documento foi corrigido e ganhou teste de parsing no conjunto unitário carregado antes do build. A versão final carregou seu documento normalmente nos dois ensaios HTTPS.

As verificações finais de integridade do ZIP, correspondência de fontes, segredo versionado e diff/whitespace passaram. .env e backend/.env foram comparados por hash e não mudaram. Os testes selecionaram apenas projetos Docker descartáveis; não operaram os projetos existentes da máquina.

Evidência estruturada: [25-evidencias-impressoras-por-caixa.json](25-evidencias-impressoras-por-caixa.json). Evidências de [instalação nova](../test-evidence/installer-multiprinter-20261023.json), [upgrade](../test-evidence/installer-upgrade-20261023.json) e [ZIP](../test-evidence/installer-multiprinter-package-20261023.json).

Logs gzip UTF-8: [Docker](../test-evidence/multiprinter-docker-20261023.log.gz), [frontend final](../test-evidence/multiprinter-frontend-20261023.log.gz), [Windows](../test-evidence/multiprinter-windows-20261023.log.gz), [instalação nova](../test-evidence/multiprinter-store-20261023.log.gz) e [upgrade](../test-evidence/multiprinter-upgrade-20261023.log.gz).

## Reprodução

```powershell
node infra/test-disposable.mjs --docker --images --backups --seeds
./infra/installer/Test-Installer.ps1 -NodePath (Get-Command node.exe).Source
./infra/installer/Build-Installer.ps1 -Version '1.0.0-store.2' -CompatibleFrom '1.0.0-store.1'
node infra/installer/test-store.mjs --bundle artifacts/POS-Loja-1.0.0-store.2 --evidence docs/test-evidence/installer-multiprinter-20261023.json
node infra/installer/test-store.mjs --bundle artifacts/POS-Loja-1.0.0-store.2 --upgrade-from artifacts/POS-Loja-1.0.0-store.1 --reuse-images --evidence docs/test-evidence/installer-upgrade-20261023.json
```

O builder recusa sobrescrever um pacote existente. Para reproduzir em outra árvore, use uma versão nova e declare compatibilidade somente após seu ensaio. O teste usa projeto fixo pos-installer-smoke, sub-rede 172.29.74.0/24 e porta efêmera em loopback; não execute dois ensaios ao mesmo tempo. --reuse-images verifica IDs do manifesto e pressupõe imagens previamente carregadas.

## Limites operacionais

A saída física foi simulada. Ainda é necessário homologar dois Windows reais, drivers/modelos/papel, login/reboot, rede e conta operacional. O pacote permanece sem assinatura digital de instalador; o runtime Node teve checksum e Authenticode verificados. O CI remoto não foi executado nesta sessão.

Esta entrega não encerra os gates de crédito/inatividade, estoque, cancelamento/reembolso, reconciliação histórica, KPIs ou recuperação do roadmap. Restore e sobrescrita continuam desabilitados. Backup SQL não transporta DPAPI/journals; restauração assistida deve rever permissões, revogações e saídas físicas antes de retomar filas antigas.
