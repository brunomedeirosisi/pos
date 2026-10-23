# Benchmark HTTP concorrente — fase 6

Este harness mede a listagem autenticada de vendas da API atual. Usa dados sintéticos determinísticos, PostgreSQL/Redis e imagem da API em um projeto Docker exclusivo. É uma linha de base de engenharia; as fórmulas financeiras, o checkout, o dashboard, a importação e a capacidade de produção exigem validações próprias.

**Follow-up de 22/10/2026:** o [ensaio Docker e correção do checkout](../technical-audit/20-validacao-docker-e-correcoes.md) alterou o código/seed histórico após a captura desta linha de base. Os relatórios preservam o fingerprint da versão medida; a vazão HTTP não foi reexecutada nem certificada para o código posterior.

## Executar

Pré-requisitos: Node 24.21.0, Docker com Compose e acesso às imagens já declaradas nos Dockerfiles/Compose. A CLI de npm local não é necessária: o Dockerfile instala as dependências pelo lockfile. Execute na raiz do repositório:

```powershell
node --test infra/performance/measurement.test.mjs
node infra/benchmark-disposable.mjs
```

A segunda chamada cria um JSON novo em `tmp/phase6-http-<timestamp>.json`. Para escolher o arquivo e a carga:

```powershell
node infra/benchmark-disposable.mjs --requests 1000 --warmup 20 --concurrency 1,4,10 --output tmp/meu-benchmark-novo.json
```

O arquivo de saída deve ser novo. `--help` lista os parâmetros. `--requests` aceita 100–5.000 por estágio; `--warmup`, 1–100; `--concurrency`, até seis valores distintos entre 1 e 20. O padrão contém seis estágios: duas páginas × três concorrências, 1.000 requisições medidas e 20 de aquecimento por estágio. O deadline global da janela de medição é dez minutos; cada requisição tem timeout de cinco segundos e nenhuma repetição automática. Não há argumento para URL, credenciais, banco ou nome de projeto.

Não execute outros testes de carga simultaneamente nesta máquina. Para comparar mudanças, mantenha volume, concorrência, configuração e hardware iguais; preserve os JSONs, repita as rodadas e confira os fingerprints/imagens. Os resultados desta entrega são repetições da mesma implementação, sem comparação antes/depois de otimização.

## Isolamento e encerramento

O comando usa apenas `pos-phase6-bench` com `infra/docker-compose.test.yml` e o overlay `infra/docker-compose.benchmark.yml`. O banco `pos_phase0_test`/usuário `pos_test` fica em `tmpfs`, com portas dinâmicas restritas a `127.0.0.1`. O seed recusa outro banco/usuário e tabelas principais já preenchidas. O harness verifica labels do projeto, armazenamento temporário e bindings antes de semear. Não execute `seed.sql` manualmente.

A API recebe limite de 2 CPUs/1 GiB, PostgreSQL de 2 CPUs/2 GiB e Redis de 0,25 CPU/128 MiB. São tetos de consumo, não núcleos dedicados. O pool e os timeouts são explícitos. Restore e overwrite continuam desabilitados. O Compose da aplicação e seus dados não são selecionados. O harness não usa os scripts históricos que removem/recriam índices.

Um lock exclusivo no diretório temporário do sistema impede duas instâncias deste harness. Um arquivo de saída existente também causa recusa. Em falhas normais ou SIGINT/SIGTERM tratados pelo Node, o bloco de encerramento remove containers, rede e volumes somente desse projeto e registra `cleanup` no relatório. Se Docker ou o processo forem encerrados à força, verifique o PID registrado em `pos-phase6-bench.lock`, os containers desse projeto e a ausência de execução ativa antes de remover um lock residual e repetir. Encerramento forçado não permite garantir limpeza automática.

## Dados e cenários

