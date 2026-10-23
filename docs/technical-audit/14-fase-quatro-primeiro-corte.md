# Fase 4 — Primeiro corte: histórico completo de pagamentos

Data: **22/10/2026**. Tarefa: **TSK-024 / TEC-024, corte de relatório**. A fase 4 está em andamento. Seletores/listas, cache, auditoria, erros gerais, protocolo de impressão e acessibilidade permanecem nos cortes seguintes.

## 1. Dependências e escopo

A TSK-024 permite implementação independente em ambiente isolado. As dependências gerais da fase 4 — idempotência/snapshots da fase 3 e journal da fase 1 — continuam abertas para os fluxos que as exigem. Este incremento não declara essas fases concluídas nem habilita restore/overwrite.

O relatório de histórico retornava por padrão até 1.000 linhas, mas seus totais e contagem consideravam toda a seleção. Para 1.001 pagamentos, a impressão podia omitir um recebimento sem indicar o corte. O endpoint de relatório agora entrega uma seleção completa e limitada, com comprovação de quantidade e soma antes de responder e antes de oferecer impressão.

## 2. Comportamento implementado

- `GET /api/v1/customers/{id}/payments/report` retorna todos os pagamentos selecionados até **5.000 linhas**, conservando o teto já previsto no código. Acima disso retorna **413**, `payment_report_limit_exceeded`, com `details.limit`/`details.count` e orientação para reduzir período ou filtrar forma de pagamento. Não retorna um corpo parcial de relatório.
- Parâmetros legados `page`/`page_size` continuam aceitos conforme sua validação existente, mas não recortam o relatório. A listagem `GET .../payments` mantém paginação e metadados existentes; clientes que precisam de uma página usam essa listagem.
- Identificação do cliente, totais globais e linhas filtradas são lidos em uma única transação **REPEATABLE READ, READ ONLY**. O relatório não conserva um lock de linha do cliente. Recebimentos concorrentes podem ser gravados; o relatório representa o mesmo snapshot em todas as consultas.
- `coverage: { complete: true, row_count, row_limit: 5000 }` é metadado aditivo. O servidor verifica contagem, IDs únicos, valores positivos/finitos e soma exata dos centavos contra o total filtrado. Se não puder reconciliar a seleção, retorna **422**, `payment_report_inconsistent`.
- A comparação de valores usa a representação decimal dos números JSON, com soma em `BigInt`. Um agregado cujo último centavo não sobreviva ao contrato numérico existente é recusado em vez de imprimir um total arredondado incorreto. Uma futura exportação de agregados maiores pode precisar de montantes decimais em string e contrato próprio.
- As datas dos filtros passam ao PostgreSQL como `YYYY-MM-DD`, evitando que o bind de um objeto `Date` no fuso local transforme a data no dia anterior. A correção vale para listagem e relatório. A regressão força `America/Sao_Paulo` mesmo quando o host de CI estiver em UTC.
- Ordenação conserva `payment_date, created_at, id` em ambos os sentidos. Não foram retirados os limites gerais do banco ou da paginação.

A tela confere novamente contagem, unicidade e soma antes de renderizar a tabela e o botão Imprimir. Uma resposta antiga sem `coverage` é aceita se as linhas e totais forem completos; uma resposta truncada é bloqueada. A seleção completa é identificada na tela e as mensagens de limite/inconsistência têm tradução em português e inglês. A impressão tem CSS para cabeçalho de tabela repetido, linhas sem quebra interna e área de tabela sem recorte de overflow.

## 3. Validação

**259 testes aprovados:** 138 de backend, 67 de frontend, 51 de integração PostgreSQL/Redis e 3 regressões normais. Continua uma falha esperada da TSK-016, anterior a este corte.

Treze casos novos de integração cobrem:

