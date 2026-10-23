# Fase 5 — Primeiro corte: regras efetivas de lint

Data: **22/10/2026**. Tarefa: **TSK-028 / TEC-028, corte inicial**. A fase 5 está em andamento. As extrações da TSK-029 e o endurecimento de migrações da TSK-038 não foram iniciados neste corte.

## 1. Escopo e dependências

A TSK-028 depende da base de dependências da TSK-007, já entregue. Não exige concluir publicação de importação, snapshots ou cutover para ativar verificações estáticas. As demais pendências do roadmap continuam abertas; este incremento não conclui as fases anteriores nem altera as regras financeiras.

Os arquivos de configuração de ESLint usavam o parser TypeScript sem regras efetivas. Agora backend e frontend têm análise de tipos para Promises, regras de variáveis sem uso, branches constantes e debugger. O frontend verifica também as regras de chamada de hooks. Os scripts de lint recusam qualquer warning, e o CI exige lint e suas provas controladas nos dois workspaces; o agente conserva seus checks anteriores.

## 2. Política adotada

| Regra | Comportamento |
|---|---|
| `@typescript-eslint/no-unused-vars` | Erro. Parâmetros intencionalmente ignorados podem usar prefixo `_`; variáveis comuns não têm dispensa por prefixo. Rest siblings preservados. |
| `@typescript-eslint/no-floating-promises` | Erro com informação de tipos. Await, retorno da Promise ou tratamento de rejeição são caminhos aceitos; `void` permite desligamento explícito e documentado. |
| `react-hooks/rules-of-hooks` | Erro no frontend. Detecta chamada de hook condicional/ordem inconsistente. |
| `no-constant-condition` | Erro para condições constantes de branches. Loops com condição constante ficam permitidos para os readers/loops com término interno já existentes. |
| `no-debugger` | Erro nos dois workspaces. |
| Diretiva de disable sem uso / warning | Reportada e recusada pelo gate de zero warnings. |

**`void` não trata rejeição.** Nos locais explicitados, a invalidação de cache mantém o comportamento eventual: o QueryClient trata os erros de refetch com as opções atuais, e a mutação já foi confirmada. A navegação usa BrowserRouter, cujo modo declarativo não precisa bloquear essas ações. Os callbacks de autenticação já tratam falhas internamente e conservam a limpeza local/marcador de logout. Motivos foram registrados junto aos usos. Uma nova operação com efeito externo não deve receber `void` apenas para silenciar lint; precisa de decisão e tratamento apropriados na revisão.

Não foram ativadas todas as regras recomendadas, `no-misused-promises`, dependências exaustivas de hooks ou a11y. Isso é uma expansão futura, sem dispensa automática dos controles já ativos. O lint segue cobrindo `src` e seus testes internos; testes de integração fora de `src` continuam no TypeScript e no harness, sem ampliação de escopo de lint neste corte.

## 3. Baseline e ajustes

A medição com as regras adotadas encontrou **45 ocorrências**:

| Workspace | Sem uso | Promises sem decisão explícita | Hooks condicionais | Total |
|---|---:|---:|---:|---:|
| Backend | 2 | 0 | 0 | 2 |
| Frontend | 3 | 36 | 4 | 43 |
| Total | 5 | 36 | 4 | 45 |

Os cinco bindings/imports sem uso foram removidos. A verificação de permissão do dashboard foi movida para depois dos quatro `useMemo`, mantendo todos os hooks na mesma ordem em cada render. As consultas conservam `enabled: canReadDashboard`, e a página negada continua mostrando a mesma mensagem. Os cálculos/KPIs não foram modificados.

Entre as 36 Promises, 35 invalidações/navegações passaram a indicar intencionalmente o comportamento assíncrono com `void` e motivo local. A inicialização do i18next recebeu tratamento explícito de rejeição com mensagem fixa, sem incluir o erro/configuração no log. Isso não equivale a corrigir 36 defeitos de execução nem implementa a centralização de invalidações da TSK-030.

Resultado final: **zero erros e zero warnings** nas regras ativadas. A baseline é registro de medição, sem allowlist que esconda ocorrências antigas e sem limiar de tolerância por quantidade. Novas ocorrências não explicitadas interrompem o gate.

## 4. Ferramentas e dependências