O seed fixa UUIDs, datas e valores: 120.000 vendas concluídas à vista, 360.000 itens e 30 produtos. Cada venda tem três itens de R$ 10, total/subtotal/pagamento de R$ 30 e troco/desconto zero. Não há cliente, recebimento separado ou movimento de estoque; a fixture existe somente para ler páginas e não representa um livro de estoque reconciliado.

| Cenário | Requisição | Linhas esperadas |
|---|---|---:|
| Primeira página | `GET /api/v1/sales?page=1&page_size=100` | 100 vendas, três itens cada |
| Última página | `GET /api/v1/sales?page=1200&page_size=100` | 100 vendas, três itens cada |

A autenticação acontece antes da janela medida, com o administrador sintético. Cada resposta deve ter HTTP 200, JSON válido, cem IDs distintos e conteúdo compatível com a fixture. Respostas vazias, duplicadas, inconsistentes, erros HTTP, transporte e timeout entram como falha. Uma etapa com falhas ou deadline interrompe a execução e deixa o relatório incompleto. O cookie, as credenciais, os corpos e o ambiente do subprocesso não são gravados no JSON.

## Como interpretar o JSON

- `status=complete` e `cleanup=complete` são necessários para uma rodada válida. Uma saída não zero indica erro. Isso certifica a execução do harness, não os requisitos financeiros do produto.
- `source` registra HEAD, árvore suja e fingerprint de caminhos/conteúdos do backend e do harness. O mesmo fingerprint é verificado após build e após medição. O relatório inclui IDs das imagens, Node, CPU, memória do host/Docker, limites de containers e configurações de banco/API.
- `stages` separa caminho, concorrência, tempo de início/fim, duração medida, erros por categoria e latências brutas de todas as conclusões. `warmups` mantém amostras separadas, excluídas das estatísticas medidas.
- p50/p95/p99 usam rank empírico `ceil(q × n)`. Há distribuições de todas as conclusões e apenas dos sucessos. A vazão de conclusões é `requests × 1000 / elapsedMs`; a de sucesso usa somente sucessos no numerador e o mesmo tempo total. Nunca se usa o inverso da latência média como vazão.
- A latência vai de `fetch` até leitura completa, decodificação JSON e validação da fixture. Inclui transporte loopback Docker e trabalho do gerador. Não é tempo SQL isolado nem experiência do dispositivo de caixa.
- `resources.samples` contém observações temporais de CPU, memória, PIDs e I/O via `docker stats`. São amostras do período medido, incluindo warmup; não medem pico absoluto, memória do importador, CPU por requisição ou reserva de capacidade. Não confunda limite com uso observado.

É um modelo fechado, sem tempo de usuário, uma sessão e cache aquecido. O gerador aguarda respostas antes de enviar novas requisições; não mede fila de chegadas externas e não aplica correção de coordinated omission. Ordem fixa, estágios curtos, ruído do host e poucos pontos de cauda limitam as conclusões. Repita com distribuição de dados, sessões, duração, máquina de caixa e rede representativas antes de definir SLOs ou capacidade.

## Evidência desta entrega

Os resultados consolidados estão em [phase6-http-baseline.json](phase6-http-baseline.json). Os relatórios integrais das rodadas finais são preservados em `phase6-http-baseline.raw.json.gz`, com hashes no consolidado. Para extrair um JSON legível sem ferramentas adicionais:

```powershell
node --input-type=module -e "import { readFileSync, writeFileSync } from 'node:fs'; import { gunzipSync } from 'node:zlib'; writeFileSync('tmp/phase6-baseline-extracted.json', gunzipSync(readFileSync('docs/performance/phase6-http-baseline.raw.json.gz')), { flag: 'wx' });"
```

O arquivo extraído contém um array de relatórios; o destino deve ser novo e a pasta `tmp` deve existir. O [registro da fase 6](../technical-audit/18-fase-seis-primeiro-corte.md) distingue o que foi medido do que permanece pendente. O [benchmark SQL antigo](phase4-benchmark.md) foi corrigido para não atribuir capacidade HTTP ao inverso da latência SQL.
