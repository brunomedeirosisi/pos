# Inventário de problemas e melhorias

> Retrato da base anterior à implementação. Decisões de contexto e controles entregues posteriormente: [registro da fase zero](06-contexto-e-fase-zero.md).

Data: **21/10/2026**. Base, método e resultados de execução: [diagnóstico](01-diagnostico-arquitetural.md). Execução planejada: [backlog](03-backlog-tecnico.md) e [roadmap](04-roadmap-implementacao.md).

Foram registrados **39 achados: 4 P0, 26 P1, 7 P2 e 2 P3**. Severidade mede a consequência; prioridade também considera exposição, operação e dependências. Um scanner classificar uma biblioteca como crítica não torna automaticamente o POS crítico. Probabilidades são qualitativas, condicionadas ao cenário descrito.

P0: conter imediatamente o risco de perda/comprometimento antes de ampliar a operação afetada. P1: corrigir confiabilidade, segurança e comportamentos relevantes. P2: estruturar qualidade/manutenção. P3: refinar após estabilizar. Esforço e risco de implementação são relativos. Nenhuma melhoria foi implementada nesta etapa.

## Visão consolidada

| ID | Categoria | Problema identificado | Evidência no código | Impacto | Severidade | Esforço | Prioridade |
|---|---|---|---|---|---|---|---|
| [TEC-001](#tec-001) | Segurança / configuração | Segredos e arquivos legados permanecem versionados | [.env](../../.env):1–3 | Segurança e privacidade | Crítica | Médio | P0 |
| [TEC-002](#tec-002) | DevOps / backup | Imagem da API não fornece os recursos necessários ao backup | [backend/Dockerfile](../../backend/Dockerfile):19–31 | Estabilidade e recuperação de dados | Crítica | Médio | P0 |
| [TEC-003](#tec-003) | Persistência / segurança | Restauração destrói o schema sem coordenar escritas e executa SQL confiado ao upload | [backend/src/utils/backup.ts](../../backend/src/utils/backup.ts):311–385 | Perda de dados, disponibilidade e segurança | Crítica | Alto | P0 |
| [TEC-004](#tec-004) | Persistência / importação | Importação com overwrite confirma a limpeza antes de validar e publicar os dados | [backend/src/services/legacy-import/worker.ts](../../backend/src/services/legacy-import/worker.ts):492–501 | Perda de dados e indisponibilidade operacional | Crítica | Alto | P0 |
| [TEC-005](#tec-005) | Dependências / build | Lockfile ausente do backend impede build reprodutível | [backend/Dockerfile](../../backend/Dockerfile):4–5 | Entrega, estabilidade e rastreabilidade | Alta | Baixo | P1 |
| [TEC-006](#tec-006) | Segurança / arquivos | Extração ZIP vulnerável e uploads sem orçamento descomprimido | [backend/package.json](../../backend/package.json):24–30 | Segurança, disco e disponibilidade | Alta | Médio | P1 |
| [TEC-007](#tec-007) | Segurança / dependências | Runtime fora de suporte e bibliotecas com avisos de segurança | [backend/Dockerfile](../../backend/Dockerfile):1–19 | Segurança e manutenibilidade | Alta | Médio | P1 |
| [TEC-008](#tec-008) | Concorrência / backup | Advisory lock de sessão é adquirido e liberado pelo pool sem conexão dedicada | [backend/src/services/backup-restore-service.ts](../../backend/src/services/backup-restore-service.ts):97–117 | Estabilidade e exclusão mútua | Alta | Médio | P1 |
| [TEC-009](#tec-009) | Recuperação / observabilidade | Controle e catálogo da restauração são sobrescritos pela própria operação | [backend/src/services/backup-restore-service.ts](../../backend/src/services/backup-restore-service.ts):214–219 | Recuperação e rastreabilidade | Alta | Médio | P1 |
| [TEC-010](#tec-010) | Backup / retenção | Retenção pode apagar o arquivo escolhido para restauração | [backend/src/services/backup-restore-service.ts](../../backend/src/services/backup-restore-service.ts):131–143 | Disponibilidade da recuperação | Alta | Baixo | P1 |
| [TEC-011](#tec-011) | Frontend / recuperação | Interface anuncia sucesso mesmo quando a API informa rolled_back | [backend/src/services/backup-restore-service.ts](../../backend/src/services/backup-restore-service.ts):358–364 | Experiência do usuário e decisão operacional | Alta | Baixo | P1 |
| [TEC-012](#tec-012) | Regra de negócio / saldo | Troco é contabilizado como pagamento de dívida do cliente | [backend/src/modules/sales/application/sales-use-cases.ts](../../backend/src/modules/sales/application/sales-use-cases.ts):51–78 | Consistência financeira | Alta | Médio | P1 |
| [TEC-013](#tec-013) | Regra de negócio / precisão | Arredondamento e escala divergem entre itens, total e banco | [backend/src/modules/sales/domain/sales-domain.ts](../../backend/src/modules/sales/domain/sales-domain.ts):114–151 | Consistência financeira e estoque | Alta | Médio | P1 |
| [TEC-014](#tec-014) | Concorrência / saldo | Cancelamento não compartilha bloqueio financeiro do cliente | [backend/src/modules/sales/repository/sales-repository.ts](../../backend/src/modules/sales/repository/sales-repository.ts):406–460 | Consistência de recebíveis | Alta | Médio | P1 |
| [TEC-015](#tec-015) | API / resiliência | Checkout e recebimentos não têm idempotência persistente | [frontend/src/pages/pos/buildSaleInput.ts](../../frontend/src/pages/pos/buildSaleInput.ts):25–43 | Cobrança, estoque e estabilidade | Alta | Médio | P1 |
| [TEC-016](#tec-016) | API / invariantes | API finaliza venda sem pagamento e sem cliente | [backend/src/modules/sales/contracts/sales-contracts.ts](../../backend/src/modules/sales/contracts/sales-contracts.ts):93–105 | Recebíveis e confiabilidade | Alta | Baixo | P1 |
| [TEC-017](#tec-017) | Persistência / comprovantes | Reimpressão de recebimento recalcula saldo passado com dívidas atuais | [backend/src/modules/customer-payments/application/customer-payments-use-cases.ts](../../backend/src/modules/customer-payments/application/customer-payments-use-cases.ts):159–180 | Confiabilidade financeira e experiência do cliente | Alta | Médio | P1 |
| [TEC-018](#tec-018) | Importação / idempotência | Merge entre sessões duplica pagamentos e movimentos de estoque | [backend/src/services/legacy-import/worker.ts](../../backend/src/services/legacy-import/worker.ts):759–824 | Saldos e posição de estoque | Alta | Médio | P1 |
| [TEC-019](#tec-019) | Arquitetura / concorrência | Staging é global e concorrência um vale apenas por worker | [backend/src/services/legacy-import/worker.ts](../../backend/src/services/legacy-import/worker.ts):425–426 | Integridade da migração e escalabilidade | Alta | Médio | P1 |
| [TEC-020](#tec-020) | DevOps / resiliência | Durabilidade de jobs depende de arquivos efêmeros e despacho não reconciliado em execução | [docker-compose.yml](../../docker-compose.yml):37–48 | Confiabilidade e recuperação da importação | Alta | Médio | P1 |
| [TEC-021](#tec-021) | Segurança / autenticação | Login não limita tentativas nem custo de verificação | [backend/src/modules/auth/http/auth-router.ts](../../backend/src/modules/auth/http/auth-router.ts):20–27 | Segurança e disponibilidade | Alta | Médio | P1 |
| [TEC-022](#tec-022) | Segurança / sessão | Logout e troca de senha não revogam JWT emitido | [backend/src/modules/auth/http/auth-router.ts](../../backend/src/modules/auth/http/auth-router.ts):38–43 | Controle de sessão e segurança | Alta | Médio | P1 |
| [TEC-023](#tec-023) | Segurança / estado no frontend | Troca de usuário preserva consultas privadas e carrinho | [frontend/src/store/auth.ts](../../frontend/src/store/auth.ts):32–56 | Privacidade e operação do caixa | Alta | Baixo | P1 |
| [TEC-024](#tec-024) | API / paginação | Listagens e relatório financeiro são truncados sem navegação completa | [backend/src/routes/customers.ts](../../backend/src/routes/customers.ts):137–167 | Acesso aos dados e confiabilidade de relatórios | Alta | Médio | P1 |
| [TEC-025](#tec-025) | Segurança / métricas | Caminhos arbitrários tornam a cardinalidade das métricas ilimitada | [backend/src/observability/metrics.ts](../../backend/src/observability/metrics.ts):11–29 | Memória e disponibilidade | Alta | Baixo | P1 |
| [TEC-026](#tec-026) | Auditoria / privacidade | Eventos financeiros e de acesso não têm trilha de negócio e logs podem conter dados de busca | [backend/src/utils/audit.ts](../../backend/src/utils/audit.ts):12–24 | Rastreabilidade, suporte e privacidade | Alta | Médio | P1 |
| [TEC-027](#tec-027) | Testes / CI | Suíte verde não valida banco, recuperação real nem jornada de caixa | [backend/src/services/backup-restore-service.test.ts](../../backend/src/services/backup-restore-service.test.ts):12–26 | Confiabilidade e prevenção de regressões | Alta | Alto | P1 |
| [TEC-028](#tec-028) | Qualidade / lint | ESLint passa sem habilitar regras de análise | [backend/.eslintrc.cjs](../../backend/.eslintrc.cjs):1–10 | Manutenibilidade e testabilidade | Média | Baixo | P2 |
| [TEC-029](#tec-029) | Arquitetura / componentização | Worker concentra responsabilidades e CRUDs repetem implementação | [backend/src/services/legacy-import/worker.ts](../../backend/src/services/legacy-import/worker.ts):390–449 | Manutenibilidade, extensibilidade e testes | Média | Alto | P2 |
| [TEC-030](#tec-030) | Frontend / cache | Chaves e invalidações deixam cadastros e saldos obsoletos | [frontend/src/pages/catalog/ProductsPage.tsx](../../frontend/src/pages/catalog/ProductsPage.tsx):36–68 | Experiência do usuário e consistência visual | Média | Médio | P2 |
| [TEC-031](#tec-031) | API / erros e validação | Entradas inválidas viram 500 e falhas de integração perdem status útil | [backend/src/routes/products.ts](../../backend/src/routes/products.ts):174–183 | Contratos, suporte e experiência do usuário | Média | Médio | P2 |
| [TEC-032](#tec-032) | Dashboard / qualidade dos dados | Importação presume horário de pagamento e margens usam dados mutáveis | [backend/sql/init.sql](../../backend/sql/init.sql):68–82 | Confiabilidade de indicadores | Alta | Médio | P1 |
| [TEC-033](#tec-033) | Desempenho / limites de recursos | Dashboard e processamento não têm orçamento explícito de consulta/volume | [backend/src/modules/dashboard/contracts/dashboard-contracts.ts](../../backend/src/modules/dashboard/contracts/dashboard-contracts.ts):22–37 | Disponibilidade, desempenho e escalabilidade | Alta | Médio | P1 |
| [TEC-034](#tec-034) | Integração / impressão | Agente não limita requisições e protocolo permite resultado incerto | [agent/src/index.ts](../../agent/src/index.ts):90–125 | Segurança local, disponibilidade e experiência do caixa | Alta | Médio | P1 |
| [TEC-035](#tec-035) | Validação / qualidade | Conversores numéricos transformam texto inválido em zero ou outro valor | [backend/src/routes/products.ts](../../backend/src/routes/products.ts):22–49 | Qualidade do cadastro e valores financeiros | Média | Baixo | P2 |
| [TEC-036](#tec-036) | Frontend / acessibilidade | Modal permite fuga inicial de foco e campos do PDV não têm nome acessível | [frontend/src/components/ui/Modal.tsx](../../frontend/src/components/ui/Modal.tsx):28–65 | Acessibilidade e experiência do usuário | Média | Baixo | P2 |
| [TEC-037](#tec-037) | Frontend / carregamento | Rotas são carregadas em um único bundle principal | [frontend/src/App.tsx](../../frontend/src/App.tsx):3–23 | Desempenho percebido | Baixa | Baixo | P3 |
| [TEC-038](#tec-038) | Banco / migrações | Checksums de migração são gravados mas não verificados | [backend/src/services/migrations.ts](../../backend/src/services/migrations.ts):32–59 | Consistência entre ambientes e releases | Média | Médio | P2 |
| [TEC-039](#tec-039) | Documentação / configuração | Documentação e variáveis de implantação divergem do artefato entregue | [README.md](../../README.md):44–51 | Manutenibilidade e operação | Baixa | Baixo | P3 |

## Detalhamento verificável

<a id="tec-001"></a>

### TEC-001 — Segredos e arquivos legados permanecem versionados

- **Natureza e certeza:** Vulnerabilidade / controle de segurança. Exposição comprovada no repositório; uso em produção e natureza dos DBFs não verificados.
- **Classificação:** Crítica; P0; esforço médio; risco de implementação médio. Probabilidade: Alta para leitores do repositório; exposição pública desconhecida.
- **Descrição técnica:** git ls-files confirma .env e backend/.env com segredos não vazios, além de POS-DATA/CLIENTES.DBF, CLIENTES.DBT e ESTOQ.SNH. O ignore não remove arquivos já rastreados. Nenhum valor nem registro pessoal foi reproduzido.
- **Causa-raiz provável:** Confusão entre ignorar novos arquivos e retirar conteúdo já incluído no Git.
- **Evidências:** [.env](../../.env):1–3; [backend/.env](../../backend/.env):1–1; [.gitignore](../../.gitignore):26–41.
- **Risco e impacto:** Acesso às credenciais por quem recebe clone/artefato; possível distribuição desnecessária de dados pessoais e material legado.
- **Solução recomendada:** Inventariar consumidores, rotacionar segredos aplicáveis e retirar arquivos sensíveis do índice em mudança própria; substituir dados de teste por fixtures sintéticas. Tratar histórico, clones e artefatos após avaliar alcance e coordenar a operação.
- **Componentes impactados:** `.env`, `backend`, `.gitignore`.
- **Dependências:** Nenhuma dependência técnica obrigatória; usar ambiente de validação isolado.
- **Critérios de aceitação:** Nenhum segredo ativo nos arquivos rastreados; valores anteriores rejeitados onde eram usados; nenhuma massa pessoal no clone de teste; fixtures sintéticas suficientes para os testes.
- **Validação e reversão:** Scanner de segredos com valores mascarados; validação de login/integrações após rotação; inventário de arquivos rastreados e artefatos. Manter segredo anterior apenas durante janela controlada de transição quando indispensável; não reintroduzir credenciais expostas no Git.
- **Atividade planejada:** [TSK-001 — Retirar segredos e classificar dados legados](03-backlog-tecnico.md#tsk-001).

<a id="tec-002"></a>

### TEC-002 — Imagem da API não fornece os recursos necessários ao backup

- **Natureza e certeza:** Bug / inconsistência funcional. Defeito de configuração comprovado; imagem não construída nesta auditoria.
- **Classificação:** Crítica; P0; esforço médio; risco de implementação médio. Probabilidade: Alta no Compose fornecido.
- **Descrição técnica:** O runner Node Alpine não instala pg_dump/psql. BACKUP_PATH cai em /var/backups/pos sem provisionamento de permissão para USER pos. Compose não monta backup/importações. Mesmo corrigindo ferramentas/permissões, backups guardados na camada do container desaparecem ao recriá-lo.
- **Causa-raiz provável:** Empacotamento HTTP não incorporou requisitos do serviço de recuperação.
- **Evidências:** [backend/Dockerfile](../../backend/Dockerfile):19–31; [docker-compose.yml](../../docker-compose.yml):15–52; [backend/src/config/env.ts](../../backend/src/config/env.ts):21–30; [backend/src/utils/backup.ts](../../backend/src/utils/backup.ts):208–237.
- **Risco e impacto:** Backup indisponível quando necessário e catálogo de backups apontando para arquivos inexistentes após recriação.
- **Solução recomendada:** Provisionar cliente PostgreSQL compatível com servidor 16, diretórios pertencentes ao usuário da API e volume durável de backups; incluir preflight operacional e destino de cópia fora do host. Definir capacidade, retenção e restauração verificável.
- **Componentes impactados:** `backend`, `docker-compose.yml`, `backend/src/config`, `backend/src/utils`.
- **Dependências:** [TSK-005](03-backlog-tecnico.md#tsk-005)
- **Critérios de aceitação:** Imagem limpa contém versões compatíveis de pg_dump/psql; usuário sem root consegue gravar o volume; backup sintético continua disponível após recriar a API; restauração em banco descartável recupera linhas e relações esperadas.
- **Validação e reversão:** Smoke test da imagem final, pg_dump e restore reais em banco descartável; recriação de container preservando volume; falha de espaço/permissão. Preservar e verificar cópia externa antes de trocar imagem/volumes; reversão da imagem não pode remover volumes nem os arquivos existentes.
- **Atividade planejada:** [TSK-002 — Tornar o backup executável e durável na imagem final](03-backlog-tecnico.md#tsk-002).

<a id="tec-003"></a>

### TEC-003 — Restauração destrói o schema sem coordenar escritas e executa SQL confiado ao upload

- **Natureza e certeza:** Risco arquitetural / confiabilidade. Caminho destrutivo comprovado; perda concorrente e abuso dependem da execução.
- **Classificação:** Crítica; P0; esforço alto; risco de implementação alto. Probabilidade: Alta se usada com operação ativa; exploração requer permissão de restore.
- **Descrição técnica:** DROP SCHEMA, CREATE SCHEMA e importação são processos separados. Não há bloqueio das vendas/recebimentos ou do worker. Escritas confirmadas entre snapshot e substituição podem desaparecer. O SQL enviado é executado por psql com as mesmas credenciais da API/banco; um banco temporário no mesmo servidor não limita comandos SQL ou metacomandos do cliente.
- **Causa-raiz provável:** Recuperação tratada como requisição CRUD comum e simulação confundida com isolamento de confiança.
- **Evidências:** [backend/src/utils/backup.ts](../../backend/src/utils/backup.ts):311–385; [backend/src/utils/backup.ts](../../backend/src/utils/backup.ts):416–484; [backend/src/services/backup-restore-service.ts](../../backend/src/services/backup-restore-service.ts):245–282; [backend/src/app.ts](../../backend/src/app.ts):69–81; [docker-compose.yml](../../docker-compose.yml):24–28; [docker-compose.yml](../../docker-compose.yml):60–70.
- **Risco e impacto:** Operação parcial ou perda de vendas reconhecidas; arquivo não confiável pode executar ações além de carregar tabelas. O usuário POSTGRES_USER inicial do Compose é também a identidade da API; privilégios reais externos não foram inspecionados.
- **Solução recomendada:** Introduzir execução operacional restrita, coordenação de manutenção e drenagem de todas as escritas/worker, recuperação validada em alvo separado e cutover controlado. Separar credenciais de aplicação/migração/recuperação e aceitar apenas backups de origem confiável, com controles de autenticidade e executor isolado; validar invariantes antes de liberar operação.
- **Componentes impactados:** `backend/src/utils`, `backend/src/services`, `backend/src`, `docker-compose.yml`.
- **Dependências:** [TSK-002](03-backlog-tecnico.md#tsk-002), [TSK-006](03-backlog-tecnico.md#tsk-006), [TSK-008](03-backlog-tecnico.md#tsk-008), [TSK-009](03-backlog-tecnico.md#tsk-009), [TSK-010](03-backlog-tecnico.md#tsk-010)
- **Critérios de aceitação:** Venda confirmada durante a janela não é perdida; mutações recebem resposta explícita de manutenção ou são drenadas; falha em cada etapa conserva alvo anterior recuperável; arquivos externos não executam comandos arbitrários no host de aplicação; reconciliação completa precede reabertura.
- **Validação e reversão:** Em ambiente descartável: vendas concorrentes, interrupção de cada etapa, replay após falha, backup incompatível e prova de privilégio mínimo; testes de arquivo controlados no executor isolado. Conservar banco anterior e snapshot independente até validação; retornar ao alvo anterior por procedimento ensaiado, sem sobrescrever novas escritas.
- **Atividade planejada:** [TSK-003 — Isolar e coordenar restauração com preservação de escritas](03-backlog-tecnico.md#tsk-003).
- **Referência externa e aplicabilidade:** Arquivos de psql aceitam SQL e metacomandos do cliente: [documentação do PostgreSQL 16](https://www.postgresql.org/docs/16/app-psql.html). A necessidade de isolamento do executor é uma inferência da combinação desse comportamento com o fluxo de upload/restauração.

<a id="tec-004"></a>

### TEC-004 — Importação com overwrite confirma a limpeza antes de validar e publicar os dados

- **Natureza e certeza:** Bug / inconsistência funcional. Defeito transacional comprovado por leitura do fluxo.
- **Classificação:** Crítica; P0; esforço alto; risco de implementação alto. Probabilidade: Alta diante de DBF inválido ou falha de etapa posterior.
- **Descrição técnica:** reset-target usa TRUNCATE CASCADE de todas as tabelas operacionais, inclusive vendas nativas, e confirma sua própria transação. Parsing, casts e migrações acontecem depois em outras transações. Uma etapa posterior falhar não restaura os dados anteriores; o retry conserva o checkpoint de reset concluído.
- **Causa-raiz provável:** Atomicidade por etapa foi usada onde a publicação/substituição precisava de uma fronteira de recuperação própria.
- **Evidências:** [backend/src/services/legacy-import/worker.ts](../../backend/src/services/legacy-import/worker.ts):492–501; [backend/src/services/legacy-import/worker.ts](../../backend/src/services/legacy-import/worker.ts):1427–1455; [backend/src/services/legacy-import/worker.ts](../../backend/src/services/legacy-import/worker.ts):1493–1525.
- **Risco e impacto:** Base vazia ou parcialmente reconstruída, perda de UUIDs/referências operacionais e mistura de dados novos com importação incompleta.
- **Solução recomendada:** Preparar e validar staging sem apagar o core; produzir plano de impacto por origem; exigir snapshot verificado e manutenção antes de publicar overwrite. Publicar em transação final delimitada ou alvo separado conforme volume, com decisão explícita sobre preservar dados nativos.
- **Componentes impactados:** `backend/src/services/legacy-import`.
- **Dependências:** [TSK-002](03-backlog-tecnico.md#tsk-002), [TSK-003](03-backlog-tecnico.md#tsk-003), [TSK-019](03-backlog-tecnico.md#tsk-019)
- **Critérios de aceitação:** Arquivo obrigatório inválido, erro de cast ou processo encerrado antes da publicação deixam o core original intacto; contagens/totais/referências são reconciliados antes de publicar; escopo de overwrite é exibido e aprovado; reexecução não perde dados nativos por acidente.
- **Validação e reversão:** Fixtures DBF sintéticas com erro em cada etapa, falha de processo, rollback e reconciliação de chaves/valores; cenários overwrite e merge. Restaurar snapshot/alvo anterior validado; não tentar reconstruir manualmente registros excluídos usando logs incompletos.
- **Atividade planejada:** [TSK-004 — Preparar importação antes de substituir o core](03-backlog-tecnico.md#tsk-004).

<a id="tec-005"></a>

### TEC-005 — Lockfile ausente do backend impede build reprodutível

- **Natureza e certeza:** Bug / inconsistência funcional. Defeito comprovado no estado de trabalho.
- **Classificação:** Alta; P1; esforço baixo; risco de implementação baixo. Probabilidade: Alta em checkout desse estado.
- **Descrição técnica:** backend/package-lock.json está rastreado no HEAD, mas foi removido localmente. O Dockerfile exige npm ci. CI usa npm install e pode resolver dependências diferentes, ocultando o bloqueio da imagem.
- **Causa-raiz provável:** Políticas diferentes de instalação e ausência de verificação do lockfile no fluxo de entrega.
- **Evidências:** [backend/Dockerfile](../../backend/Dockerfile):4–5; [.github/workflows/ci.yml](../../.github/workflows/ci.yml):24–39; [backend/package.json](../../backend/package.json):17–57.
- **Risco e impacto:** Imagem não construível a partir do estado auditado e versões não identificáveis da aplicação implantada.
- **Solução recomendada:** Após revisar a alteração local, restaurar ou gerar deliberadamente o lockfile apropriado e versioná-lo junto do manifesto. Alinhar npm ci em CI/containers e fixar a versão da ferramenta usada pela equipe.
- **Componentes impactados:** `backend`, `.github/workflows`.
- **Dependências:** Nenhuma dependência técnica obrigatória; usar ambiente de validação isolado.
- **Critérios de aceitação:** Checkout limpo instala com npm ci sem alterar manifesto/lock; build Docker passa; a mesma revisão produz a mesma árvore resolvida nas etapas de CI.
- **Validação e reversão:** npm ci em checkout descartável e build de imagem final; comparação de checksum do lock antes/depois. Reverter manifesto e lockfile como par; preservar o lock aprovado anterior para reproduzir releases existentes.
- **Atividade planejada:** [TSK-005 — Restabelecer instalação reprodutível do backend](03-backlog-tecnico.md#tsk-005).
- **Referência externa e aplicabilidade:** npm ci exige lockfile existente e consistente: [documentação oficial npm](https://docs.npmjs.com/cli/v11/commands/npm-ci/).

<a id="tec-006"></a>

### TEC-006 — Extração ZIP vulnerável e uploads sem orçamento descomprimido

- **Natureza e certeza:** Vulnerabilidade / controle de segurança. Dependência e chamadas comprovadas; exploração não executada.
- **Classificação:** Alta; P1; esforço médio; risco de implementação médio. Probabilidade: Média; exige acesso às rotas administrativas.
- **Descrição técnica:** extract-zip 2.0.1 é chamado com arquivos recebidos. Há avisos de symlinks/escape de diretório, sem patch publicado na consulta. Limites de Multer cobrem o comprimido, não total extraído/quantidade de entradas. Na importação, schema, confirmação e senha são validados antes de entrar no finally de limpeza, deixando temporários em rejeições.
- **Causa-raiz provável:** Validação baseada em extensão/MIME e ausência de política única de extração e ciclo de vida do upload.
- **Evidências:** [backend/package.json](../../backend/package.json):24–30; [backend/src/modules/backup/http/backup-router.ts](../../backend/src/modules/backup/http/backup-router.ts):94–119; [backend/src/utils/backup.ts](../../backend/src/utils/backup.ts):174–203; [backend/src/services/legacy-import/worker.ts](../../backend/src/services/legacy-import/worker.ts):404–419; [backend/src/modules/legacy-import/http/legacy-import-router.ts](../../backend/src/modules/legacy-import/http/legacy-import-router.ts):61–86; [backend/src/modules/legacy-import/http/legacy-import-router.ts](../../backend/src/modules/legacy-import/http/legacy-import-router.ts):135–137.
- **Risco e impacto:** Leitura/escrita fora do destino conforme arquivo e permissões; exaustão de disco e acúmulo de dados sensíveis em temporários.
- **Solução recomendada:** Substituir ou encapsular a extração com validação prévia de todas as entradas, recusando symlinks, caminhos absolutos, colisões e escapes; limitar bytes reais, quantidade/profundidade e tempo. Abranger todo o handler no cleanup e recolher sessões órfãs com retenção definida.
- **Componentes impactados:** `backend`, `backend/src/modules/backup/http`, `backend/src/utils`, `backend/src/services/legacy-import`, `backend/src/modules/legacy-import/http`.
- **Dependências:** Nenhuma dependência técnica obrigatória; usar ambiente de validação isolado.
- **Critérios de aceitação:** Nenhuma entrada alcança caminho fora do diretório exclusivo; arquivos com symlinks/colisões são recusados; orçamento extraído interrompe processamento; erro de schema, senha ou confirmação não deixa arquivos; ZIPs legítimos continuam aceitos.
- **Validação e reversão:** Arquivos sintéticos confinados em diretório descartável para traversal/symlink/colisão e tamanho; rejeições precoces e cancelamento do upload; compatibilidade com DBF/DBT legítimos. Preservar interface de upload e feature flag para suspender apenas ZIP mantendo DBF/DBT validados, caso a nova extração apresente incompatibilidade.
- **Atividade planejada:** [TSK-006 — Confinar extração ZIP e completar cleanup de uploads](03-backlog-tecnico.md#tsk-006).
- **Referência externa e aplicabilidade:** [Relato original de symlinks](https://github.com/ziad626/extract-zip-security-research/security/advisories/GHSA-x7jf-2287-qcpf) e [discussão de correção no projeto](https://github.com/max-mapper/extract-zip/pull/160). Limites da aplicação foram confirmados no código; não foi executado exploit.

<a id="tec-007"></a>

### TEC-007 — Runtime fora de suporte e bibliotecas com avisos de segurança

- **Natureza e certeza:** Vulnerabilidade / controle de segurança. Versões/intervalos e avisos externos verificados; aplicabilidade varia por componente.
- **Classificação:** Alta; P1; esforço médio; risco de implementação médio. Probabilidade: Média; Multer requer permissão de upload, avisos de dev dependem do servidor exposto.
- **Descrição técnica:** Node 20 está EOL em 21/10/2026. Multer ^1.4.5-lts.1 resolve 1.4.5-lts.2, atingido por aviso oficial, mesmo não listado pelo audit consultado. Lockfiles de frontend/agente têm avisos adicionais; a maioria dos críticos da suíte depende de condições ausentes no script vitest run.
- **Causa-raiz provável:** Sem rotina de atualização, matriz de suporte e triagem por superfície alcançável.
- **Evidências:** [backend/Dockerfile](../../backend/Dockerfile):1–19; [frontend/Dockerfile](../../frontend/Dockerfile):1–13; [.github/workflows/ci.yml](../../.github/workflows/ci.yml):24–27; [backend/package.json](../../backend/package.json):24–24; [frontend/package.json](../../frontend/package.json):23–36; [frontend/vite.config.ts](../../frontend/vite.config.ts):9–10; [agent/package-lock.json](../../agent/package-lock.json):1–20.
- **Risco e impacto:** Exposição a falhas conhecidas e dificuldade de atualizar a cadeia mais tarde. Contagem do scanner não equivale à severidade da aplicação; agente não usa trust proxy no código atual.
- **Solução recomendada:** Alinhar Node suportado em CI/imagens/desenvolvimento; atualizar Multer para linha 2.x corrigida atual com testes de multipart. Revisar lockfiles e atualizar router/build/test por grupos compatíveis. Restringir dev server à interface necessária; registrar exceções justificadas e digest das imagens. Revisar morgan, @types/morgan e iconv-lite, sem imports localizados no código/scripts, antes de remover dependências diretas.
- **Componentes impactados:** `backend`, `frontend`, `.github/workflows`, `agent`.
- **Dependências:** [TSK-005](03-backlog-tecnico.md#tsk-005)
- **Critérios de aceitação:** Runtime suportado e equivalente em CI/imagens; Multer fora das faixas afetadas consultadas; cada aviso remanescente tem alcance e decisão registrados; testes/build/upload passam; nenhuma atualização major automática sem validação.
- **Validação e reversão:** Scanner de dependências e imagens, multipart adversarial em ambiente isolado, regressão de rotas/autenticação, build/execução no runtime escolhido. Atualizar um grupo por release e reter imagem/lock anterior; não fazer downgrade silencioso para dependência sabidamente vulnerável sem contenção.
- **Atividade planejada:** [TSK-007 — Atualizar runtime e dependências por superfície de risco](03-backlog-tecnico.md#tsk-007).
- **Referência externa e aplicabilidade:** [Calendário Node.js](https://github.com/nodejs/Release#release-schedule), [aviso Multer](https://github.com/expressjs/multer/security/advisories/GHSA-4pg4-qvpc-4q3h), [Vite em Windows](https://github.com/vitejs/vite/security/advisories/GHSA-fx2h-pf6j-xcff) e [Vitest UI/API](https://github.com/vitest-dev/vitest/security/advisories/GHSA-5xrq-8626-4rwp). Os avisos de desenvolvimento dependem das condições descritas pelos mantenedores.

<a id="tec-008"></a>

### TEC-008 — Advisory lock de sessão é adquirido e liberado pelo pool sem conexão dedicada

- **Natureza e certeza:** Risco arquitetural / confiabilidade. Uso incorreto comprovado; falha sob concorrência ainda não executada em PostgreSQL.
- **Classificação:** Alta; P1; esforço médio; risco de implementação médio. Probabilidade: Média sob carga ou múltiplas instâncias.
- **Descrição técnica:** withBackupLock chama pg_try_advisory_lock e pg_advisory_unlock por query, que usa pool.query. Cada chamada pode ir para uma sessão diferente. O retorno do unlock não é conferido e erros são descartados. processLock protege somente a instância atual.
- **Causa-raiz provável:** Semântica de lock por sessão não foi associada ao ciclo de vida de PoolClient.
- **Evidências:** [backend/src/services/backup-restore-service.ts](../../backend/src/services/backup-restore-service.ts):97–117; [backend/src/db.ts](../../backend/src/db.ts):13–21.
- **Risco e impacto:** Locks abandonados e bloqueio de operações futuras; exclusão mútua entre instâncias deixa de ter garantia verificável.
- **Solução recomendada:** Reservar PoolClient durante toda a operação; adquirir/liberar na mesma sessão em finally e verificar o desbloqueio. Incluir upload/delete/retention na coordenação das operações que alteram arquivos protegidos.
- **Componentes impactados:** `backend/src/services`, `backend/src`.
- **Dependências:** Nenhuma dependência técnica obrigatória; usar ambiente de validação isolado.
- **Critérios de aceitação:** Identificador de sessão é o mesmo em aquisição/liberação; operação concorrente de outra instância é recusada; após sucesso/erro não resta lock; exclusão/upload não removem arquivo em uso.
- **Validação e reversão:** Dois clientes/processos reais, pool ocupado, falha injetada no trabalho e falha de conexão; inspeção de pg_locks. Manter a operação administrativa suspensa se não for possível assegurar liberação; encerrar apenas a conexão dedicada sob controle operacional.
- **Atividade planejada:** [TSK-008 — Manter conexão dedicada para exclusão mútua de backup](03-backlog-tecnico.md#tsk-008).
- **Referência externa e aplicabilidade:** Locks de sessão devem ser liberados pela mesma sessão: [PostgreSQL 16](https://www.postgresql.org/docs/16/functions-admin.html#FUNCTIONS-ADVISORY-LOCKS). O pool permite reservar um cliente para uma unidade de trabalho: [node-postgres](https://node-postgres.com/features/pooling).

<a id="tec-009"></a>

### TEC-009 — Controle e catálogo da restauração são sobrescritos pela própria operação

- **Natureza e certeza:** Risco arquitetural / confiabilidade. Defeito de desenho comprovado pelo schema e fluxo.
- **Classificação:** Alta; P1; esforço médio; risco de implementação médio. Probabilidade: Alta ao restaurar arquivo anterior ao início da operação.
- **Descrição técnica:** system_backup_operation, audit_log e system_backup estão no schema public removido. O operationId e o snapshot registrados depois do dump não existem no banco restaurado. finishOperation faz update sem verificar rowCount. O ator atual também pode não existir no arquivo antigo, fazendo a auditoria pós-restore falhar por FK e disparar rollback de restauração que havia terminado.
- **Causa-raiz provável:** Plano de controle da recuperação armazenado dentro do conjunto que ele substitui.
- **Evidências:** [backend/src/services/backup-restore-service.ts](../../backend/src/services/backup-restore-service.ts):214–219; [backend/src/services/backup-restore-service.ts](../../backend/src/services/backup-restore-service.ts):260–295; [backend/src/services/backup-restore-service.ts](../../backend/src/services/backup-restore-service.ts):77–94; [backend/src/utils/backup.ts](../../backend/src/utils/backup.ts):416–484; [backend/sql/init.sql](../../backend/sql/init.sql):163–198.
- **Risco e impacto:** Status de sucesso/rollback sem registro durável, snapshot não descoberto pela UI e rollback disparado por erro de auditoria.
- **Solução recomendada:** Manter journal e manifesto de arquivos fora do schema alvo, em armazenamento durável, com reconciliação posterior do catálogo e identidade do solicitante desacoplada de FK do banco restaurado. Separar falha de restore de falha de registrar auditoria.
- **Componentes impactados:** `backend/src/services`, `backend/src/utils`, `backend/sql`.
- **Dependências:** [TSK-002](03-backlog-tecnico.md#tsk-002)
- **Critérios de aceitação:** Restauração de backup anterior à criação do ator/operação mantém journal completo e snapshot descobrível; status final é verificável após restart; falha de auditoria não desfaz dados válidos automaticamente.
- **Validação e reversão:** Restore descartável de arquivo antigo, usuário ausente, reinício entre cutover e registro e reconciliação de catálogo. Preservar journal anterior append-only e cópia externa do manifesto durante migração; permitir leitura do formato anterior.
- **Atividade planejada:** [TSK-009 — Separar journal e catálogo do alvo restaurado](03-backlog-tecnico.md#tsk-009).

<a id="tec-010"></a>

### TEC-010 — Retenção pode apagar o arquivo escolhido para restauração

- **Natureza e certeza:** Bug / inconsistência funcional. Defeito comprovado no ordenamento das operações.
- **Classificação:** Alta; P1; esforço baixo; risco de implementação baixo. Probabilidade: Alta ao selecionar o backup mais antigo com retenção cheia.
- **Descrição técnica:** Após validar/simular o backup alvo, a rotina cria snapshot e aplica retenção por created_at antes de abrir o alvo novamente. Com sete backups e retenção sete, o snapshot pode excluir justamente o mais antigo selecionado. A restauração falha e pode executar rollback desnecessário.
- **Causa-raiz provável:** Retenção não conhece arquivos referenciados por operações em andamento.
- **Evidências:** [backend/src/services/backup-restore-service.ts](../../backend/src/services/backup-restore-service.ts):131–143; [backend/src/services/backup-restore-service.ts](../../backend/src/services/backup-restore-service.ts):257–282.
- **Risco e impacto:** Impossibilidade de restaurar backup ainda apresentado como válido e destruição indevida do alvo durante uma recuperação.
- **Solução recomendada:** Fixar/pinar alvo e snapshot até concluir a operação; excluir esses nomes da retenção e coordenar delete manual pelo mesmo mecanismo.
- **Componentes impactados:** `backend/src/services`.
- **Dependências:** Nenhuma dependência técnica obrigatória; usar ambiente de validação isolado.
- **Critérios de aceitação:** Restaurar o mais antigo com retenção cheia não o remove durante a operação; snapshot de rollback permanece protegido até decisão final; retenção posterior respeita política e catálogo.
- **Validação e reversão:** Sete backups, alvo mais antigo, criação de snapshot, exclusão concorrente e falha de restauração. Desativar apenas a limpeza automática se houver dúvida, com monitoramento de espaço; preservar todos os arquivos referenciados.
- **Atividade planejada:** [TSK-010 — Proteger alvo e snapshot contra retenção/exclusão](03-backlog-tecnico.md#tsk-010).

<a id="tec-011"></a>

### TEC-011 — Interface anuncia sucesso mesmo quando a API informa rolled_back

- **Natureza e certeza:** Bug / inconsistência funcional. Bug comprovado no tratamento da resposta.
- **Classificação:** Alta; P1; esforço baixo; risco de implementação baixo. Probabilidade: Alta quando o rollback automático é acionado.
- **Descrição técnica:** O backend retorna HTTP 200 com restored=false, rollbackApplied=true e status=rolled_back. onSuccess ignora esse conteúdo e mostra restoreSuccess. O fluxo upload+restore descarta completamente o resultado.
- **Causa-raiz provável:** Resultado HTTP tratado como sucesso de negócio sem discriminante.
- **Evidências:** [backend/src/services/backup-restore-service.ts](../../backend/src/services/backup-restore-service.ts):358–364; [frontend/src/pages/admin/BackupRestorePage.tsx](../../frontend/src/pages/admin/BackupRestorePage.tsx):65–95.
- **Risco e impacto:** Operador acredita ter restaurado um backup enquanto permanece com o snapshot anterior.
- **Solução recomendada:** Propagar o resultado de restore nos dois fluxos e apresentar estados distintos para restaurado, revertido e falhou; mostrar operationId recuperável e orientar ação seguinte.
- **Componentes impactados:** `backend/src/services`, `frontend/src/pages/admin`.
- **Dependências:** Nenhuma dependência técnica obrigatória; usar ambiente de validação isolado.
- **Critérios de aceitação:** Resposta rolled_back nunca produz toast de restauração concluída; os dois fluxos exibem status e identificador corretos; estado desconhecido não é tratado como sucesso.
- **Validação e reversão:** Teste de componente/contrato com respostas ok, rolled_back, erro e timeout. Reverter apresentação mantendo mensagem conservadora e registro do resultado bruto mascarado para suporte.
- **Atividade planejada:** [TSK-011 — Apresentar resultado real da restauração na UI](03-backlog-tecnico.md#tsk-011).

<a id="tec-012"></a>

### TEC-012 — Troco é contabilizado como pagamento de dívida do cliente

- **Natureza e certeza:** Bug / inconsistência funcional. Defeito de fórmula comprovado.
- **Classificação:** Alta; P1; esforço médio; risco de implementação alto. Probabilidade: Alta quando venda associada a cliente recebe valor maior que o total.
- **Descrição técnica:** Checkout permite valor entregue maior que total e guarda amount_paid bruto com change_amount. Totais do cliente e validação de cancelamento somam amount_paid sem subtrair troco. Exemplo: venda R$ 100, entregue R$ 150, troco R$ 50 gera saldo de -R$ 50; havendo dívida anterior, ela é reduzida indevidamente.
- **Causa-raiz provável:** Um campo representa dinheiro entregue, mas os consumidores o interpretam como pagamento aplicado.
- **Evidências:** [backend/src/modules/sales/application/sales-use-cases.ts](../../backend/src/modules/sales/application/sales-use-cases.ts):51–78; [backend/src/modules/customer-payments/repository/customer-payments-repository.ts](../../backend/src/modules/customer-payments/repository/customer-payments-repository.ts):97–112; [backend/src/routes/customers.ts](../../backend/src/routes/customers.ts):229–256; [backend/src/modules/sales/repository/sales-repository.ts](../../backend/src/modules/sales/repository/sales-repository.ts):434–454.
- **Risco e impacto:** Cobrança inferior ao devido, bloqueio incorreto de cancelamento e relatórios divergentes.
- **Solução recomendada:** Definir pagamento líquido aplicado, preservando valor entregue/troco do comprovante. Centralizar a fórmula e usá-la nos totais, histórico e cancelamento. Reconciliar dados existentes com relatório antes de qualquer ajuste persistente.
- **Componentes impactados:** `backend/src/modules/sales/application`, `backend/src/modules/customer-payments/repository`, `backend/src/routes`, `backend/src/modules/sales/repository`.
- **Dependências:** [TSK-013](03-backlog-tecnico.md#tsk-013)
- **Critérios de aceitação:** O caso 100/150/50 deixa saldo zero dessa venda e não paga dívida anterior; caixa, detalhe, pagamentos e cancelamento concordam; vendas legadas com valores nulos têm política explícita.
- **Validação e reversão:** Dinheiro exato, troco, dívida anterior, pagamento avulso, cancelamento e dados legados; comparação SQL/domínio em base sintética. Disponibilizar relatório antes/depois e reverter fórmula por versão; não sobrescrever amount_paid histórico sem cópia e reconciliação.
- **Atividade planejada:** [TSK-012 — Contabilizar pagamento líquido de troco](03-backlog-tecnico.md#tsk-012).

<a id="tec-013"></a>

### TEC-013 — Arredondamento e escala divergem entre itens, total e banco

**Atualização em 22/10/2026:** [primeiro corte monetário implementado e validado](12-fase-tres-primeiro-corte.md). Cálculo por linha em centavos, precisão de checkout/recebimento e prévia alinhados; constraints e ampliação às demais entradas/histórico permanecem pendentes. As evidências originais abaixo descrevem a base auditada.

- **Natureza e certeza:** Bug / inconsistência funcional. Divergência reproduzida em funções reais; efeito SQL inferido do schema.
- **Classificação:** Alta; P1; esforço médio; risco de implementação alto. Probabilidade: Alta com quantidades fracionárias ou entradas subcentavo.
- **Descrição técnica:** Itens são arredondados com toFixed(2), mas subtotal é recalculado dos produtos não arredondados. Dois itens de 0,5 × R$ 0,01 somam R$ 0,02 nos itens e R$ 0,01 no total da API. Schemas aceitam quantity=0.0001 e pagamento=0.001, incompatíveis com as escalas de persistência.
- **Causa-raiz provável:** Ausência de política monetária/quantitativa única e de limites ligados ao schema SQL.
- **Evidências:** [backend/src/modules/sales/domain/sales-domain.ts](../../backend/src/modules/sales/domain/sales-domain.ts):114–151; [frontend/src/pages/pos/pricing.ts](../../frontend/src/pages/pos/pricing.ts):48–59; [backend/src/modules/sales/contracts/sales-contracts.ts](../../backend/src/modules/sales/contracts/sales-contracts.ts):75–105; [backend/src/modules/customer-payments/contracts/customer-payments-contracts.ts](../../backend/src/modules/customer-payments/contracts/customer-payments-contracts.ts):24–29; [backend/sql/init.sql](../../backend/sql/init.sql):93–99; [backend/sql/init.sql](../../backend/sql/init.sql):144–149.
- **Risco e impacto:** Diferenças entre recibo/cobrança, quantidade persistida zero ou diferente e pagamentos rejeitados apenas pelo banco.
- **Solução recomendada:** Aprovar arredondamento por linha versus agregado, representar moeda em centavos ou decimal exato e normalizar quantidade na escala contratada antes do cálculo. Validar precisão, finitude e limites; adicionar constraints para invariantes locais após reconciliar dados.
- **Componentes impactados:** `backend/src/modules/sales/domain`, `frontend/src/pages/pos`, `backend/src/modules/sales/contracts`, `backend/src/modules/customer-payments/contracts`, `backend/sql`.
- **Dependências:** Nenhuma dependência técnica obrigatória; usar ambiente de validação isolado.
- **Critérios de aceitação:** Soma de linhas menos desconto coincide exatamente com total e prévia; não há valor positivo que persista como zero; escala excedente é recusada ou normalizada de forma documentada; banco e API concordam nos limites.
- **Validação e reversão:** Casos 0.5×0.01 em duas linhas, centavos, descontos, 0.0001, 0.001, limite numeric(14,*) e propriedades de soma em SQL e funções. Versionar política de cálculo; preservar valores já emitidos e não recalcular comprovantes antigos indiscriminadamente.
- **Atividade planejada:** [TSK-013 — Unificar política monetária e escala de quantidade](03-backlog-tecnico.md#tsk-013).

<a id="tec-014"></a>

### TEC-014 — Cancelamento não compartilha bloqueio financeiro do cliente

- **Natureza e certeza:** Risco arquitetural / confiabilidade. Interleaving inválido demonstrável por leitura; teste concorrente real pendente.
- **Classificação:** Alta; P1; esforço médio; risco de implementação médio. Probabilidade: Média com operadores simultâneos.
- **Descrição técnica:** Pagamento bloqueia a linha customer; cancelamento bloqueia apenas a sale e lê o saldo agregado. Duas vendas pendentes de R$ 100 e pagamentos avulsos de R$ 50 deixam saldo R$ 150. Dois cancelamentos simultâneos podem ver R$ 150, aprovar projeção R$ 50 cada e terminar com crédito de R$ 50.
- **Causa-raiz provável:** Invariante por cliente protegida por locks de entidades diferentes.
- **Evidências:** [backend/src/modules/sales/repository/sales-repository.ts](../../backend/src/modules/sales/repository/sales-repository.ts):406–460; [backend/src/modules/customer-payments/application/customer-payments-use-cases.ts](../../backend/src/modules/customer-payments/application/customer-payments-use-cases.ts):196–223; [backend/src/modules/customer-payments/repository/customer-payments-repository.ts](../../backend/src/modules/customer-payments/repository/customer-payments-repository.ts):77–80.
- **Risco e impacto:** Saldo negativo proibido pela própria regra e reconciliação manual de recebimentos.
- **Solução recomendada:** Serializar todas as operações que alteram o saldo pela mesma chave de cliente, com ordem de locks consistente e releitura no mesmo cliente/transação. Cobrir criação, recebimento, cancelamento e eventual estorno aprovado.
- **Componentes impactados:** `backend/src/modules/sales/repository`, `backend/src/modules/customer-payments/application`, `backend/src/modules/customer-payments/repository`.
- **Dependências:** [TSK-012](03-backlog-tecnico.md#tsk-012)
- **Critérios de aceitação:** Dois cancelamentos do exemplo não são ambos aprovados; pagamento concorrente não usa saldo anterior ao cancelamento; ausência de deadlock recorrente; transação abortada não deixa efeitos parciais.
- **Validação e reversão:** Barreiras determinísticas com duas conexões PostgreSQL: cancelar/cancelar, cancelar/pagar e criar/pagar; rollback e timeout de lock. Reverter aplicação mantendo constraints e relatórios de anomalias; não remover locks de forma parcial entre caminhos financeiros.
- **Atividade planejada:** [TSK-014 — Serializar invariantes financeiras pelo cliente](03-backlog-tecnico.md#tsk-014).

<a id="tec-015"></a>

### TEC-015 — Checkout e recebimentos não têm idempotência persistente

- **Natureza e certeza:** Risco arquitetural / confiabilidade. Ausência de proteção comprovada; duplicação depende de repetição da requisição.
- **Classificação:** Alta; P1; esforço médio; risco de implementação médio. Probabilidade: Média diante de timeout, reconexão ou repetição manual.
- **Descrição técnica:** O frontend não fornece identificador estável da operação; cada POST gera UUID novo. unique(source,source_key) não protege o checkout usual, pois ambos são nulos. Repetir um recebimento também grava novamente se houver saldo suficiente.
- **Causa-raiz provável:** Proteção limitada ao botão pendente da sessão de interface e à origem de importação.
- **Evidências:** [frontend/src/pages/pos/buildSaleInput.ts](../../frontend/src/pages/pos/buildSaleInput.ts):25–43; [backend/src/modules/sales/repository/sales-repository.ts](../../backend/src/modules/sales/repository/sales-repository.ts):235–297; [backend/src/modules/customer-payments/repository/customer-payments-repository.ts](../../backend/src/modules/customer-payments/repository/customer-payments-repository.ts):225–247; [backend/sql/init.sql](../../backend/sql/init.sql):88–90.
- **Risco e impacto:** Venda, pagamento e saída de estoque duplicados após resposta perdida.
- **Solução recomendada:** Criar chave de idempotência por operação e ator/escopo, guardar hash do payload e resultado na mesma transação da mutação. Reusar chave ao consultar/repetir resultado incerto e rejeitar mesma chave com payload distinto.
- **Componentes impactados:** `frontend/src/pages/pos`, `backend/src/modules/sales/repository`, `backend/src/modules/customer-payments/repository`, `backend/sql`.
- **Dependências:** [TSK-013](03-backlog-tecnico.md#tsk-013)
- **Critérios de aceitação:** Duas requisições iguais/concomitantes com mesma chave geram uma venda/pagamento e um conjunto de movimentos; retorno perdido é recuperável; payload divergente recebe conflito; retenção das chaves é definida.
- **Validação e reversão:** Timeout após commit, duas conexões simultâneas, mesma chave/payload distinto e reabertura da interface com operação incerta. Introduzir de forma compatível com clientes antigos por janela delimitada; preservar registros de idempotência ao reverter a UI.
- **Atividade planejada:** [TSK-015 — Adicionar idempotência persistente a vendas e recebimentos](03-backlog-tecnico.md#tsk-015).

<a id="tec-016"></a>

### TEC-016 — API finaliza venda sem pagamento e sem cliente

**Atualização em 22/10/2026:** [correção operacional validada em Docker](20-validacao-docker-e-correcoes.md). Método e valor pago são obrigatórios e não nulos; não há inferência automática de quitação. Schema HTTP e caso de uso bloqueiam comandos incompletos, a regressão deixou de ser falha esperada e a matriz HTTP/PostgreSQL cobre quitação/crédito/desconto integral sem gravações em erros. Importação histórica continua no caminho próprio e seus dados não foram reescritos. Constraints históricas e demais controles financeiros do roadmap permanecem separados. As evidências originais abaixo descrevem a base auditada.

- **Natureza e certeza:** Bug / inconsistência funcional. Reproduzido no caso de uso com repositório simulado.
- **Classificação:** Alta; P1; esforço baixo; risco de implementação médio. Probabilidade: Alta para cliente de API que omite campos.
- **Descrição técnica:** payment_method e amount_paid são opcionais/nulos. Com ambos ausentes e sem customer_id, a API envia total=100, amountPaid=null e pendingAmount=100 para uma inserção completed. A regra que exige cliente é executada somente para métodos credit/credit_with_entry.
- **Causa-raiz provável:** Compatibilidade de DTO legado foi mantida como possibilidade no comando operacional de checkout.
- **Evidências:** [backend/src/modules/sales/contracts/sales-contracts.ts](../../backend/src/modules/sales/contracts/sales-contracts.ts):93–105; [backend/src/modules/sales/application/sales-use-cases.ts](../../backend/src/modules/sales/application/sales-use-cases.ts):44–78; [backend/src/modules/sales/repository/sales-repository.ts](../../backend/src/modules/sales/repository/sales-repository.ts):237–256.
- **Risco e impacto:** Venda reconhecida como concluída sem quitação nem vínculo de cobrança, contornando exigências da interface.
- **Solução recomendada:** Definir comando operacional que exija método e política de quitação/cliente; manter importação histórica em caminho próprio e validar constraints compatíveis após tratar registros anteriores.
- **Componentes impactados:** `backend/src/modules/sales/contracts`, `backend/src/modules/sales/application`, `backend/src/modules/sales/repository`.
- **Dependências:** [TSK-013](03-backlog-tecnico.md#tsk-013)
- **Critérios de aceitação:** POST operacional incompleto recebe 400/422 antes de persistir; venda à vista exige quitação; saldo pendente exige cliente; importações e clientes antigos têm caminho de compatibilidade documentado.
- **Validação e reversão:** Combinações de ausência/null/método/valor/cliente via HTTP e banco; regressão de credit_with_entry e venda com desconto integral. Manter adaptador explícito para contrato antigo, se necessário, sem reabrir finalização anônima com dívida.
- **Atividade planejada:** [TSK-016 — Exigir invariantes de pagamento no checkout operacional](03-backlog-tecnico.md#tsk-016).

<a id="tec-017"></a>

### TEC-017 — Reimpressão de recebimento recalcula saldo passado com dívidas atuais

- **Natureza e certeza:** Bug / inconsistência funcional. Defeito comprovado na fórmula de reconstrução.
- **Classificação:** Alta; P1; esforço médio; risco de implementação médio. Probabilidade: Alta quando há vendas ou cancelamentos posteriores.
- **Descrição técnica:** previous_balance usa totalCharges de todas as vendas atuais, mas subtrai pagamentos anteriores. Uma dívida de R$ 100 com recebimento de R$ 40 gera saldo novo R$ 60; uma venda posterior de R$ 50 faz a reimpressão indicar anterior R$ 150 e novo R$ 110. Nomes de cliente/produto/empresa de recibos também vêm do cadastro/configuração atuais.
- **Causa-raiz provável:** Documento histórico é uma projeção de dados mutáveis, sem snapshot ou trilha temporal de saldo.
- **Evidências:** [backend/src/modules/customer-payments/application/customer-payments-use-cases.ts](../../backend/src/modules/customer-payments/application/customer-payments-use-cases.ts):159–180; [backend/src/modules/customer-payments/repository/customer-payments-repository.ts](../../backend/src/modules/customer-payments/repository/customer-payments-repository.ts):97–112; [backend/src/modules/customer-payments/repository/customer-payments-repository.ts](../../backend/src/modules/customer-payments/repository/customer-payments-repository.ts):299–305; [backend/src/modules/sales/repository/sales-repository.ts](../../backend/src/modules/sales/repository/sales-repository.ts):374–398.
- **Risco e impacto:** Segunda via contradiz o documento original e dificulta comprovação/reconciliação.
- **Solução recomendada:** Persistir, na transação de recebimento, saldos anterior/novo e dados documentais necessários. Para legado sem snapshot, rotular reconstrução e usar regra temporal aprovada; avaliar snapshots de itens/identificação na emissão de vendas.
- **Componentes impactados:** `backend/src/modules/customer-payments/application`, `backend/src/modules/customer-payments/repository`, `backend/src/modules/sales/repository`.
- **Dependências:** [TSK-012](03-backlog-tecnico.md#tsk-012), [TSK-014](03-backlog-tecnico.md#tsk-014)
- **Critérios de aceitação:** Venda, mudança cadastral ou cancelamento posterior não altera os valores históricos de um recibo novo; segunda via mantém identificação/valores originais; documentos legados não são apresentados como snapshots exatos.
- **Validação e reversão:** Emitir → nova venda/pagamento/cancelamento/edição → reimprimir; pagamentos retroativos e mesmo timestamp; migração de registros sem snapshot. Adicionar colunas/snapshot de forma expansiva; manter leitura de registros antigos sem inventar saldos históricos.
- **Atividade planejada:** [TSK-017 — Preservar snapshot de saldo e dados dos comprovantes](03-backlog-tecnico.md#tsk-017).

<a id="tec-018"></a>

### TEC-018 — Merge entre sessões duplica pagamentos e movimentos de estoque

- **Natureza e certeza:** Bug / inconsistência funcional. Inserções repetíveis comprovadas por leitura.
- **Classificação:** Alta; P1; esforço médio; risco de implementação alto. Probabilidade: Alta ao importar a mesma massa novamente sem overwrite.
- **Descrição técnica:** Pagamentos e movimentos são sempre inseridos, sem chave de origem única. Checkpoint só evita repetir etapa da mesma importação. Nova sessão merge da mesma massa soma tudo outra vez, enquanto cadastros/vendas usam upsert.
- **Causa-raiz provável:** Idempotência da fila/sessão confundida com identidade do registro legado.
- **Evidências:** [backend/src/services/legacy-import/worker.ts](../../backend/src/services/legacy-import/worker.ts):759–824; [backend/src/services/legacy-import/worker.ts](../../backend/src/services/legacy-import/worker.ts):827–864; [backend/src/services/legacy-import/worker.ts](../../backend/src/services/legacy-import/worker.ts):1412–1415; [backend/sql/init.sql](../../backend/sql/init.sql):112–122; [backend/sql/init.sql](../../backend/sql/init.sql):144–157.
- **Risco e impacto:** Recebimentos e estoque duplicados, com efeito financeiro silencioso.
- **Solução recomendada:** Definir identidade estável de cada registro legado, incluindo duplicatas legítimas; registrar origem/chave com unicidade e política de merge. Preparar relatório de duplicações existentes antes de aplicar restrição ou deduplicação.
- **Componentes impactados:** `backend/src/services/legacy-import`, `backend/sql`.
- **Dependências:** [TSK-019](03-backlog-tecnico.md#tsk-019)
- **Critérios de aceitação:** Duas sessões da mesma fixture mantêm mesmas quantidades/totais; duplicatas legítimas distintas não são colapsadas; diferenças de conteúdo têm tratamento auditável; registros manuais permanecem intactos.
- **Validação e reversão:** Importação repetida, linhas idênticas legítimas, massa reordenada, alteração parcial e coexistência de pagamentos manuais. Migração expansiva das chaves e cópia dos registros afetados; não excluir duplicatas presumidas sem validação de origem.
- **Atividade planejada:** [TSK-018 — Deduplicar registros legados entre sessões de merge](03-backlog-tecnico.md#tsk-018).

<a id="tec-019"></a>

### TEC-019 — Staging é global e concorrência um vale apenas por worker

**Atualização em 22/10/2026:** contenção implementada e validada em PostgreSQL descartável, com dois processos e interrupção/retomada A → B → A. A contraprova no worker anterior reproduziu o defeito. Ver [registro da fase 2](10-fase-dois-primeiro-corte.md). As evidências abaixo descrevem a base auditada; a serialização global e a reconstrução por tentativa tratam este risco, sem concluir as tarefas de publicação/identidade/durabilidade.

- **Natureza e certeza:** Risco arquitetural / confiabilidade. Risco estrutural comprovado; sobreposição entre processos/retries não executada.
- **Classificação:** Alta; P1; esforço médio; risco de implementação médio. Probabilidade: Média com retries intercalados ou mais de uma API.
- **Descrição técnica:** As tabelas stg_* não têm import_id e são truncadas globalmente. concurrency=1 é por processo. Dois workers podem sobrescrever o staging. Mesmo uma instância pode processar B durante backoff de A; A retoma checkpoints de carga concluída e consome staging de B.
- **Causa-raiz provável:** Estado compartilhado sem isolamento por sessão nem lock global de toda a importação.
- **Evidências:** [backend/src/services/legacy-import/worker.ts](../../backend/src/services/legacy-import/worker.ts):425–426; [backend/src/services/legacy-import/worker.ts](../../backend/src/services/legacy-import/worker.ts):1493–1516; [backend/src/services/legacy-import/worker.ts](../../backend/src/services/legacy-import/worker.ts):1597–1603; [backend/src/services/legacy-import/worker.ts](../../backend/src/services/legacy-import/worker.ts):1749–1754; [backend/sql/migrations/20260414_001_phase5_legacy_import_hardening.sql](../../backend/sql/migrations/20260414_001_phase5_legacy_import_hardening.sql):37–61.
- **Risco e impacto:** Mistura de duas massas e reconciliação atribuída à sessão errada.
- **Solução recomendada:** No curto prazo, serializar globalmente todo o processamento com conexão/lock dedicado e garantir que retries não reutilizem staging de outra sessão. Evoluir para staging identificado por import_id ou schema por sessão se concorrência for necessária.
- **Componentes impactados:** `backend/src/services/legacy-import`, `backend/sql/migrations`.
- **Dependências:** Nenhuma dependência técnica obrigatória; usar ambiente de validação isolado.
- **Critérios de aceitação:** Sessões com massas distintas e retry de A após B não compartilham linhas; duas instâncias não executam publicação simultânea; restart conserva vínculo entre checkpoint e staging.
- **Validação e reversão:** Duas instâncias/duas massas com falhas por etapa e backoff; verificações de isolamento e liberação do lock. Permitir apenas uma importação administrativa global enquanto o isolamento não estiver comprovado; manter dados de sessão para diagnóstico.
- **Atividade planejada:** [TSK-019 — Isolar staging e concorrência da importação](03-backlog-tecnico.md#tsk-019).

<a id="tec-020"></a>

### TEC-020 — Durabilidade de jobs depende de arquivos efêmeros e despacho não reconciliado em execução

- **Natureza e certeza:** Risco arquitetural / confiabilidade. Configuração e janelas de falha comprovadas.
- **Classificação:** Alta; P1; esforço médio; risco de implementação médio. Probabilidade: Alta ao recriar containers ou interromper despacho.
- **Descrição técnica:** Jobs referenciam session_dir local; Compose não monta importações nem persistência explícita do Redis. PostgreSQL pode recuperar jobs pendentes no startup, mas não seus arquivos perdidos. Entre insert/audit/enqueue há janela de registro queued sem despacho; a varredura ocorre só no startup. Não há shutdown gracioso do servidor/pool/worker nem handlers explícitos de erro do worker.
- **Causa-raiz provável:** Durabilidade dividida entre banco, Redis e filesystem sem protocolo de recuperação completo.
- **Evidências:** [docker-compose.yml](../../docker-compose.yml):37–48; [docker-compose.yml](../../docker-compose.yml):72–78; [backend/src/modules/legacy-import/application/legacy-import-use-cases.ts](../../backend/src/modules/legacy-import/application/legacy-import-use-cases.ts):33–62; [backend/src/services/legacy-import/worker.ts](../../backend/src/services/legacy-import/worker.ts):1712–1767; [backend/src/server.ts](../../backend/src/server.ts):9–18.
- **Risco e impacto:** Jobs presos, perda dos insumos e interrupção do HTTP por dependência/erro do worker.
- **Solução recomendada:** Persistir insumos/relatórios e Redis com política adequada; reconciliar periodicamente registros pendentes ou adotar outbox mínimo. Definir timeout de startup, readiness e encerramento com drenagem de jobs; tratar error e exposição do status sem prometer processamento concluído.
- **Componentes impactados:** `docker-compose.yml`, `backend/src/modules/legacy-import/application`, `backend/src/services/legacy-import`, `backend/src`.
- **Dependências:** [TSK-005](03-backlog-tecnico.md#tsk-005), [TSK-019](03-backlog-tecnico.md#tsk-019)
- **Critérios de aceitação:** Recriação da API/Redis não perde arquivo aceito nem job; falha entre registro e enqueue converge sem restart manual; worker interrompido retoma com dados corretos; parada não aceita trabalho que será abandonado.
- **Validação e reversão:** Falhas de Redis/rede, kill após registro e após commit de etapa, recriação de container e SIGTERM em ambiente descartável. Preservar volumes e reconciliação por banco ao reverter worker; não remover mensagens/arquivos de operações ainda pendentes.
- **Atividade planejada:** [TSK-020 — Persistir insumos e reconciliar o ciclo de jobs](03-backlog-tecnico.md#tsk-020).

<a id="tec-021"></a>

### TEC-021 — Login não limita tentativas nem custo de verificação

- **Natureza e certeza:** Vulnerabilidade / controle de segurança. Ausência de controle na aplicação comprovada; proteção externa não verificada.
- **Classificação:** Alta; P1; esforço médio; risco de implementação médio. Probabilidade: Média; endpoint público.
- **Descrição técnica:** O login público consulta banco e pode executar bcrypt a cada tentativa, sem throttling, atraso progressivo ou limite por conta/origem no código ou proxy fornecido. Não foi feita tentativa de adivinhação de senha.
- **Causa-raiz provável:** Autenticação valida credencial, mas não controla abuso do endpoint.
- **Evidências:** [backend/src/modules/auth/http/auth-router.ts](../../backend/src/modules/auth/http/auth-router.ts):20–27; [backend/src/modules/auth/application/login-use-case.ts](../../backend/src/modules/auth/application/login-use-case.ts):16–30; [backend/src/app.ts](../../backend/src/app.ts):50–64; [infra/Caddyfile](../../infra/Caddyfile):9–15.
- **Risco e impacto:** Ataques de credencial e saturação de CPU/banco, especialmente com contas conhecidas.
- **Solução recomendada:** Limitar tentativas por conta e origem, com armazenamento coerente entre instâncias, mensagens uniformes e recuperação sem bloqueio permanente. Restringir trust proxy à topologia real antes de usar IP como critério.
- **Componentes impactados:** `backend/src/modules/auth/http`, `backend/src/modules/auth/application`, `backend/src`, `infra`.
- **Dependências:** [TSK-007](03-backlog-tecnico.md#tsk-007)
- **Critérios de aceitação:** Excesso recebe 429 e Retry-After; alternar instâncias não contorna o limite; IP encaminhado não é aceito de origem não confiável; usuário legítimo recupera acesso; não há segredo no log.
- **Validação e reversão:** Testes locais com limiar pequeno, duas instâncias, contas inexistentes e cabeçalhos de encaminhamento; recuperação após janela. Permitir ajuste operacional dos limites e métricas de falso positivo; manter limite global conservador ao reverter regra por conta.
- **Atividade planejada:** [TSK-021 — Limitar abuso do login com origem confiável](03-backlog-tecnico.md#tsk-021).

<a id="tec-022"></a>

### TEC-022 — Logout e troca de senha não revogam JWT emitido

- **Natureza e certeza:** Vulnerabilidade / controle de segurança. Semântica comprovada no código; token copiado não foi testado contra ambiente ativo.
- **Classificação:** Alta; P1; esforço médio; risco de implementação médio. Probabilidade: Média se um token for obtido por terceiro.
- **Descrição técnica:** Logout apenas expira o cookie; o JWT continua válido como Bearer. Alterar senha não altera versão de sessão nem compara momento de emissão. A checagem de status ativo ajuda a desativar a conta, mas não revoga apenas sessões antigas.
- **Causa-raiz provável:** JWT stateless sem registro/versão de sessão e política de revogação.
- **Evidências:** [backend/src/modules/auth/http/auth-router.ts](../../backend/src/modules/auth/http/auth-router.ts):38–43; [backend/src/modules/auth/application/resolve-auth-token-use-case.ts](../../backend/src/modules/auth/application/resolve-auth-token-use-case.ts):21–33; [backend/src/routes/users.ts](../../backend/src/routes/users.ts):226–239; [backend/src/config/env.ts](../../backend/src/config/env.ts):8–11.
- **Risco e impacto:** Credencial capturada mantém acesso até o TTL, inclusive após ação de logout ou troca de senha.
- **Solução recomendada:** Adicionar versão de sessão por usuário ou sessão persistida/jti, aproveitando a consulta de usuário já existente. Revogar conforme política de logout/troca de senha e alinhar duração do cookie ao token; validar formato de JWT_TTL na inicialização.
- **Componentes impactados:** `backend/src/modules/auth/http`, `backend/src/modules/auth/application`, `backend/src/routes`, `backend/src/config`.
- **Dependências:** [TSK-005](03-backlog-tecnico.md#tsk-005)
- **Critérios de aceitação:** Token emitido antes da troca de senha é recusado; logout invalida a sessão conforme política aprovada; sessões distintas têm comportamento documentado; TTL inválido falha no startup.
- **Validação e reversão:** Emissão → logout/troca de senha → replay em cliente de teste, sessões simultâneas, expiração e desativação. Migração expansiva de versão/sessão; exigir novo login na transição se não for seguro aceitar tokens antigos.
- **Atividade planejada:** [TSK-022 — Revogar sessões antigas após logout e troca de senha](03-backlog-tecnico.md#tsk-022).

<a id="tec-023"></a>

### TEC-023 — Troca de usuário preserva consultas privadas e carrinho

- **Natureza e certeza:** Vulnerabilidade / controle de segurança. Estado remanescente e rota sem guarda de permissão comprovados; exposição visual completa não exercitada.
- **Classificação:** Alta; P1; esforço baixo; risco de implementação baixo. Probabilidade: Média em terminal compartilhado.
- **Descrição técnica:** Logout limpa somente user. O singleton QueryClient e Zustand do carrinho permanecem. Chaves não incluem sessão; SaleDetailsPage consulta/mostra venda com enabled=Boolean(id), sem checar sales:read. Dados ainda frescos podem ser reutilizados após outro login sem nova autorização HTTP.
- **Causa-raiz provável:** Ciclo de vida de dados privados desvinculado do ciclo de identidade.
- **Evidências:** [frontend/src/store/auth.ts](../../frontend/src/store/auth.ts):32–56; [frontend/src/lib/queryClient.ts](../../frontend/src/lib/queryClient.ts):3–10; [frontend/src/store/pos.ts](../../frontend/src/store/pos.ts):32–37; [frontend/src/App.tsx](../../frontend/src/App.tsx):48–61; [frontend/src/pages/SaleDetailsPage.tsx](../../frontend/src/pages/SaleDetailsPage.tsx):29–53.
- **Risco e impacto:** Exibição de venda do usuário anterior e carrinho/cliente herdado por outro operador. A API continua impondo RBAC; isso não é bypass do middleware do backend.
- **Solução recomendada:** Cancelar consultas/mutações pendentes e limpar dados privados/carrinho ao encerrar ou trocar identidade; aplicar guarda de permissão nas rotas sensíveis e impedir resposta atrasada da sessão anterior de preencher o cache novo.
- **Componentes impactados:** `frontend/src/store`, `frontend/src/lib`, `frontend/src`, `frontend/src/pages`.
- **Dependências:** Nenhuma dependência técnica obrigatória; usar ambiente de validação isolado.
- **Critérios de aceitação:** Após A sair e B entrar sem sales:read, URL direta da venda não exibe dado de A; carrinho está vazio; respostas atrasadas de A não reaparecem; logout com erro de rede não mantém dados visíveis.
- **Validação e reversão:** E2E com dois perfis, cache fresco/stale, resposta atrasada e logout offline; navegação direta a venda/recibo. Preferir limpeza conservadora de todo o cache na transição; explicar perda de rascunho do carrinho conforme regra aprovada.
- **Atividade planejada:** [TSK-023 — Limpar estado privado e guardar rotas por permissão](03-backlog-tecnico.md#tsk-023).

<a id="tec-024"></a>

### TEC-024 — Listagens e relatório financeiro são truncados sem navegação completa

**Atualização em 22/10/2026:** [corte de relatório implementado e validado](14-fase-quatro-primeiro-corte.md): seleção completa até 5.000 linhas, snapshot consistente e bloqueio de impressão parcial. A contraprova reproduziu o corte em 1.000 linhas. Listas/seletores permanecem pendentes; as evidências originais abaixo descrevem a base auditada.

- **Natureza e certeza:** Bug / inconsistência funcional. Limites e ausência de parâmetros de navegação comprovados.
- **Classificação:** Alta; P1; esforço médio; risco de implementação médio. Probabilidade: Alta ao exceder 100 registros ou 1.000 pagamentos no relatório.
- **Descrição técnica:** Serviços do frontend não expõem paginação para cadastros/vendas por cliente; seletores carregam só os 100 primeiros. O relatório limita a lista a 1.000 pagamentos por padrão, mas devolve filtered_count/filtered_total de toda a seleção, sem metadado de truncamento na resposta do relatório.
- **Causa-raiz provável:** Paginação adicionada no backend sem completar o contrato e o consumidor.
- **Evidências:** [backend/src/routes/customers.ts](../../backend/src/routes/customers.ts):137–167; [frontend/src/services/catalog.ts](../../frontend/src/services/catalog.ts):24–61; [frontend/src/pages/PosPage.tsx](../../frontend/src/pages/PosPage.tsx):62–99; [backend/src/modules/customer-payments/application/customer-payments-use-cases.ts](../../backend/src/modules/customer-payments/application/customer-payments-use-cases.ts):105–141; [frontend/src/pages/catalog/CustomerPaymentHistoryReportPage.tsx](../../frontend/src/pages/catalog/CustomerPaymentHistoryReportPage.tsx):22–46; [frontend/src/pages/catalog/CustomerPaymentHistoryReportPage.tsx](../../frontend/src/pages/catalog/CustomerPaymentHistoryReportPage.tsx):138–170.
- **Risco e impacto:** Clientes/vendedores/condições não selecionáveis e relatório impresso com linhas que não conciliam com o total.
- **Solução recomendada:** Adicionar navegação/busca de opções remotas e metadados consistentes, preservando compatibilidade de respostas existentes por adaptação/versionamento. Relatórios completos devem percorrer/exportar toda a seleção, ou declarar explicitamente escopo parcial e totais correspondentes.
- **Componentes impactados:** `backend/src/routes`, `frontend/src/services`, `frontend/src/pages`, `backend/src/modules/customer-payments/application`, `frontend/src/pages/catalog`.
- **Dependências:** Nenhuma dependência técnica obrigatória; usar ambiente de validação isolado.
- **Critérios de aceitação:** Registro 101 é acessível em cada seletor/lista; fixture de 1.001 pagamentos produz relatório completo e soma das linhas igual ao total; limite máximo continua protegido; ordenação inclui desempate por id.
- **Validação e reversão:** Fronteiras 0/100/101/200 e 1.001 pagamentos, filtros, nomes repetidos e última página vazia; impressão/exportação. Adicionar contrato novo de forma compatível e migrar consumidores gradualmente; não retirar limites do servidor para esconder truncamento.
- **Atividade planejada:** [TSK-024 — Completar paginação e integridade dos relatórios](03-backlog-tecnico.md#tsk-024).

<a id="tec-025"></a>

### TEC-025 — Caminhos arbitrários tornam a cardinalidade das métricas ilimitada

- **Natureza e certeza:** Vulnerabilidade / controle de segurança. Caminho de crescimento comprovado; exaustão não provocada.
- **Classificação:** Alta; P1; esforço baixo; risco de implementação baixo. Probabilidade: Média; pode ser acionado antes da autenticação.
- **Descrição técnica:** Sem req.route, resolveRoute retorna req.path. Requisições a caminhos diferentes recusadas pelo requireAuth ou sem rota criam novos labels em counter e histogram, mantidos no processo. Proteger a leitura de /metrics não limita a criação das séries.
- **Causa-raiz provável:** Uso de URL fornecida pelo cliente como dimensão de métricas sem normalização.
- **Evidências:** [backend/src/observability/metrics.ts](../../backend/src/observability/metrics.ts):11–29; [backend/src/observability/metrics.ts](../../backend/src/observability/metrics.ts):33–55; [backend/src/app.ts](../../backend/src/app.ts):53–69.
- **Risco e impacto:** Crescimento de memória da API e do coletor por tráfego com caminhos únicos.
- **Solução recomendada:** Usar labels estáticos para não autenticado/não encontrado e templates canônicos para rotas registradas; limitar labels de método e não incluir IDs/querystrings. Configurar token de coleta no Compose sem expô-lo ao cliente.
- **Componentes impactados:** `backend/src/observability`, `backend/src`.
- **Dependências:** Nenhuma dependência técnica obrigatória; usar ambiente de validação isolado.
- **Critérios de aceitação:** Mil caminhos sintéticos diferentes não geram mil labels; métricas preservam contagem/status e latência; produção permite coleta autorizada e recusa sem token.
- **Validação e reversão:** Em instância descartável, requests únicos 401/404 e comparação do número de séries; rotas válidas e middleware de erro. Manter nomes existentes das métricas e documentar mudança dos labels; dashboards devem aceitar os buckets estáticos novos.
- **Atividade planejada:** [TSK-025 — Limitar cardinalidade e habilitar coleta autorizada](03-backlog-tecnico.md#tsk-025).

<a id="tec-026"></a>

### TEC-026 — Eventos financeiros e de acesso não têm trilha de negócio e logs podem conter dados de busca

- **Natureza e certeza:** Risco arquitetural / confiabilidade. Ausência de chamadas de auditoria nos fluxos e redação incompatível comprovadas.
- **Classificação:** Alta; P1; esforço médio; risco de implementação médio. Probabilidade: Alta quando for necessário investigar alteração.
- **Descrição técnica:** logAudit é usado em backup/importação, não em criação/cancelamento de venda, recebimento, alteração de usuário/perfil. Logging HTTP guarda originalUrl, que pode conter nome/CPF em search. Redação de err.stack não se aplica ao objeto registrado como error.stack; erro de unicidade também devolve detail do PostgreSQL.
- **Causa-raiz provável:** Observabilidade centrada em transporte e utilitário de auditoria sem integração aos casos críticos/política de dados.
- **Evidências:** [backend/src/utils/audit.ts](../../backend/src/utils/audit.ts):12–24; [backend/src/modules/sales/application/sales-use-cases.ts](../../backend/src/modules/sales/application/sales-use-cases.ts):88–105; [backend/src/routes/users.ts](../../backend/src/routes/users.ts):178–186; [backend/src/routes/roles.ts](../../backend/src/routes/roles.ts):199–208; [backend/src/observability/request-context.ts](../../backend/src/observability/request-context.ts):51–60; [backend/src/observability/logger.ts](../../backend/src/observability/logger.ts):13–21; [backend/src/middleware/error-handler.ts](../../backend/src/middleware/error-handler.ts):71–78.
- **Risco e impacto:** Não identificar quem mudou valores/permissões; dados pessoais e detalhes internos em logs ou respostas.
- **Solução recomendada:** Auditar ações críticas com ator, operação, entidade, motivo e requestId na transação apropriada, minimizando dados pessoais. Usar rota/query permitida em logs, revisar serialização/redação e traduzir conflitos sem detalhe interno. Definir retenção/acesso do log com responsáveis.
- **Componentes impactados:** `backend/src/utils`, `backend/src/modules/sales/application`, `backend/src/routes`, `backend/src/observability`, `backend/src/middleware`.
- **Dependências:** [TSK-009](03-backlog-tecnico.md#tsk-009), [TSK-015](03-backlog-tecnico.md#tsk-015)
- **Critérios de aceitação:** Cada mutação crítica produz um evento de negócio coerente com commit/rollback; nenhuma senha/token/CPF de busca aparece no destino de logs; suporte correlaciona requisição e operação sem acessar segredo.
- **Validação e reversão:** Mutação com commit/rollback, alteração de permissão, busca com dado sintético e captura de logs; erro 23505 com valor privado. Campos/eventos aditivos; manter leitura de eventos antigos e não remover trilha já persistida ao reverter aplicação.
- **Atividade planejada:** [TSK-026 — Auditar mutações e minimizar dados em logs](03-backlog-tecnico.md#tsk-026).

<a id="tec-027"></a>

### TEC-027 — Suíte verde não valida banco, recuperação real nem jornada de caixa

- **Natureza e certeza:** Débito técnico. Escopo dos testes e pipeline comprovado.
- **Classificação:** Alta; P1; esforço alto; risco de implementação baixo. Probabilidade: Alta de regressão não detectada nos cenários identificados.
- **Descrição técnica:** A auditoria executou 88 testes com sucesso, mas banco/fila/restore são mockados e não há E2E/browser. CI não constrói imagens nem roda migrações/SQL reais ou agente. O teste visual verifica traduções, não aparência.
- **Causa-raiz provável:** Estratégia concentrada em funções e mocks de infraestrutura; gates de entrega incompletos.
- **Evidências:** [backend/src/services/backup-restore-service.test.ts](../../backend/src/services/backup-restore-service.test.ts):12–26; [backend/src/services/legacy-import/worker.phase5.test.ts](../../backend/src/services/legacy-import/worker.phase5.test.ts):25–50; [backend/src/modules/sales/repository/sales-repository.test.ts](../../backend/src/modules/sales/repository/sales-repository.test.ts):4–11; [backend/src/modules/customer-payments/application/customer-payments-use-cases.test.ts](../../backend/src/modules/customer-payments/application/customer-payments-use-cases.test.ts):1–5; [.github/workflows/ci.yml](../../.github/workflows/ci.yml):29–66; [frontend/src/lib/i18n.visual.test.ts](../../frontend/src/lib/i18n.visual.test.ts):1–25.
- **Risco e impacto:** SQL inválido, locks inadequados, dependência ausente no container e regressões de fluxo chegam ao operador.
- **Solução recomendada:** Criar harness descartável PostgreSQL/Redis para transações, migrações e concorrência; smoke test de imagens/backup; E2E curto login → venda → recebimento → cancelamento/recibo por perfil. Manter testes unitários e testar falhas reais em ambiente isolado.
- **Componentes impactados:** `backend/src/services`, `backend/src/services/legacy-import`, `backend/src/modules/sales/repository`, `backend/src/modules/customer-payments/application`, `.github/workflows`, `frontend/src/lib`.
- **Dependências:** [TSK-005](03-backlog-tecnico.md#tsk-005)
- **Critérios de aceitação:** CI usa recursos descartáveis, falha em quebra de SQL/lock/imagem e publica resultados; não usa dados/credenciais reais; os defeitos críticos recebem regressão específica antes da correção.
- **Validação e reversão:** A própria tarefa inclui validação do harness por falha intencional em checkout temporário, limpeza de recursos e execução repetível em CI. Separar gates novos por etapa, sem remover os testes existentes; registrar flakiness e corrigir causa em vez de ignorar falhas.
- **Atividade planejada:** [TSK-027 — Automatizar SQL, concorrência, imagens e jornada crítica](03-backlog-tecnico.md#tsk-027).

<a id="tec-028"></a>

### TEC-028 — ESLint passa sem habilitar regras de análise

**Atualização em 22/10/2026:** [primeiro corte de lint efetivo implementado](16-fase-cinco-primeiro-corte.md): 45 ocorrências iniciais resolvidas ou explicitadas; zero erros/warnings finais, hooks do dashboard corrigidos e 16 controles negativos/positivos/suíte vazia adicionados ao CI. Não conclui TSK-029/038 nem as regras ainda não ativadas. As evidências originais abaixo descrevem a base auditada.

- **Natureza e certeza:** Débito técnico. Configuração comprovada.
- **Classificação:** Média; P2; esforço baixo; risco de implementação baixo. Probabilidade: Alta de falsa sensação de proteção.
- **Descrição técnica:** As configurações definem apenas parser/parserOptions/ignorePatterns, sem extends, plugins ou rules. O sucesso de lint observado verifica essencialmente parsing, não recomendações de TypeScript/React ou promessas.
- **Causa-raiz provável:** Ferramenta instalada sem baseline de regras efetivo.
- **Evidências:** [backend/.eslintrc.cjs](../../backend/.eslintrc.cjs):1–10; [frontend/.eslintrc.cjs](../../frontend/.eslintrc.cjs):1–13; [backend/package.json](../../backend/package.json):12–15; [frontend/package.json](../../frontend/package.json):10–13.
- **Risco e impacto:** Problemas recorrentes permanecem invisíveis no gate e aumentam o custo de revisão.
- **Solução recomendada:** Adicionar conjuntos pequenos de regras úteis de TypeScript, promises e hooks/a11y conforme versões compatíveis; adotar baseline para não misturar reformatação massiva com correções de negócio. Remover passWithNoTests dos gates que exigem suíte.
- **Componentes impactados:** `backend`, `frontend`.
- **Dependências:** [TSK-007](03-backlog-tecnico.md#tsk-007)
- **Critérios de aceitação:** Exemplos controlados de promessa ignorada, variável morta e hook inválido são detectados; build existente segue operacional; exceções possuem motivo local e a suíte vazia falha no gate esperado.
- **Validação e reversão:** Exemplos negativos em cópia temporária, execução de lint/typecheck e medição do número inicial de ocorrências. Reverter somente a regra problemática ou ajustar baseline; não desativar todo o gate para desbloquear uma ocorrência.
- **Atividade planejada:** [TSK-028 — Ativar regras efetivas de lint de forma incremental](03-backlog-tecnico.md#tsk-028).

<a id="tec-029"></a>

### TEC-029 — Worker concentra responsabilidades e CRUDs repetem implementação

- **Natureza e certeza:** Débito técnico. Débito estrutural comprovado; complexidade ciclomática não medida.
- **Classificação:** Média; P2; esforço alto; risco de implementação médio. Probabilidade: Alta de custo de manutenção nas áreas afetadas.
- **Descrição técnica:** Um worker cuida de extração, staging, mapeamento, regras, SQL, reconciliação, fila e status. Três CRUDs simples e páginas equivalentes repetem padrões. Dashboard/PDV combinam consultas, derivação, interação e apresentação extensas. Há camadas modulares em alguns domínios e SQL direto em outros.
- **Causa-raiz provável:** Evolução funcional incremental sem limites de responsabilidade consolidados.
- **Evidências:** [backend/src/services/legacy-import/worker.ts](../../backend/src/services/legacy-import/worker.ts):390–449; [backend/src/services/legacy-import/worker.ts](../../backend/src/services/legacy-import/worker.ts):1324–1427; [backend/src/routes/product-groups.ts](../../backend/src/routes/product-groups.ts):1–131; [backend/src/routes/sellers.ts](../../backend/src/routes/sellers.ts):1–131; [backend/src/routes/payment-terms.ts](../../backend/src/routes/payment-terms.ts):1–130; [frontend/src/pages/DashboardPage.tsx](../../frontend/src/pages/DashboardPage.tsx):213–281; [frontend/src/pages/PosPage.tsx](../../frontend/src/pages/PosPage.tsx):56–217.
- **Risco e impacto:** Correções localizadas atingem efeitos externos inesperados e exigem mocks extensos.
- **Solução recomendada:** Extrair primeiro parsing/reconciliação/persistência por domínio do worker, mantendo orquestrador e transações explícitos. Extrair hooks e seções de tela; compartilhar somente lógica repetida comprovada dos CRUDs, sem framework genérico de entidades.
- **Componentes impactados:** `backend/src/services/legacy-import`, `backend/src/routes`, `frontend/src/pages`.
- **Dependências:** [TSK-004](03-backlog-tecnico.md#tsk-004), [TSK-018](03-backlog-tecnico.md#tsk-018), [TSK-019](03-backlog-tecnico.md#tsk-019), [TSK-027](03-backlog-tecnico.md#tsk-027)
- **Critérios de aceitação:** Contratos e resultados permanecem equivalentes em fixtures; domínios são testáveis sem iniciar fila/servidor; transações e locks continuam no mesmo escopo; repetição reduzida sem esconder regras específicas.
- **Validação e reversão:** Testes de caracterização, fixtures de importação, contratos HTTP e jornadas de tela antes/depois de cada extração. Refatorar um domínio/seção por PR mantendo adaptador antigo até equivalência; evitar mover tudo em uma alteração.
- **Atividade planejada:** [TSK-029 — Extrair responsabilidades do worker e componentes repetidos](03-backlog-tecnico.md#tsk-029).

<a id="tec-030"></a>

### TEC-030 — Chaves e invalidações deixam cadastros e saldos obsoletos

- **Natureza e certeza:** Bug / inconsistência funcional. Incompatibilidade de chaves e leitura implícita de cache comprovadas.
- **Classificação:** Média; P2; esforço médio; risco de implementação baixo. Probabilidade: Alta em edição seguida de navegação entre módulos.
- **Descrição técnica:** Editar products invalida products, enquanto PDV usa pos-products. Clientes usam customers, pos-customers, sales-customers e customer/id sem invalidadores comuns. Checkout/cancelamento invalidam sales/dashboard, mas não os saldos do cliente. Detalhe da venda busca nomes somente de caches preenchidos pela lista, deixando acesso direto incompleto.
- **Causa-raiz provável:** Cada página define sua própria identidade de consulta e pressupõe navegação anterior.
- **Evidências:** [frontend/src/pages/catalog/ProductsPage.tsx](../../frontend/src/pages/catalog/ProductsPage.tsx):36–68; [frontend/src/pages/PosPage.tsx](../../frontend/src/pages/PosPage.tsx):56–89; [frontend/src/pages/catalog/CustomersPage.tsx](../../frontend/src/pages/catalog/CustomersPage.tsx):38–64; [frontend/src/pages/catalog/CustomerDetailsPage.tsx](../../frontend/src/pages/catalog/CustomerDetailsPage.tsx):81–96; [frontend/src/pages/SaleDetailsPage.tsx](../../frontend/src/pages/SaleDetailsPage.tsx):29–65.
- **Risco e impacto:** Prévia com preço antigo, saldo desatualizado e nomes ausentes; a API ainda reprecifica a venda.
- **Solução recomendada:** Definir query keys e invalidadores por entidade/operação; carregar referências necessárias ao detalhe por contrato ou consulta própria; invalidar saldos/cadastros usados no PDV após mutações relacionadas.
- **Componentes impactados:** `frontend/src/pages/catalog`, `frontend/src/pages`.
- **Dependências:** [TSK-023](03-backlog-tecnico.md#tsk-023), [TSK-024](03-backlog-tecnico.md#tsk-024)
- **Critérios de aceitação:** Editar preço/cliente e abrir PDV/detalhe mostra estado atual; checkout/cancelamento atualiza saldo sem reload manual; acesso direto ao detalhe resolve nomes; não exige refetch global a cada render.
- **Validação e reversão:** Teste de integração com QueryClient para edição e navegação, cache fresco, detalhe direto e mutação de saldo. Manter chaves antigas em adaptador temporário e invalidar ambos os formatos durante a transição.
- **Atividade planejada:** [TSK-030 — Centralizar chaves de consulta e invalidações](03-backlog-tecnico.md#tsk-030).

<a id="tec-031"></a>

### TEC-031 — Entradas inválidas viram 500 e falhas de integração perdem status útil

- **Natureza e certeza:** Bug / inconsistência funcional. Mapeamentos de erro incompletos comprovados.
- **Classificação:** Média; P2; esforço médio; risco de implementação médio. Probabilidade: Alta com UUID inválido, FK ausente ou JSON malformado.
- **Descrição técnica:** Várias rotas passam req.params.id direto para UUID SQL. Error handler só mapeia 23505; 22P02/23503, erros do parser JSON e filename inválido caem em 500. HttpError 503 de impressão é normalizado para HTTP 500 com mensagem genérica, apagando informação de indisponibilidade planejada.
- **Causa-raiz provável:** Validação incompleta de fronteiras e mistura entre erro interno inesperado e indisponibilidade conhecida.
- **Evidências:** [backend/src/routes/products.ts](../../backend/src/routes/products.ts):174–183; [backend/src/modules/sales/http/sales-router.ts](../../backend/src/modules/sales/http/sales-router.ts):60–65; [backend/src/middleware/error-handler.ts](../../backend/src/middleware/error-handler.ts):34–84; [backend/src/services/print-agent.ts](../../backend/src/services/print-agent.ts):45–68; [backend/src/utils/backup.ts](../../backend/src/utils/backup.ts):43–47.
- **Risco e impacto:** Cliente não consegue decidir correção/repetição; ruído nos alertas e mensagens inconsistentes.
- **Solução recomendada:** Validar parâmetros/limites e mapear erros conhecidos para códigos estáveis 400/404/409/422/413/503 sem expor detalhes SQL. Preservar request_id e padronizar contrato/OpenAPI; validar respostas relevantes em runtime ou por testes de contrato.
- **Componentes impactados:** `backend/src/routes`, `backend/src/modules/sales/http`, `backend/src/middleware`, `backend/src/services`, `backend/src/utils`.
- **Dependências:** [TSK-026](03-backlog-tecnico.md#tsk-026)
- **Critérios de aceitação:** UUID/JSON inválido recebem 400; FK inexistente recebe resposta contratada; impressora indisponível recebe 503 e código estável; stack/detalhe SQL não sai na resposta; erros inesperados continuam sanitizados.
- **Validação e reversão:** Matriz HTTP de parser, path, FK, constraint, upload e timeout de integração; comparação com OpenAPI. Introduzir códigos de erro aditivos e manter message compatível por janela; anunciar alterações de status a consumidores externos.
- **Atividade planejada:** [TSK-031 — Padronizar validação de fronteiras e códigos de erro](03-backlog-tecnico.md#tsk-031).

<a id="tec-032"></a>

### TEC-032 — Importação presume horário de pagamento e margens usam dados mutáveis

- **Natureza e certeza:** Risco arquitetural / confiabilidade. Comportamentos comprovados; adequação das fórmulas exige decisão de negócio.
- **Classificação:** Alta; P1; esforço médio; risco de implementação médio. Probabilidade: Alta ao importar em base inicializada com init.sql ou mudar custo do catálogo.
- **Descrição técnica:** Importação não informa paid_at; em base nova o default now() atribui horário atual a vendas históricas. KPIs de hoje/pico usam paid_at. Margens leem custo/preço atuais do produto e receita por item anterior ao desconto, enquanto receita por venda usa total líquido. As fórmulas de custo estão documentadas, mas não preservam fatos históricos.
- **Causa-raiz provável:** Ausência de procedência temporal e snapshot de custo/alocação de desconto; fallback de data técnica usado como evento financeiro.
- **Evidências:** [backend/sql/init.sql](../../backend/sql/init.sql):68–82; [backend/src/services/legacy-import/worker.ts](../../backend/src/services/legacy-import/worker.ts):1034–1049; [backend/src/modules/dashboard/repository/dashboard-repository.ts](../../backend/src/modules/dashboard/repository/dashboard-repository.ts):51–74; [backend/src/modules/dashboard/repository/dashboard-repository.ts](../../backend/src/modules/dashboard/repository/dashboard-repository.ts):266–286; [backend/src/modules/dashboard/repository/dashboard-repository.ts](../../backend/src/modules/dashboard/repository/dashboard-repository.ts):675–691; [docs/dashboard-executive-kpis.md](../../docs/dashboard-executive-kpis.md):40–46.
- **Risco e impacto:** Picos artificiais, histórico de margem muda após edição de catálogo e números chamados receita/margem não se conciliam entre widgets.
- **Solução recomendada:** Distinguir emissão, pagamento real e data desconhecida; importar valor conhecido sem inventar hora. Aprovar margem bruta/líquida, fallback de custo e escopo de categoria; preservar custo na venda e aplicar/rotular descontos conforme política. Identificar amostras históricas afetadas antes de backfill.
- **Componentes impactados:** `backend/sql`, `backend/src/services/legacy-import`, `backend/src/modules/dashboard/repository`, `docs`.
- **Dependências:** [TSK-013](03-backlog-tecnico.md#tsk-013), [TSK-018](03-backlog-tecnico.md#tsk-018)
- **Critérios de aceitação:** Importar venda antiga não a contabiliza como pagamento de hoje por default; horário desconhecido é identificado; editar custo atual não altera margem histórica de vendas novas; fixtures com desconto e duas categorias conciliam ou explicitam suas bases distintas.
- **Validação e reversão:** Importação em schema novo/atualizado, fuso/virada de dia, venda com desconto/devolução, custo ausente e edição posterior de produto; consultas SQL reais. Versionar fórmulas e campos de procedência; manter indicadores anteriores identificados durante validação e evitar preencher hora histórica presumida.
- **Atividade planejada:** [TSK-032 — Corrigir procedência temporal e estabilizar fórmulas de KPI](03-backlog-tecnico.md#tsk-032).

<a id="tec-033"></a>

### TEC-033 — Dashboard e processamento não têm orçamento explícito de consulta/volume

**Atualização em 22/10/2026:** [fase 6 iniciada com medição HTTP concorrente isolada](18-fase-seis-primeiro-corte.md). Vazão usa requisições concluídas/tempo decorrido; percentis, erros e recursos ficam registrados com volume, revisão/fingerprint, imagem e configuração. Este corte cobre a listagem de vendas. Dashboard, planos, importação, checkout, comparação antes/depois e budgets representativos permanecem pendentes, assim como TSK-032. Os limites/timeouts da fase 0 continuam vigentes. As evidências originais abaixo descrevem a base auditada.

- **Natureza e certeza:** Risco arquitetural / confiabilidade. Risco estrutural comprovado; impacto de carga não medido.
- **Classificação:** Alta; P1; esforço médio; risco de implementação médio. Probabilidade: Média com intervalo amplo, volume alto ou acesso concorrente.
- **Descrição técnica:** Datas do dashboard não têm teto de intervalo e generate_series expande o período. Dez consultas de widgets competem pelo pool sem timeout de conexão/query configurado. DBF é lido em lotes, mas etapas posteriores carregam staging inteiro em memória; venda faz inserções sequenciais por item/produto.
- **Causa-raiz provável:** Limites por página foram tratados, mas faltam budgets de operação e medição dos fluxos agregados.
- **Evidências:** [backend/src/modules/dashboard/contracts/dashboard-contracts.ts](../../backend/src/modules/dashboard/contracts/dashboard-contracts.ts):22–37; [backend/src/modules/dashboard/repository/dashboard-repository.ts](../../backend/src/modules/dashboard/repository/dashboard-repository.ts):468–501; [frontend/src/pages/DashboardPage.tsx](../../frontend/src/pages/DashboardPage.tsx):213–281; [backend/src/db.ts](../../backend/src/db.ts):5–11; [backend/src/services/legacy-import/worker.ts](../../backend/src/services/legacy-import/worker.ts):759–760; [backend/src/services/legacy-import/worker.ts](../../backend/src/services/legacy-import/worker.ts):827–828; [backend/src/modules/sales/repository/sales-repository.ts](../../backend/src/modules/sales/repository/sales-repository.ts):279–297.
- **Risco e impacto:** Consultas longas monopolizam pool/CPU; importação eleva memória; latência de checkout cresce com quantidade de itens.
- **Solução recomendada:** Primeiro validar timezone e intervalo, limitar/admitir carga e configurar timeout/pool adequados; medir p95/p99 e planos em dados sintéticos representativos. Só então otimizar consultas, escritas em lote e leitura por cursor/chunks; avaliar cache curto por filtros com invalidação explícita se houver ganho medido.
- **Componentes impactados:** `backend/src/modules/dashboard/contracts`, `backend/src/modules/dashboard/repository`, `frontend/src/pages`, `backend/src`, `backend/src/services/legacy-import`, `backend/src/modules/sales/repository`.
- **Dependências:** [TSK-027](03-backlog-tecnico.md#tsk-027), [TSK-032](03-backlog-tecnico.md#tsk-032)
- **Critérios de aceitação:** Intervalo/timezone inválidos recebem erro contratual; query longa termina dentro do budget aprovado; erro não esgota pool; baseline de dashboard/importação/checkout registrado com volume e concorrência; otimização preserva resultados.
- **Validação e reversão:** EXPLAIN ANALYZE em banco descartável, carga concorrente representativa, intervalos extremos, importação grande e checkout com muitos itens; limites de memória e cancelamento. Limites configuráveis com teto seguro e otimizações atrás de flag; manter consulta anterior para comparação sem executar ambas em produção indefinidamente.
- **Atividade planejada:** [TSK-033 — Estabelecer limites e medir consultas/processamento](03-backlog-tecnico.md#tsk-033).

<a id="tec-034"></a>

### TEC-034 — Agente não limita requisições e protocolo permite resultado incerto

- **Natureza e certeza:** Risco arquitetural / confiabilidade. Limites/timeouts comprovados; conectividade Docker/loopback permanece hipótese.
- **Classificação:** Alta; P1; esforço médio; risco de implementação médio. Probabilidade: Média em impressora lenta ou cliente local indevido.
- **Descrição técnica:** Agente de loopback não autentica nem limita copies/concorrência; qualquer inteiro positivo é aceito, diferente do limite dez da API. API desiste em 8 s, agente em 15 s: impressão pode concluir após timeout e uma repetição duplicá-la. Compose usa host.docker.internal, mas serviço escuta 127.0.0.1; alcançabilidade depende da topologia e não foi comprovada.
- **Causa-raiz provável:** Stub tornou-se integração operacional sem contrato de job e controles de acesso locais.
- **Evidências:** [agent/src/index.ts](../../agent/src/index.ts):90–125; [agent/src/index.ts](../../agent/src/index.ts):28–49; [backend/src/services/print-agent.ts](../../backend/src/services/print-agent.ts):23–43; [backend/src/config/env.ts](../../backend/src/config/env.ts):46–47; [docker-compose.yml](../../docker-compose.yml):44–52.
- **Risco e impacto:** Processos/impressões excessivos e segunda impressão após resultado incerto; indisponibilidade no empacotamento real.
- **Solução recomendada:** Definir topologia por PDV sem expor indiscriminadamente o agente; autenticar origem, validar esquema/cópias/tamanho e limitar fila/concorrência. Usar job_id estável com status consultável e alinhar deadlines/cancelamento ao estado do spooler.
- **Componentes impactados:** `agent/src`, `backend/src/services`, `backend/src/config`, `docker-compose.yml`.
- **Dependências:** [TSK-015](03-backlog-tecnico.md#tsk-015), [TSK-031](03-backlog-tecnico.md#tsk-031)
- **Critérios de aceitação:** Chamada sem credencial é recusada, cópias acima do teto não iniciam processo; reenvio do mesmo job não imprime novamente; timeout permite consultar resultado; smoke test confirma caminho da API até o host escolhido.
- **Validação e reversão:** Contrato com spooler simulado, job lento, timeout/replay, limites inválidos e duas requisições; teste operacional controlado com página sintética após definir topologia. Manter visualização/impressão pelo navegador como contingência já existente e suspender envio ao agente quando o estado for incerto.
- **Atividade planejada:** [TSK-034 — Formalizar protocolo seguro e idempotente de impressão](03-backlog-tecnico.md#tsk-034).

<a id="tec-035"></a>

### TEC-035 — Conversores numéricos transformam texto inválido em zero ou outro valor

- **Natureza e certeza:** Bug / inconsistência funcional. Comportamento reproduzido no parser real compilado.
- **Classificação:** Média; P2; esforço baixo; risco de implementação médio. Probabilidade: Média por entrada digitada ou cliente externo.
- **Descrição técnica:** Conversores removem caracteres antes de validar. abc vira string vazia e Number("") é zero; 1e3 vira 13. Campos de preço não negativos aceitam zero, escondendo erro de entrada. Existem implementações semelhantes em camadas distintas.
- **Causa-raiz provável:** Sanitização permissiva confundida com validação sintática de número localizado.
- **Evidências:** [backend/src/routes/products.ts](../../backend/src/routes/products.ts):22–49; [backend/src/modules/customer-payments/domain/customer-payments-domain.ts](../../backend/src/modules/customer-payments/domain/customer-payments-domain.ts):5–29; [frontend/src/utils/number.ts](../../frontend/src/utils/number.ts):19–34.
- **Risco e impacto:** Preço/limite incorreto gravado sem avisar; comportamento diferente para formatos ambíguos.
- **Solução recomendada:** Definir formatos aceitos e tokens monetários permitidos, recusar texto inválido e formatos ambíguos antes de converter; separar vazio/null de zero. Consolidar casos de teste compartilhados entre parsers sem acoplar UI ao banco.
- **Componentes impactados:** `backend/src/routes`, `backend/src/modules/customer-payments/domain`, `frontend/src/utils`.
- **Dependências:** [TSK-013](03-backlog-tecnico.md#tsk-013)
- **Critérios de aceitação:** abc e 1e3 seguem política explícita e não viram 0/13 silenciosamente; vazio continua null quando permitido; R$ 1.234,56 e formato alternativo aprovado convertem corretamente; inválido não é persistido.
- **Validação e reversão:** Tabela de formatos pt-BR, negativos, separadores repetidos, letras, zero, vazio e limites; teste de schema HTTP de produto/cliente. Introduzir validação com mensagem de correção e telemetria mascarada de rejeições; não reinterpretar valores históricos.
- **Atividade planejada:** [TSK-035 — Recusar entradas numéricas inválidas sem coerção silenciosa](03-backlog-tecnico.md#tsk-035).

<a id="tec-036"></a>

### TEC-036 — Modal permite fuga inicial de foco e campos do PDV não têm nome acessível

- **Natureza e certeza:** Débito técnico. Lacunas estáticas comprovadas; conformidade visual/assistiva não testada.
- **Classificação:** Média; P2; esforço baixo; risco de implementação baixo. Probabilidade: Alta para navegação por teclado/leitor de tela nesses elementos.
- **Descrição técnica:** Foco inicial vai ao container tabindex=-1. Shift+Tab só é interceptado quando current é o primeiro controle, permitindo sair do modal na primeira interação a partir do container. Busca e quantidade por item não têm label/aria-label; erros visuais dos formulários não estão associados ao campo por aria-describedby/aria-invalid.
- **Causa-raiz provável:** Primitivos acessíveis parcialmente implementados sem testes de teclado e nomes.
- **Evidências:** [frontend/src/components/ui/Modal.tsx](../../frontend/src/components/ui/Modal.tsx):28–65; [frontend/src/components/ui/Modal.tsx](../../frontend/src/components/ui/Modal.tsx):81–93; [frontend/src/pages/PosPage.tsx](../../frontend/src/pages/PosPage.tsx):237–242; [frontend/src/pages/PosPage.tsx](../../frontend/src/pages/PosPage.tsx):355–361; [frontend/src/pages/catalog/customers/CustomerFormModal.tsx](../../frontend/src/pages/catalog/customers/CustomerFormModal.tsx):32–51.
- **Risco e impacto:** Operador perde contexto no diálogo e tecnologia assistiva não identifica campos/erros.
- **Solução recomendada:** Corrigir entrada/ciclo/restauração de foco, impedir interação com fundo, nomear campos por item e associar erros. Traduzir nomes de controles e verificar teclado/leitor de tela segundo WCAG e padrão de diálogo modal.
- **Componentes impactados:** `frontend/src/components/ui`, `frontend/src/pages`, `frontend/src/pages/catalog/customers`.
- **Dependências:** [TSK-027](03-backlog-tecnico.md#tsk-027)
- **Critérios de aceitação:** Tab/Shift+Tab nunca saem do modal aberto, inclusive a partir do container; foco retorna ao acionador; todo input tem nome; erro é anunciado/associado; diálogos aninhados seguem política explícita.
- **Validação e reversão:** Teste DOM/teclado automatizado e verificação manual de leitor de tela, zoom e responsividade em PDV; auditoria de contraste separada. Alterar primeiro o componente Modal isoladamente e validar todos os seus consumidores; não remover recursos de acessibilidade existentes.
- **Atividade planejada:** [TSK-036 — Completar foco e nomes acessíveis nos fluxos de caixa](03-backlog-tecnico.md#tsk-036).
- **Referência externa e aplicabilidade:** [Padrão de diálogo modal W3C](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/) e [WCAG 2.2](https://www.w3.org/TR/WCAG22/), especialmente relações entre campos/erros, ordem de foco e nome/papel/valor. A conformidade global não foi certificada.

<a id="tec-037"></a>

### TEC-037 — Rotas são carregadas em um único bundle principal

- **Natureza e certeza:** Oportunidade de otimização. Resultado de build e imports comprovados; impacto em dispositivos não medido.
- **Classificação:** Baixa; P3; esforço baixo; risco de implementação baixo. Probabilidade: Alta de baixar código administrativo no carregamento inicial.
- **Descrição técnica:** Todas as páginas são importadas estaticamente. Build isolado gerou JS principal 526,53 kB (146,39 kB gzip) e aviso de chunk acima de 500 kB. Tamanho sozinho não prova latência inadequada na rede do caixa.
- **Causa-raiz provável:** Ausência de divisão por rota na SPA.
- **Evidências:** [frontend/src/App.tsx](../../frontend/src/App.tsx):3–23; [frontend/src/App.tsx](../../frontend/src/App.tsx):44–79.
- **Risco e impacto:** Carregamento inicial e parsing de código pouco usado maiores que o necessário.
- **Solução recomendada:** Medir abertura do PDV em dispositivo/rede representativos e aplicar React.lazy/Suspense por rotas administrativas/relatórios, com tratamento de falha e recarga de chunk; manter caminhos críticos previsíveis.
- **Componentes impactados:** `frontend/src`.
- **Dependências:** [TSK-027](03-backlog-tecnico.md#tsk-027)
- **Critérios de aceitação:** Bundle inicial reduzido com relatório comparativo; rota direta e recuperação de chunk antigo funcionam; não há regressão de login/PDV; meta de carregamento definida a partir do baseline.
- **Validação e reversão:** Build com análise de chunks e smoke de rotas diretas; rede lenta/offline transitório e aplicação aberta durante novo deploy. Retornar imports estáticos se recuperação de chunks falhar; preservar assets antigos por período de compatibilidade no deploy.
- **Atividade planejada:** [TSK-037 — Dividir bundle por rotas após medir carregamento](03-backlog-tecnico.md#tsk-037).

<a id="tec-038"></a>

### TEC-038 — Checksums de migração são gravados mas não verificados

- **Natureza e certeza:** Risco arquitetural / confiabilidade. Lacuna comprovada no executor.
- **Classificação:** Média; P2; esforço médio; risco de implementação médio. Probabilidade: Média se arquivo aplicado for alterado ou esquema desviar.
- **Descrição técnica:** Executor seleciona somente filename e pula arquivos aplicados sem comparar checksum. Novas migrações executam todas na mesma transação durante startup. Backup ainda executa CREATE TABLE/INDEX em runtime, apesar de schema já possuir essas estruturas.
- **Causa-raiz provável:** Versionamento registra passagem, mas não valida imutabilidade nem separa totalmente migração de operação.
- **Evidências:** [backend/src/services/migrations.ts](../../backend/src/services/migrations.ts):32–59; [backend/src/services/backup-restore-service.ts](../../backend/src/services/backup-restore-service.ts):27–48; [backend/src/server.ts](../../backend/src/server.ts):9–13.
- **Risco e impacto:** Dois ambientes alegam mesma versão com SQL diferente; DDL/permissões extras no usuário da API; deploy pode ficar bloqueado por migração longa.
- **Solução recomendada:** Conferir checksum de arquivos já aplicados e falhar de forma acionável em divergência; mover DDL de operação para migrações, criar testes fresh/upgrade e separar migração de startup quando a operação exigir. Planejar índices e alterações incompatíveis por expansão/contração.
- **Componentes impactados:** `backend/src/services`, `backend/src`.
- **Dependências:** [TSK-005](03-backlog-tecnico.md#tsk-005), [TSK-027](03-backlog-tecnico.md#tsk-027)
- **Critérios de aceitação:** Editar arquivo aplicado falha antes de servir; banco novo e upgrade de snapshot sintético convergem; caminhos de backup não criam schema; usuário operacional funciona sem privilégios DDL gerais.
- **Validação e reversão:** Checksum alterado, arquivo ausente, migração falha, execução concorrente e upgrade do schema anterior; inspeção de permissões. Nunca editar migração publicada para desfazer; criar correção progressiva e manter aplicação compatível com schema expandido.
- **Atividade planejada:** [TSK-038 — Validar imutabilidade e upgrade das migrações](03-backlog-tecnico.md#tsk-038).

<a id="tec-039"></a>

### TEC-039 — Documentação e variáveis de implantação divergem do artefato entregue

- **Natureza e certeza:** Débito técnico. Divergências comprovadas nos arquivos.
- **Classificação:** Baixa; P3; esforço baixo; risco de implementação baixo. Probabilidade: Alta ao seguir instruções de setup/operação.
- **Descrição técnica:** README afirma service worker e src/sw.ts inexistentes, frontend em preview embora a imagem use Nginx, Redis opcional embora inicialização use fila, e aponta documentação/scripts ausentes. VITE_API_BASE é passado em runtime ao Nginx, mas Vite o incorpora no build; COMPANY_*, BACKUP_PATH e METRICS_TOKEN não são propagados no bloco da API.
- **Causa-raiz provável:** Documentação de starter e configuração incremental não reconciliadas com o pacote final.
- **Evidências:** [README.md](../../README.md):44–51; [README.md](../../README.md):143–150; [README.md](../../README.md):156–159; [README.md](../../README.md):181–190; [frontend/src/main.tsx](../../frontend/src/main.tsx):17–30; [frontend/Dockerfile](../../frontend/Dockerfile):1–11; [docker-compose.yml](../../docker-compose.yml):18–48; [docker-compose.yml](../../docker-compose.yml):54–58.
- **Risco e impacto:** Expectativa indevida de offline, empresa de recibo não configurada e deploy com URL/observabilidade incorretos.
- **Solução recomendada:** Atualizar instruções para comportamento verificado, remover promessas de offline sem implementação e conferir links. Definir contrato único de variáveis build/runtime e encaminhar apenas configurações suportadas; documentar bootstrap, certificados, volumes, backup e rollback reais.
- **Componentes impactados:** `README.md`, `frontend/src`, `frontend`, `docker-compose.yml`.
- **Dependências:** [TSK-002](03-backlog-tecnico.md#tsk-002), [TSK-007](03-backlog-tecnico.md#tsk-007), [TSK-020](03-backlog-tecnico.md#tsk-020)
- **Critérios de aceitação:** Setup limpo segue passos existentes; não anuncia offline inexistente; build com API_BASE alternativo e recibo com COMPANY_* refletem configuração; métricas autenticadas coletáveis; links internos válidos.
- **Validação e reversão:** Smoke de documentação/setup em ambiente descartável, build com configuração alternativa e validação automática de links/chaves de ambiente. Mudanças documentais e de passagem de variáveis aditivas; manter defaults compatíveis e não publicar segredos em exemplos.
- **Atividade planejada:** [TSK-039 — Reconciliar documentação e variáveis com o artefato](03-backlog-tecnico.md#tsk-039).

## Condições não confirmadas

Não há prova de exploração, vazamento público ou incidente de produção. O conteúdo e a origem dos DBFs não foram inspecionados. O alcance da conexão Docker → agente, as fórmulas de crédito/estoque permitidas e o volume real precisam das validações de contexto listadas no [diagnóstico](01-diagnostico-arquitetural.md#10-questões-que-exigem-validação-de-contexto). A auditoria não declara ausência absoluta de SQL injection, XSS, CSRF ou SSRF; registra apenas que não foi demonstrado caminho explorável nos fluxos examinados.
