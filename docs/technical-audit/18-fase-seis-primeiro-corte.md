# Fase 6 — Primeiro corte: linha de base HTTP concorrente

Data: **22/10/2026**. Tarefa: **TSK-033 / TEC-033, corte de medição**. A fase 6 está em andamento. Este incremento cria uma medição atual reproduzível da listagem de vendas; não conclui TSK-033, TSK-037, TSK-039 ou as pendências das fases anteriores.

## 1. Escopo e dependências

O roadmap condiciona otimizações à correção das fórmulas, representatividade dos dados e gates de contrato. A TSK-032 e os cenários completos da TSK-027 continuam pendentes. Por isso este corte mede somente leitura de páginas com uma fixture determinística e verifica o conteúdo esperado. Não usa resultados financeiros do dashboard para certificar correção, não altera consultas e não modifica as regras de checkout, crédito, cancelamento ou estoque.

O benchmark SQL histórico foi revisado: `1000 / média_ms` é o inverso de uma latência SQL, não vazão HTTP concorrente. Foram preservados seus números com a interpretação corrigida, removidos os atalhos absolutos para outro diretório e substituída a reprodução baseada no Compose da aplicação pelo guia atual. Seus scripts destrutivos não foram executados.

## 2. Entrega implementada

| Componente | Entrega |
|---|---|
| `infra/benchmark-disposable.mjs` | Orquestra build da API, PostgreSQL/Redis descartáveis, seed, login, aquecimento, carga concorrente, amostragem de recursos, evidência e limpeza. Recusa argumentos de alvo/projeto e saída existente. |
| `infra/docker-compose.benchmark.yml` | Overlay exclusivo com limites de CPU/memória e pool/timeouts explícitos; restore/overwrite desabilitados. |
| `infra/performance/seed.sql` | 120.000 vendas, 360.000 itens e 30 produtos; UUIDs/datas/valores determinísticos. Recusa outro banco/usuário ou core já preenchido. |
| `infra/performance/measurement.mjs` | Modelo fechado, contagem por tempo decorrido, percentis empíricos, categorias de erro e validação da resposta/isolamento. |
| `infra/performance/measurement.test.mjs` | Sete testes de estatísticas, concorrência, erros, deadline, CLI, conteúdo e isolamento; etapa obrigatória adicionada ao CI sem gerar carga em runners compartilhados. |
| Evidências e guia | [Reprodução/interpretação](../performance/phase6-http-benchmark.md), [consolidado das rodadas](../performance/phase6-http-baseline.json), amostras integrais comprimidas e [registro verificável deste corte](19-evidencias-fase-seis.json). |

O projeto fixo `pos-phase6-bench` tem lock exclusivo no diretório temporário. O PostgreSQL utiliza `tmpfs` e credenciais sintéticas; as portas são dinâmicas em `127.0.0.1`. O harness confirma labels, armazenamento e bindings antes de semear. Somente containers, rede e volumes desse projeto são removidos no encerramento. Não foram aplicadas migrações ao banco do usuário; as migrações de startup ocorreram apenas no banco descartável.

O relatório inclui revisão Git e indicação de árvore suja, fingerprint de fonte/harness conferido após build e medição, imagem, volume, hardware, memória, limites/configuração, tempo real, p50/p95/p99, erros e amostras temporais de recursos. Não grava cookie, credenciais, corpos de resposta ou variáveis de ambiente. Falha de estágio, de amostragem ou de limpeza impede um relatório válido.

## 3. Validação e resultados

Duas rodadas finais, com 1.000 requisições medidas por estágio e 20 de aquecimento separado: **12.000 requisições medidas + 240 de warmup; zero falhas HTTP, transporte, timeout, JSON ou conteúdo**. Ambas encerraram com `status=complete` e `cleanup=complete`.

| Página | Concorrência | p95 A/B (ms) | p99 A/B (ms) | Vazão de sucesso A/B (req/s) | Erros |
|---|---:|---:|---:|---:|---:|
| 1 | 1 | 7.59 / 7.88 | 8.49 / 8.77 | 156.40 / 148.53 | 0 |
| 1 | 4 | 11.53 / 12.55 | 12.89 / 15.00 | 470.70 / 439.72 | 0 |
| 1 | 10 | 23.77 / 27.20 | 26.85 / 30.36 | 534.43 / 477.54 | 0 |
| 1.200 | 1 | 41.91 / 44.68 | 43.74 / 47.13 | 25.47 / 24.07 | 0 |
| 1.200 | 4 | 97.86 / 99.28 | 103.56 / 103.49 | 48.77 / 46.87 | 0 |
| 1.200 | 10 | 300.43 / 300.05 | 308.17 / 309.62 | 40.96 / 41.14 | 0 |

