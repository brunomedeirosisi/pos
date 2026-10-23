# Roadmap de implementação

Data: **21/10/2026**. Fundamentação: [diagnóstico](01-diagnostico-arquitetural.md) e [inventário](02-inventario-problemas.md). Detalhes executáveis: [backlog](03-backlog-tecnico.md).

O planejamento original foi elaborado sem alteração do produto. **A fase 0 foi autorizada pelo usuário em 21/10/2026**; sua execução e as decisões confirmadas estão no [registro de implementação](06-contexto-e-fase-zero.md). A fase 1 foi autorizada em seguida e seu [primeiro corte está implementado](08-fase-um-primeiro-corte.md); os demais gates da recuperação permanecem planejados. A fase 2 foi iniciada em 22/10/2026 pelo [corte de isolamento da TSK-019](10-fase-dois-primeiro-corte.md), independente dos caminhos destrutivos que continuam bloqueados. A fase 3 foi iniciada em 22/10/2026 pelo [primeiro corte monetário da TSK-013](12-fase-tres-primeiro-corte.md), mantendo as pendências das fases anteriores. A fase 4 foi iniciada em 22/10/2026 pelo [corte de relatório completo da TSK-024](14-fase-quatro-primeiro-corte.md), preservando as pendências anteriores. A fase 5 foi iniciada em 22/10/2026 pelo [corte de lint efetivo da TSK-028](16-fase-cinco-primeiro-corte.md), sem concluir as dependências dos demais cortes. A fase 6 foi iniciada em 22/10/2026 pelo [corte de medição HTTP da TSK-033](18-fase-seis-primeiro-corte.md), mantendo abertas as correções financeiras e as demais dependências. A ordem considera dependências, segurança dos dados e preservação da operação. Uma fase não corresponde automaticamente a uma sprint. Não há estimativa de datas sem conhecer equipe, disponibilidade e capacidade.

## 1. Sequência e esforço relativo

| Fase | Objetivo | Tarefas | Pontos relativos |
|---|---|---|---:|
| 0 | Conter exposição e tornar a validação reproduzível | TSK-001, 005, 006, 007, 021, 022, 023, 025; primeiro corte de 027 e 033 | 29 |
| 1 | Ter recuperação realmente operável e coordenada | TSK-002, 008, 009, 010, 003, 011 | 22 |
| 2 | Tornar a importação recuperável, isolada e repetível | TSK-019, 004, 018, 020 | 23 |
| 3 | Estabilizar dinheiro, recebíveis, comprovantes e KPIs | TSK-013, 016, 012, 014, 015, 017, 032, 035; conclusão de 027 | 35 |
| 4 | Completar dados, erros, auditoria e impressão nos fluxos | TSK-024, 030, 026, 031, 034, 036 | 24 |
| 5 | Reduzir dívida estrutural com proteção de regressão | TSK-028, 029, 038 | 13 |
| 6 | Otimizar a partir de medições e consolidar operação | Conclusão de TSK-033; TSK-037, 039 | 7 |
| **Total** | **39 tarefas, algumas divididas em cortes** | Sem duplicar estimativas das tarefas transversais | **153** |

TSK-027 divide seus oito pontos em três para harness/regressões críticas na fase 0 e cinco para integração/E2E completos na fase 3. TSK-033 divide seus cinco pontos em dois para limites/timeouts na fase 0 e três para medições/otimizações na fase 6. Essa divisão é uma hipótese inicial de planejamento, sujeita à calibração da equipe. Os pontos não são horas, dias ou promessa de produtividade.

A fase 0 deve entregar pequenas contenções individualmente; não é necessário concluir toda atualização de ferramentas para começar a recuperar a capacidade de backup. O subconjunto **TSK-005 → TSK-002** habilita esse caminho. A infraestrutura de teste começa cedo e acompanha cada correção; “concluir TSK-027 na fase 3” não adia testes dos P0.