- Parser e plugin TypeScript fixados em **8.72.0**, em ambos os workspaces.
- `eslint-plugin-react-hooks` fixado em **7.1.1** no frontend.
- ESLint mantém a versão compatível com a base existente; não houve atualização major de ferramentas ou dependências de execução.
- Lockfiles acompanham os manifestos. Foram acrescentados quatro pacotes de desenvolvimento no backend e oito no frontend; nenhuma versão de pacote já existente no lock foi alterada. `npm audit --audit-level=low` reportou zero vulnerabilidades nos dois workspaces na verificação desta entrega.
- As imagens foram reconstruídas com `npm ci` a partir dos lockfiles novos. Não foi executado autofix/formatação massiva do produto.

## 5. Gate verificável

Execute em backend e frontend:

```powershell
npm run lint
npm run lint:rules
npm run typecheck
npm test
```

[check-lint-rules.mjs](../../infra/check-lint-rules.mjs) usa o **CLI real do ESLint via stdin**. Os exemplos não são gravados em `src` nem executados. Erro de parser não conta como prova: o processo precisa encerrar com código 1 e apontar a regra esperada. Controles válidos precisam encerrar com 0 e nenhuma mensagem.

| Prova | Backend | Frontend |
|---|---:|---:|
| Promise ignorada, variável morta, branch constante, debugger | 4 recusas esperadas | 4 recusas esperadas |
| Hook condicional | — | 1 recusa esperada |
| Promise aguardada e desligamento explícito | 2 controles válidos | 2 controles válidos |
| Hook incondicional | — | 1 controle válido |
| Script real de testes com todos os arquivos excluídos | Falha por suíte vazia | Falha por suíte vazia |

São **16 controles**, incluindo nove recusas de lint, cinco exemplos válidos e duas seleções vazias. As recusas são resultados positivos do gate, distintos da falha financeira esperada da TSK-016.

Para que a análise de tipos veja o conteúdo de stdin em vez do entrypoint no disco, somente os processos das fixtures usam `TSESTREE_SINGLE_RUN=false`. O lint normal do projeto não muda de modo. A verificação de suíte vazia invoca o script `npm test` real com `--exclude **/*`: reintroduzir `passWithNoTests` faz o controle falhar. O gate deve ser executado via `npm run lint:rules`, que fornece o CLI do npm ao subprocesso.

## 6. Validação e limites

**259 testes de produto aprovados:** backend 138, frontend 67, integração PostgreSQL/Redis 51 e regressões normais 3. Continua uma falha esperada da TSK-016, anterior ao corte. Os 16 controles de lint/suíte vazia são adicionais, sem somá-los aos testes de produto.

Lint, TypeScript, provas controladas, instalação por lockfile e builds passaram. O harness `node infra/test-disposable.mjs --images --backups` aprovou as imagens de API/frontend, autenticação/métricas/SPA e os ensaios de backup/simulação/persistência. Não houve ensaio novo de navegador, acessibilidade, carga ou impressora. Configuração de CI foi verificada localmente; não foi disparada execução remota do GitHub Actions. [Evidências e hashes](17-evidencias-fase-cinco.json).

Sem migração, alteração de transações/locks, correção histórica ou execução no banco do usuário. Segredos, DBFs sintéticos e trabalho anterior foram preservados. Restore/overwrite seguem bloqueados por padrão e nenhuma porta do agente foi aberta. Não houve commit, push ou deploy.

## 7. Próximos cortes e reversão

| Área | Estado |
|---|---|
| TSK-028 | Primeiro conjunto efetivo de regras e gates implementado. Outras regras exigem medição própria, controles negativos e revisão dos usos existentes. |
| TSK-029 | Pendente. Extrações do worker/CRUDs/componentes dependem de proteção de comportamento e dos gates de importação ainda abertos. |
| TSK-038 | Pendente. Checksums de migrações, fresh/upgrade, DDL fora de operações e privilégio mínimo não foram alterados. |
| Fases 1 a 4 | Pendências mantidas, incluindo recuperação coordenada, importação segura, invariantes financeiras, listas/seletores, cache, auditoria, impressão e acessibilidade. |

Para reverter ferramentas, tratar manifestos, lockfiles, configurações, scripts e passo do CI como conjunto compatível. Se uma regra for problemática, revisar aquela regra/exceção com motivo e manter os outros controles. Não criar tolerância global nem esconder a falha removendo o gate. A correção da ordem dos hooks do dashboard pode ser preservada independentemente da reversão de tooling; não há DDL a desfazer.
