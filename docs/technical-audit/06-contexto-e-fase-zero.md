# Contexto confirmado e execução da fase zero

Data: **21/10/2026**. O usuário autorizou iniciar a fase zero após esclarecer o contexto. Base Git: `ac85924e7a94e836805e770c60db8141c783bca6`, **com alterações locais preexistentes**. O commit sozinho não representa a base de trabalho. Nenhum commit, push ou deploy foi realizado.

## 1. Decisões confirmadas

| Assunto | Decisão do usuário | Aplicação no roadmap |
|---|---|---|
| Credenciais | Desenvolvimento, sem uso em ambiente ativo; implementar melhores práticas. | TSK-001: ambientes locais fora do índice, geração aleatória e rotação JWT/métricas. |
| DBF/DBT | Dados sintéticos. | Classificação registrada; arquivos preservados. Não representam vazamento comprovado de dados reais. |
| Cliente e crédito | Cliente inativo e limite de crédito devem bloquear venda. | TSK-014: validar cliente e exposição na transação, com concorrência. Implementação comercial na fase 3. |
| Cancelamento | Permitir crédito/reembolso após definir contabilidade e autorização. | Proposta na seção 6; nenhum crédito/reembolso criado nesta fase. |
| Estoque | Estoque negativo proibido. | Bloqueio transacional com locks consistentes por produto; insuficiência recusa a venda inteira. Incluir na fase 3 e suas regressões. |
| Vendas históricas | Reconciliar amostra com a origem dos movimentos antes de corrigir cancelamentos antigos. | Sem backfill universal nem entradas históricas automáticas. |
| Margem | Excluir produtos sem informação de custo dos KPIs de margem. | TSK-032: numerador e denominador na mesma população com custo conhecido. Datas, fonte de custo e tratamento de custo zero ainda precisam de definição específica. |
| Impressão | Validar máquina/topologia com infraestrutura e operadores, sem abrir portas indiscriminadamente. | TSK-034 pendente de ensaio operacional. Fonte do agente, loopback e URL de impressão preservados nesta fase. |

## 2. Entregas do corte inicial

| Tarefa | Resultado | Evidência principal |
|---|---|---|
| TSK-001 | `.env` e `backend/.env` retirados do índice, mantendo cópias locais ignoradas. JWT dos dois ambientes e token de métricas rotacionados sem exibir valores. Gerador com CSPRNG e recusa de placeholders. | `infra/setup-dev-env.mjs`, `infra/check-repository-secrets.mjs` e CI. |
| TSK-005 | Lockfile backend reconstituído; três lockfiles verificados com instalação limpa. | Manifestos/lockfiles, `.nvmrc`, `.node-version` e evidência JSON. |
| TSK-006 | ZIP confinado; bloqueio de symlinks/especiais, travessia, nomes ambíguos, colisões e destinos ocupados. Limites de entradas, profundidade, bytes declarados/efetivos e tempo, incluindo budget conjunto de importação. Limpeza de temporários também nas rejeições iniciais. | Testes de `safe-archive`, `archive-files` e rota real de importação. |
| TSK-007 | Node 24.21.0, npm 12.2.0, Multer 2.4.0, yauzl 3.4.0, Vite 6.4.5, Vitest 4.1.12, React Router 7.18.4 e transitivas atualizadas. Dependências diretas sem uso removidas. Node/Nginx fixados por digest; Nginx validado em 1.30.6. | Instalações, typechecks/builds e auditorias npm. |
| TSK-021 | Limites compartilhados PostgreSQL por conta/IP/global: 10/100/1.000 tentativas por 900s, configuráveis; chaves HMAC e atualização atômica. `429` com `Retry-After`; controle indisponível recusa login com `503`. | Concorrência entre dois stores reais, expiração e testes HTTP. |
| TSK-022 | Sessões com JTI, validade e revogação; HS256/issuer/audience. Logout revoga a sessão atual. Senha/desativação revogam todas na transação da alteração. | Migração `20261021_001_auth_sessions_and_login_limits.sql` e integração. |
| TSK-023 | Limpeza imediata de consultas, mutações e carrinho; cancelamento de requests e descarte de respostas tardias. Marcador de logout offline evita restaurar cookie silenciosamente. Subárvore privada remontada por identidade e permissão antes de montar páginas. | Store, transporte, URL administrativa negada e rota profunda com roteador atualizado. |
| TSK-025 | Templates/rótulos fixos para rotas desconhecidas ou sem autenticação; métodos fora da lista viram OTHER. Token dedicado obrigatório em produção. | 90 requests distintos geram três séries de contador; smoke de token. |
| TSK-027, primeiro corte | PostgreSQL/Redis descartáveis, migrações reais, BullMQ e smoke de imagens. Restore/overwrite desabilitados por padrão como contenção temporária. | `infra/test-disposable.mjs`, Compose de teste e `backend/test`. |
| TSK-033, primeiro corte | Datas de calendário estritas, timezone válida e até 366 dias inclusivos no dashboard. Pool: 10 conexões, espera 5s, statement 30s, lock 5s e transação ociosa 60s. | Schemas dos endpoints e timeout real com recuperação da conexão. |