## 2. Fase 0 — Contenção e base verificável

**Objetivo:** reduzir exposição imediatamente e preparar um ciclo de entrega que detecte os defeitos encontrados.

Sequência recomendada:

1. [TSK-001](03-backlog-tecnico.md#tsk-001): classificar material rastreado, inventariar onde os segredos são usados e rotacionar os aplicáveis; não republicar o conteúdo removido.
2. [TSK-005](03-backlog-tecnico.md#tsk-005): revisar a exclusão local do lockfile e restabelecer instalação reproduzível. Registrar revisão, manifestos, lockfiles e versões de runtime da base aprovada.
3. [TSK-027, corte inicial](03-backlog-tecnico.md#tsk-027): harness de PostgreSQL/Redis descartáveis, smoke test de imagem e regressões mínimas para restore, overwrite e cálculos. Testes dos defeitos devem falhar na base anterior e passar na correção.
4. [TSK-006](03-backlog-tecnico.md#tsk-006) e [TSK-007](03-backlog-tecnico.md#tsk-007): confinar arquivos e atualizar dependências por superfície, preservando formatos e contratos. Não executar atualização major global automática.
5. [TSK-021](03-backlog-tecnico.md#tsk-021), [TSK-022](03-backlog-tecnico.md#tsk-022), [TSK-023](03-backlog-tecnico.md#tsk-023) e [TSK-025](03-backlog-tecnico.md#tsk-025): conter abuso do login, definir revogação, limpar estado entre operadores e limitar cardinalidade de métricas.
6. [TSK-033, limites](03-backlog-tecnico.md#tsk-033): recusar intervalos/timezones inválidos, definir budgets de consulta/conexão e evitar operações sem limite enquanto medições completas ainda não existem.

**Dependências:** inventário de implantação para rotação; ambiente descartável para testes; decisões de duração/alcance de sessão. A existência de proteção externa deve ser verificada, sem presumi-la.

**Resultado esperado:** release reproduzível, segredos tratados e superfícies mais urgentes controladas. Fluxos comerciais normais continuam disponíveis. Recomenda-se restringir operacionalmente restore/overwrite até os gates das fases 1/2 serem comprovados; isso é uma recomendação do plano, não uma alteração efetuada pela auditoria.

**Critério de conclusão:** `npm ci` e builds limpos; credenciais antigas recusadas onde eram usadas; regressões críticas executáveis; nenhuma entrada ZIP escapa do destino controlado; troca de usuário não conserva dados privados; métricas têm cardinalidade limitada.

**Validação e mitigação:** PRs pequenos por controle, dados sintéticos, rollout de segredo com janela curta e monitorada, retenção de imagem/lock anterior e teste de usuário legítimo para evitar bloqueio indevido.

## 3. Fase 1 — Recuperação de dados

**Em andamento:** primeiro corte de TSK-002/008 implementado e validado em ambiente descartável. Ver [estado por tarefa e evidências](08-fase-um-primeiro-corte.md); isso não libera o restore da aplicação.

**Objetivo:** transformar os mecanismos existentes de dump, simulação e snapshot em um procedimento confiável.

Tarefas na ordem de dependência:

- [TSK-002](03-backlog-tecnico.md#tsk-002): ferramentas PostgreSQL compatíveis, diretórios graváveis e armazenamento persistente/externo.
- [TSK-008](03-backlog-tecnico.md#tsk-008): lock em conexão dedicada; coordenar operações que alteram os arquivos.
- [TSK-009](03-backlog-tecnico.md#tsk-009): journal/manifesto fora do schema restaurado, identidade desacoplada do banco histórico e catálogo reconciliável.
- [TSK-010](03-backlog-tecnico.md#tsk-010): proteger alvo/snapshot contra retenção e exclusão concorrente.
- [TSK-003](03-backlog-tecnico.md#tsk-003): manutenção coordenada, drenagem de API/worker, alvo validado, credenciais restritas e cutover recuperável.
- [TSK-011](03-backlog-tecnico.md#tsk-011): apresentar `ok`, `rolled_back` e falha com o resultado real nos dois fluxos da UI.

**Dependências:** TSK-005 e TSK-006; validação inicial da TSK-027. Não habilitar o caminho destrutivo novo antes de ensaiar o procedimento completo.

**Resultado esperado:** um backup verificável e descobrível sobrevive à recriação da API; a restauração conserva registros de controle e não perde operações reconhecidas ao cliente durante a janela.

**Critério de conclusão:** restaurar o backup mais antigo com retenção cheia funciona em banco descartável; falhas em cada transição têm resultado recuperável; usuário ausente no backup não quebra o journal; reabertura depende de reconciliação de contagens, FKs, saldos e smoke de login/caixa. Registrar RPO/RTO medidos no ensaio e submetê-los ao responsável operacional; não inventar metas sem contexto.

**Validação e mitigação:** restaurar exclusivamente massa sintética/anonimizada em alvo isolado; simular indisponibilidade, interrupção e falha de auditoria; preservar banco anterior e snapshot fora do conjunto substituído; documentar responsável por autorizar cutover e retorno. Durante operação real futura, exigir janela coordenada e procedimento aprovado.

## 4. Fase 2 — Importação legada segura

**Em andamento:** contenção da TSK-019 implementada com lock global, conexão única e reconstrução de staging por tentativa. Ver [escopo e evidências](10-fase-dois-primeiro-corte.md). TSK-004/018/020 e os gates de recuperação da fase 1 permanecem pendentes.

**Objetivo:** preservar o core existente enquanto os arquivos são preparados e permitir repetição sem duplicação.

1. [TSK-019](03-backlog-tecnico.md#tsk-019): serialização global como contenção, depois staging por sessão se necessário; testar também retry A → execução B → retomada A.
2. [TSK-004](03-backlog-tecnico.md#tsk-004): validar a massa antes de excluir/substituir; delimitar escopo de overwrite e publicação final com snapshot independente.
3. [TSK-018](03-backlog-tecnico.md#tsk-018): identidade estável de pagamentos/movimentos e merge idempotente entre sessões, respeitando duplicatas legítimas.
4. [TSK-020](03-backlog-tecnico.md#tsk-020): arquivos/Redis persistidos, reconciliação de despacho pendente, handlers de erro, readiness e shutdown com drenagem.

**Dependências:** capacidade de recuperação comprovada na fase 1. A migração da identidade legada exige amostras sintéticas que representem o formato real e uma decisão sobre duplicatas válidas.

**Resultado esperado:** upload aceito mantém seus insumos após recriação; falha de parsing não esvazia a base; segunda importação não soma recebimentos/estoque novamente.

**Critério de conclusão:** fixtures importadas duas vezes produzem mesmos totais e relações; execução sobreposta ou intercalada não mistura massas; cancelamento/restart conserva checkpoints corretos; reconciliação compara origem, rejeições, quantidade e valores por domínio antes da publicação.

**Validação e mitigação:** ensaio em cópia anonimizada quando houver autorização e ambiente próprio; preservar arquivos originais; publicar relatório de impacto antes de corrigir duplicações existentes; não excluir automaticamente registros “parecidos”. Definir se overwrite substitui somente legado ou toda a operação e refletir a decisão no contrato/UI.

## 5. Fase 3 — Invariantes financeiras e históricas

**Em andamento:** primeiro corte da TSK-013 implementado para checkout, prévia e escala de recebimentos. A regressão de soma dos itens foi corrigida; a TSK-016 foi depois corrigida no [follow-up de testes Docker](20-validacao-docker-e-correcoes.md), passando a regressão obrigatória. [Escopo, evidências e limitações](12-fase-tres-primeiro-corte.md). Isso não conclui a fase nem seus controles de crédito/estoque/histórico.

**Objetivo:** assegurar que o operador, os recibos, a API e o banco concordem sobre dinheiro e saldo.

Ordem recomendada:

1. [TSK-013](03-backlog-tecnico.md#tsk-013) e [TSK-035](03-backlog-tecnico.md#tsk-035): política monetária, escala de quantidade e parsing estrito.
2. [TSK-016](03-backlog-tecnico.md#tsk-016): contrato operacional que não conclui venda anônima sem quitação.
3. [TSK-012](03-backlog-tecnico.md#tsk-012): separar valor entregue, troco e pagamento aplicado em todos os consumidores.
4. [TSK-014](03-backlog-tecnico.md#tsk-014): bloquear a invariante do cliente com ordem consistente de locks.
5. [TSK-015](03-backlog-tecnico.md#tsk-015): chave estável da operação, resposta persistida e recuperação após timeout.
6. [TSK-017](03-backlog-tecnico.md#tsk-017): snapshots de comprovantes novos e tratamento explícito de reconstruções legadas.
7. [TSK-032](03-backlog-tecnico.md#tsk-032): procedência de datas/custo e reconciliação de indicadores, sem inventar horários históricos.
8. [TSK-027, conclusão](03-backlog-tecnico.md#tsk-027): consolidar SQL/locks/restore reais, testes de contrato e E2E curto por perfil em CI.

**Dependências:** fase 2 para dados de importação e testes de compatibilidade. Correções online independentes, como TSK-013/016, podem ser entregues antes de concluir toda a importação se a equipe mantiver contratos e validação; não devem aguardar uma refatoração ampla.

**Resultado esperado:** fim das divergências demonstradas de troco/arredondamento, impossibilidade de duplicar uma operação com a mesma chave e recibos novos estáveis ao longo do tempo.

**Critério de conclusão:** R$ 100 entregues R$ 150/troco R$ 50 não gera crédito; soma de itens menos desconto coincide com total; duas operações concorrentes não violam saldo; timeout após commit não duplica venda/recebimento; reimpressão não muda saldo histórico. Fixture representativa deve conciliar caixa, estoque, recebíveis e indicadores.

**Validação e mitigação:** relatório antes/depois para dados existentes; migrações expansivas; compatibilidade de clientes antigos em adaptador explícito; nenhuma correção em massa sem cópia/reconciliação. Aprovar regras de crédito/reembolso e precisão antes de mudar comportamentos legítimos.

## 6. Fase 4 — Fluxos operacionais completos

**Em andamento:** corte da TSK-024 para relatório completo e consistente até 5.000 pagamentos, com recusa explícita acima do teto e proteção contra impressão parcial. [Registro e evidências](14-fase-quatro-primeiro-corte.md). Listas/seletores da TSK-024 e as demais tarefas/dependências da fase continuam pendentes.

**Objetivo:** tornar os resultados corretos acessíveis e compreensíveis em todas as entradas da interface.

- [TSK-024](03-backlog-tecnico.md#tsk-024): navegação dos registros além da primeira página, busca de seletores e relatório completo com totais reconciliados.
- [TSK-030](03-backlog-tecnico.md#tsk-030): identidade de cache por entidade, invalidação de saldos/cadastros e detalhe acessível diretamente.
- [TSK-026](03-backlog-tecnico.md#tsk-026): auditoria de negócio e minimização de dados pessoais em logs.
- [TSK-031](03-backlog-tecnico.md#tsk-031): códigos de erro/validação úteis, incluindo indisponibilidade 503 da impressora.
- [TSK-034](03-backlog-tecnico.md#tsk-034): topologia definida por PDV, agente autenticado, job idempotente e resultado consultável.
- [TSK-036](03-backlog-tecnico.md#tsk-036): foco de modais, nomes de campos, associação de erros e verificação assistiva.

**Dependências:** idempotência e snapshots da fase 3; journal da fase 1; harness da TSK-027. Impressão depende da definição de máquina alvo e conectividade real; não resolver isso abrindo indiscriminadamente o loopback para a rede.

**Resultado esperado:** cadastro 101 selecionável, relatórios completos, ausência de saldo obsoleto após mutação e suporte capaz de identificar a operação sem acessar dados desnecessários.

**Critério de conclusão:** E2E de duas identidades e permissão negada; 1.001 pagamentos no relatório; nomes resolvidos em URL direta; erro recuperável apresentado com request/operation ID; job lento pode ser consultado sem duplicar impressão; fluxo de caixa navegável só por teclado.

**Validação e mitigação:** contratos aditivos/versionados conforme consumidores reais, teste com cache fresco e resposta atrasada, spooler simulado e página sintética em teste operacional controlado. Manter impressão pelo navegador como contingência existente.

## 7. Fase 5 — Redução da dívida estrutural

**Em andamento:** primeiro corte da TSK-028 implementado com regras TypeScript/hooks, zero warnings, baseline medida e provas negativas no CI. [Escopo e evidências](16-fase-cinco-primeiro-corte.md). TSK-029/038 e as pendências das fases anteriores continuam abertas.

**Objetivo:** reduzir custo de manutenção depois de proteger o comportamento.

- [TSK-028](03-backlog-tecnico.md#tsk-028): habilitar regras úteis de lint com baseline e exemplos negativos.
- [TSK-029](03-backlog-tecnico.md#tsk-029): extrair parsing, migração por domínio, reconciliação, orquestração e seções de UI; reduzir duplicação dos CRUDs comprovadamente semelhantes.
- [TSK-038](03-backlog-tecnico.md#tsk-038): checksums de migrações, upgrade/fresh, DDL fora do caminho operacional e privilégio mínimo da aplicação.

**Dependências:** correções críticas e testes de caracterização/integração. TSK-038 não impede usar migrações expansivas corretas nas fases anteriores; fortalece seu executor e a separação operacional.

**Resultado esperado:** regras testáveis sem iniciar infraestrutura, componentes com responsabilidade delimitada e schema verificável entre ambientes.

**Critério de conclusão:** cada extração conserva os resultados das fixtures; não amplia escopo de transações/locks; regra negativa de lint realmente falha; banco novo e upgrade convergem; migração adulterada é recusada antes de servir requisições.

**Validação e mitigação:** uma extração por mudança, adaptadores temporários e comparações de contrato. Não introduzir repositório genérico, framework de CRUD ou serviço separado sem necessidade demonstrada. Corrigir migração publicada com nova migração, nunca por edição retroativa.

## 8. Fase 6 — Desempenho e consolidação

**Em andamento:** harness isolado para linha de base HTTP concorrente da listagem de vendas, com p95/p99, erros, vazão por tempo decorrido e amostras de recursos. [Escopo e evidências](18-fase-seis-primeiro-corte.md). Não conclui TSK-033/037/039 nem libera otimizações de fórmulas pendentes.

**Objetivo:** otimizar gargalos medidos e alinhar a operação ao sistema real.

- [TSK-033, medição/otimização](03-backlog-tecnico.md#tsk-033): carga concorrente, planos de consulta, memória do importador e roundtrips do checkout; decidir batching/cursor/cache somente com resultado comparável.
- [TSK-037](03-backlog-tecnico.md#tsk-037): divisão de bundle por rota e recuperação de chunks em deploy, após baseline em dispositivo de caixa.
- [TSK-039](03-backlog-tecnico.md#tsk-039): concluir revisão de setup, configuração build/runtime, offline, certificados e runbooks. Documentação das fases anteriores deve ser atualizada junto de cada entrega, sem esperar esta fase.

**Dependências:** fórmulas corretas, dados de teste representativos e gates de contrato. Medição histórica do projeto não substitui carga atual da API: `phase4_before_after.sql` calcula throughput como inverso de latência SQL média, sem medir HTTP concorrente.

**Resultado esperado:** budgets documentados de latência/memória/carregamento, otimizações com ganho demonstrado e instruções reproduzíveis por outra pessoa.

**Critério de conclusão:** registrar volume, hardware, concorrência, revisão e configuração em cada benchmark; comparar p95/p99/erro e consumo antes/depois; smoke de setup sem passos/links inexistentes; variáveis configuradas devem chegar ao componente correto. Não declarar capacidade absoluta com base apenas em `1000 / média_ms` de uma consulta.

**Validação e mitigação:** banco descartável — os scripts existentes removem/recriam índices e não devem rodar no ambiente operacional —, flags para consultas novas e manutenção de assets anteriores durante transição de frontend. Preservar caminho de rollback da imagem e orçamento de recursos.

## 9. Regras de release e rollback

Cada incremento deve registrar TEC/TSK atendidos, revisão de código, contrato alterado, migração, verificação e forma de reversão. A ordem mínima de um release relevante é:

1. Validar em ambiente descartável a partir de checkout/lockfile limpos.
2. Ensaio de upgrade e compatibilidade entre versão anterior e schema expandido.
3. Backup e recuperação comprovados, com manifesto/journal independentes do alvo.
4. Entrega pequena; coordenar pausa de escritas somente para operações que a exigem.
5. Smoke de autenticação, PDV, recebimento, saldo e impressão/contingência conforme área afetada.
6. Observar erros, latência, reconciliação financeira, fila e disco; usar os critérios objetivos da tarefa para manter ou reverter.

Rollback de aplicação não implica rollback automático de dados. Alteração financeira ou importação exige relatório dos registros afetados e preservação de novas operações. Retirar coluna, restringir contrato antigo ou eliminar dado legado só acontece depois da janela de compatibilidade e aprovação da regra correspondente.

## 10. Decisões confirmadas e validações remanescentes

As respostas do usuário sobre ambiente, dados sintéticos, bloqueios de crédito/cliente/estoque, cancelamento e margem estão registradas no [contexto confirmado](06-contexto-e-fase-zero.md#1-decisões-confirmadas). A tabela abaixo preserva as evidências que ainda precisam acompanhar as próximas fases.

| Decisão | Tarefas relacionadas | Evidência necessária |
|---|---|---|
| DBFs sintéticos e credenciais somente de desenvolvimento — confirmados | TSK-001 | Controles executados na fase zero; credenciais distintas para qualquer ambiente futuro. |
| RPO/RTO, destino externo, privilégio e janela de manutenção | TSK-002/003/009 | Ensaio de recuperação e requisito operacional aprovado. |
| Limite de overwrite e identidade de duplicatas legítimas | TSK-004/018/019 | Amostra sintética fiel, relatório de impacto e regra documentada. |
| Precisão/quitação e desenho contábil/autorização de crédito/reembolso | TSK-012–017/035 | Exemplos de negócio aprovados e fixtures de regressão. |
| Tratamento de estoque histórico sem vínculo sale_id | TSK-004/018/032 | Reconciliação por origem/data; não presumir necessidade de backfill universal. |
| Datas/fonte de custo e filtros; exclusão de custo ausente já confirmada | TSK-032/033 | Fórmulas aprovadas e comparação com fontes contábeis autorizadas. |
| Máquina alvo por caixa e estado do spooler | TSK-034 | Topologia de rede e ensaio operacional controlado. |
| Capacidade da equipe e SLOs | Todas; especialmente TSK-033/037 | Baseline de execução e calibração dos pontos, antes de marcar datas. |

O plano permite iniciar pelas contenções comprovadas enquanto essas decisões são esclarecidas. Não se deve inventar política de crédito, proibição de estoque negativo, migração para microsserviços ou suporte offline como parte implícita da correção.