Ambiente: Windows x64, Intel i9-13900HX, 32 CPUs lógicas, cerca de 31,70 GiB de RAM no host; Docker Desktop 29.8.0, 32 CPUs e cerca de 15,46 GiB disponíveis ao engine. API limitada a 2 CPUs/1 GiB; PostgreSQL a 2 CPUs/2 GiB; Redis a 0,25 CPU/128 MiB. Node 24.21.0. Imagens, configuração, fingerprints e amostras de recursos constam do consolidado.

A última página apresentou latência maior nas duas rodadas. Isso é um sinal para investigação da paginação profunda, não prova do plano de execução responsável nem certificação de capacidade. A vazão observada usa o total de respostas válidas dividido pelo tempo real do estágio; inclui o trabalho do gerador e as restrições do ambiente local.

As rodadas finais usam a mesma implementação, fixture, imagem, configuração e fingerprint. Não são um antes/depois de otimização. O cache está aquecido; uma sessão autenticada envia requisições sem tempo de usuário. A latência inclui rede loopback Docker, leitura, parse e validação do JSON no gerador. Cada estágio tem 1.000 amostras; as caudas, o ruído do host e o modelo fechado limitam qualquer extrapolação. Não há teste de duração prolongada, fila aberta de chegadas ou validação no dispositivo/rede de caixa.

Sete controles automatizados passaram. A CLI real também recusou um alvo arbitrário e uma instância concorrente, preservando o lock e sem criar saída ou iniciar build nesses dois casos. A primeira tentativa do harness parou antes do seed por uma checagem incorreta do campo `tmpfs` do Docker; o guard foi corrigido para `HostConfig.Tmpfs`/`Mounts` e coberto por teste. Uma rodada exploratória posterior passou; depois foram fixados UUIDs e preservadas as amostras de warmup, antes das duas rodadas finais. Os resultados exploratórios não são misturados à linha de base final.

A composição foi validada, a imagem atual da API foi construída com seu Dockerfile/lockfile (camadas em cache), e login, migrações e consultas reais foram exercitados nas rodadas. A suíte de produto das fases anteriores não foi reexecutada neste corte, pois backend, frontend, agente, dependências e contratos de produto não foram alterados. Os testes do novo medidor, guard de segredos, artefatos e limpeza foram verificados localmente; a nova etapa do GitHub Actions foi inspecionada, sem execução remota. A verificação de whitespace dos arquivos deste corte não apresentou diagnósticos. O check global da árvore sinalizou uma linha vazia final em `backend/sql/init.sql` já presente no snapshot inicial; o arquivo foi preservado byte a byte.

## 4. Pendências e próxima decisão

| Tarefa | Estado após o corte |
|---|---|
| TSK-033 | Limites/timeouts da fase 0 preservados; linha de base HTTP da listagem entregue. Restam dashboard, EXPLAIN ANALYZE das consultas reais, memória/cancelamento do importador, roundtrips e checkout com muitos itens, duração/sessões representativas e comparação de otimizações que preservem resultados. |
| TSK-037 | Pendente: medir carregamento no dispositivo/rede de caixa, decidir divisão de rotas e validar recuperação de chunks antigos. |
| TSK-039 | Corrigido o alcance do benchmark histórico e documentado o novo harness. Revisão completa de setup, variáveis build/runtime, certificados, offline e runbooks permanece pendente. |
| TSK-027 / TSK-032 | Gates E2E/contrato e fórmulas/custo histórico ainda necessários para certificar o conjunto dos cenários de desempenho. |
| Demais fases | Journal/cutover, publicação/idempotência de importação, crédito/inatividade, estoque não negativo, liquidação/estornos, KPIs, paginação funcional, cache/auditoria, impressão, acessibilidade, extrações e migrações mantêm os estados anteriores. |

A diferença medida entre primeira e última página justifica capturar o plano real e avaliar uma alternativa de paginação em um corte posterior, com contrato e navegação preservados. Nenhum índice, cursor, cache, batching, query ou bundle foi alterado agora. SLOs e capacidade dependem de critérios de negócio e ambiente representativo.

## 5. Revisão e reversão

Não houve deploy, commit ou push. O incremento adiciona ferramentas de teste e documentação, além de uma etapa de controle no CI. Para revertê-lo, retirar os arquivos novos e a etapa de controle, restaurar somente os trechos documentais deste corte e preservar as evidências. Não há migração ou rollback de dados da aplicação associado a esta entrega. O relatório de encerramento e a inspeção final registram a limpeza do projeto descartável.