React e o modelo declarativo de rotas foram preservados. A versão 6 mais recente ainda apresentava avisos cuja correção exigiu o corte para 7.18.4. Referências primárias: [migração v6→v7](https://reactrouter.com/7.18.4/upgrading/v6), [redirecionamento externo](https://github.com/remix-run/react-router/security/advisories/GHSA-wrjc-x8rr-h8h6) e [hidratação SSR](https://github.com/remix-run/react-router/security/advisories/GHSA-337j-9hxr-rhxg).

## 3. Verificação realizada

| Verificação | Resultado |
|---|---|
| `npm ci --ignore-scripts --no-audit --no-fund` | Passou nos três projetos. |
| Typecheck | Passou nos três; backend inclui integração/regressão na checagem. |
| Backend em `src` | **99 testes passaram**. |
| Frontend | **37 testes passaram**. |
| Agente | **1 teste passou**, sem acionar impressora. |
| Integração PostgreSQL/Redis | **11 testes passaram**, com massa sintética descartável. |
| Contenção restore/overwrite | **2 testes passaram**, recusando antes de acesso destrutivo. |
| Dívida financeira da fase 3 | **2 falhas esperadas explícitas**, TSK-013/016; não são defeitos corrigidos. |
| Builds backend/frontend e lint existente | Passaram. Regras limitadas de lint continuam na TSK-028. |
| `npm audit`, dependências totais | **0 avisos** nos três lockfiles nesta execução. Não equivale a varredura dos pacotes do sistema operacional das imagens. |
| Imagens | Construídas/iniciadas; health, métricas com token, login, logout/revogação e fallback de URL da SPA passaram. |
| Compose/segredos | `docker compose config --quiet` e guard passaram. |
| Preservação | DBFs/DBTs e fonte do agente iguais à base local inicial; alterações anteriores fora deste escopo preservadas. |

Total: **150 testes passaram e 2 falhas financeiras esperadas permaneceram identificadas**. [Evidência JSON](07-evidencias-fase-zero.json): versões, resultados e hashes dos manifestos/lockfiles. CI foi configurado; execução remota depende de um futuro push. As verificações acima foram executadas localmente.

O frontend ainda avisa sobre bundle acima de 500 kB; divisão por rota permanece na TSK-037. Recovery, importação e finanças ainda conservam os demais defeitos do inventário até suas fases.

## 4. Reprodução

Pré-requisitos: Node 24.21.0, npm 12.2.0 e Docker Compose. Em `backend`, `frontend` e `agent`: `npm ci --ignore-scripts`, `npm run typecheck` e `npm test`. Backend/frontend também oferecem `npm run lint` e `npm run build`.

Na raiz, PowerShell:

```powershell
$env:NPM_CLI = Join-Path (npm root -g) 'npm/bin/npm-cli.js'
node infra/check-repository-secrets.mjs
node infra/test-disposable.mjs --images
```

Bash:

```bash
NPM_CLI="$(npm root -g)/npm/bin/npm-cli.js" node infra/test-disposable.mjs --images
```

O harness recria **somente** o projeto fixo `pos-phase0-tests`: PostgreSQL/Redis em tmpfs, portas dinâmicas em `127.0.0.1` e banco restrito a `pos_phase0_test`. O Compose da aplicação não é selecionado. Containers/rede de teste são removidos inclusive em falha. O teste do agente exige 9222 livre e não imprime fisicamente.

Os `it.fails` financeiros aparecem explicitamente na saída. Na fase 3, remover `.fails` ao corrigir cada caso; passar inesperadamente faz a suíte falhar até atualizar o marcador. Ensaios destrutivos completos com flags habilitadas continuam obrigatórios nas fases 1/2: a contenção atual não comprova recuperação de restore/overwrite.

## 5. Aplicação local, parâmetros e reversão

1. Ambiente novo: `node infra/setup-dev-env.mjs` gera credenciais únicas. Arquivo existente exige `--rotate-auth`. Nesta execução, a senha PostgreSQL existente foi preservada para não desalinhar volumes locais; não reutilizá-la em ambiente futuro. Nenhuma implantação ativa exigiu rotação, conforme o usuário.
2. Os dois `.env` existem localmente e estão ignorados; as remoções do índice estão preparadas para um futuro commit. O histórico **ainda contém versões anteriores** e não foi reescrito. JWTs antigos são recusados pelas novas chaves/contrato. O guard cobre ambientes rastreados e alguns padrões de chave; não é detector universal nem varredura do histórico.
3. Aplicar a migração expansiva antes de servir a nova API; o bootstrap atual executa migrações pendentes. Operadores precisam autenticar novamente. Nenhuma migração foi aplicada à base de desenvolvimento do usuário nesta execução, apenas às bases de teste.
4. `JWT_TTL` mantém 12h por padrão e aceita até 30 dias; cookie não dura mais que o token. Não há refresh token. Banco disponível é necessário para autenticação/rate limit. Sessões expiradas não concedem acesso; retenção física dessas linhas pode ser acrescentada na consolidação operacional.
5. `TRUSTED_PROXY_CIDRS` vazio não confia em proxy. Informar somente IP/CIDR efetivo antes de atribuir IP individual atrás do Caddy; até lá os clientes compartilham o bucket do proxy. `true` e `/0` são recusados. A janela conta todas as tentativas, inclusive logins bem-sucedidos. Ajustar os budgets com medições reais.
6. ZIP: 5.000 entradas, profundidade 12, 512 MiB descomprimidos e 60s por padrão. Importação compartilha budget entre seus arquivos/ZIPs e recusa nomes ambíguos. Multipart limita campos, partes, arquivos e tamanho por arquivo. O limite agregado é conferido após recepção no temporário; quotas de disco e limitação de tráfego no proxy continuam complementares. Sessões de importação aceitas ainda dependem da persistência/retenção da TSK-020.
7. `ENABLE_DATABASE_RESTORE=false` e `ENABLE_LEGACY_OVERWRITE=false` são o padrão; tentativa recebe 403 com motivo. Worker verifica overwrite também em jobs já enfileirados. Não habilitar antes dos gates correspondentes. Merge mantém o comportamento atual e ainda precisa das correções de idempotência/staging.
8. Descartar resposta tardia não desfaz escrita já confirmada no servidor. Eventos entre abas limpam estado local; cookie é compartilhado pelo mesmo navegador. Identidades simultâneas diferentes exigem perfis separados.

Para reverter código, preservar dados/credenciais locais e usar revisão/imagem validada. A migração é aditiva e pode permanecer; não apagar tabelas com API em execução. **Não recuperar segredos antigos nem readotar JWT sem revogação como rollback silencioso.** Coordenar nova autenticação dos operadores. Não há rollback automático de dados de negócio nesta fase.

## 6. Crédito/reembolso: proposta anterior à implementação

Permitir o fluxo está confirmado. Os detalhes a seguir são **proposta para a fase 3**, sem lançamentos ou novas permissões implementados:

1. Registrar solicitação ligada à venda, motivo, operador, instante e chave de idempotência. Calcular valor líquido aplicado, descontando troco/reversões; preservar documento original.
2. Separar cancelamento operacional/estoque do destino financeiro. Estornar recebíveis elegíveis com contrapartidas explícitas; para recebimentos existentes, escolher crédito nominal ou reembolso no meio autorizado. Venda anônima exige identificação/regra aprovada antes de crédito nominal.
3. Definir permissões distintas para solicitar, aprovar crédito e autorizar reembolso; responsável, limites por perfil, segunda aprovação e eventual proibição de autoaprovação. A permissão atual de cancelar não implica autorização irrestrita de reembolso.
4. Manter razão imutável ligando recebimento, estorno, crédito emitido/consumido e reembolso, sem reescrever pagamentos históricos. Limitar ao valor elegível e conciliar caixa/recebíveis/meio de pagamento numa transação ou estado pendente rastreável para meios externos.
5. Devolver estoque a partir de movimentos atribuíveis à venda. Para operações anteriores aos vínculos, reconciliar amostra DBF/origem/tipo/data/quantidade antes da regra de exceção. Rastrear separadamente o retorno físico e o resultado financeiro.
6. Fechar contas/contrapartidas, eventos de caixa, custo/data e autorização antes de criar telas ou lançamentos. Fixtures: troco, quitação parcial, pagamentos posteriores, reembolso parcial, crédito consumido, concorrência e falha após commit.

## 7. Próximo corte

**Fase 1, começando pela TSK-002:** ferramentas PostgreSQL compatíveis, armazenamento/diretórios e backup verificável; depois lock dedicado, journal fora do schema restaurado e proteção de retenção. Liberação de restore/overwrite, correções financeiras e impressão operacional continuam dependendo das evidências do roadmap.