- 0, 100, 101, 200, 1.001 e 5.000 pagamentos completos; 5.001 recebe 413, sem tabela parcial.
- Paginação da listagem, última página vazia e parâmetros de página incapazes de truncar o relatório.
- Filtros por data/forma, datas no fuso de São Paulo, desempate por ID, ordenação descendente e clientes com nomes iguais.
- Inserção concorrente após a leitura do resumo: o banco passa a ter 1.002 pagamentos, enquanto o relatório e seus totais conservam os 1.001 do snapshot.
- Resultado inconsistente injetado e agregado que perderia centavo no contrato JSON: recusa 422.
- Permissão negada, cliente inexistente e intervalo inválido.

Quatorze casos novos no frontend verificam o componente renderizado com QueryClient e rota reais: todas as 1.001 linhas aparecem; resposta truncada não renderiza tabela ou ação de impressão. Também cobrem totais divergentes, IDs repetidos, valores inválidos, metadado incompatível, resposta vazia/antiga e mensagens em dois idiomas. É renderização estática de React, sem E2E de navegador ou diálogo real de impressão.

**Contraprova:** o teste de 1.001 linhas foi executado contra o caso de uso anterior, em projeto descartável separado. Recebeu 1.000 linhas e falhou. A fonte corrigida foi restaurada em `finally`, e o projeto `pos-phase4-regression-proof` foi removido.

Lint e TypeScript passaram no backend/frontend. O harness `node infra/test-disposable.mjs --images --backups` construiu ambas as imagens e aprovou smoke HTTP/SPA, backup, simulação em alvo separado e persistência após recriar a API. Fixtures sintéticas e recursos de teste foram removidos; nenhum banco do usuário foi alterado. A política de precisão e o isolamento de importação das entregas anteriores foram preservados. [Evidências e hashes](15-evidencias-fase-quatro.json).

## 4. Limitações e próximos cortes

| Área | Estado |
|---|---|
| TSK-024 — relatório | Corte implementado e validado. Exportação assíncrona/streaming acima de 5.000 linhas não foi criada; o operador deve reduzir filtros. Layout físico em impressora/paginação visual ainda requer verificação operacional. |
| TSK-024 — listas/seletores | Pendente: navegar/buscar registros além da primeira página em clientes, vendedores, condições e demais cadastros do PDV. Não foi marcado como resolvido o critério de cadastro 101 selecionável. |
| TSK-030 | Pendente: chaves/invalidações de cache e referências carregadas diretamente no detalhe. |
| TSK-026/031 | Pendentes: auditoria transacional, minimização de logs e tratamento geral dos erros/validação. Os erros específicos do relatório não concluem essas tarefas. |
| TSK-034 | Pendente: topologia por PDV validada com infraestrutura/operadores, autenticação e idempotência do job. Nenhuma porta foi aberta; o agente continua em loopback. |
| TSK-036/027 | Pendentes: teclado/foco/nomes/erros acessíveis e E2E completo. Este corte não é auditoria de acessibilidade ou ensaio de impressora. |
| Fases 1/2/3 | Pendências mantidas, incluindo recuperação/cutover, publicação/identidade/durabilidade de importação, quitação, troco líquido nos agregados, crédito/cliente inativo, estoque negativo, snapshots, cancelamento e KPIs. |

As fórmulas globais de dívida/pagamentos/saldo não foram alteradas aqui. A TSK-012 ainda precisa corrigir o uso de valor entregue com troco nesses agregados. “Seleção completa” significa que todas as linhas do filtro estão presentes e conciliadas com seu total; não significa que toda a contabilidade do sistema esteja concluída.

## 5. Compatibilidade e reversão

Não há DDL ou dependência npm nova. Campos antigos da resposta permanecem; `coverage` é adicional. Um frontend novo bloqueia truncamento de um backend antigo; um frontend antigo recebe a seleção completa de um backend novo. Consumidores que usavam o endpoint de relatório como página devem usar o endpoint de listagem. Documentação do contrato: [OpenAPI](../../backend/openapi/openapi.yaml) e [pagamentos](../payments.md).

Reverter a aplicação anterior reintroduz o truncamento em 1.000 linhas e o problema de bind de datas. Preservar a versão de frontend que verifica completude ou restringir operacionalmente os relatórios durante uma reversão. Não houve migração, correção histórica, commit, push ou deploy. Restore/overwrite seguem desabilitados por padrão.
