# Benchmark SQL histórico — anterior ao roadmap da auditoria

**Revisão em 22/10/2026:** este documento preserva resultados históricos de microbenchmark SQL. A coluna calculada por `1000 / média_ms` não mede requisições HTTP concorrentes. As metas HTTP e a capacidade operacional não foram demonstradas por esses números. A expressão “Fase 4” original antecede o roadmap da auditoria e não representa a entrega da fase 4 atual. Consulte o [harness HTTP da fase 6](phase6-http-benchmark.md) para medições novas.

**Correção do seed em 22/10/2026:** o seed histórico passou a reconciliar cabeçalhos e itens (R$ 30 por venda), registrar crédito explícito de cliente e limitar os recebimentos sintéticos ao saldo devedor. Também recusa banco/usuário fora do harness descartável. Os números históricos abaixo foram obtidos com a fixture anterior e não constituem comparação com a corrigida. [Validação dos dois seeds](../testing-docker.md).

## Escopo
- Plano de consultas reais em `sale` e tabelas de alto volume.
- Índices para filtros/ordenação de listagens críticas.
- Remoção de consultas/aggregations redundantes.
- Paginação e limite consistente em endpoints de listagem.
- Importação em lote no legado (batch insert).

## Metas (DoD)
- `sales list`:
  - p95 <= 20 ms
  - throughput >= 200 req/s
- `customer totals`:
  - p95 <= 120 ms
  - throughput >= 12 req/s
- `import 10k`:
  - batch >= 3x mais rápido que linha a linha

## Ambiente de benchmark
- Data set sintético de alto volume:
  - `sale`: 120.000
  - `sale_item`: 360.000
  - `customer_payment`: 180.000
- Banco isolado via docker compose (projeto `posphase4`).
- Scripts usados:
  - [phase4_seed.sql](../../backend/sql/benchmarks/phase4_seed.sql)
  - [phase4_before_after.sql](../../backend/sql/benchmarks/phase4_before_after.sql)

## Resultado antes/depois

| Cenário | avg (ms) | p95 (ms) | 1000 / média_ms (inverso da latência SQL) |
|---|---:|---:|---:|
| sales_list_legacy_no_index | 2038.847 | 3247.554 | 0.49 |
| sales_list_optimized_with_index | 2.505 | 4.336 | 399.24 |
| customer_totals_dual_query | 77.842 | 114.155 | 12.85 |
| customer_totals_single_query | 77.209 | 110.601 | 12.95 |
| import_row_by_row_10k | 69.220 | 69.220 | 14.45 |
| import_batch_500_10k | 15.910 | 15.910 | 62.85 |

## Ganhos consolidados
- `sales list`: p95 caiu de 3247.554 ms para 4.336 ms (~749x melhor), inverso da latência média SQL de 0.49 para 399.24 s⁻¹.
- `customer totals`: p95 caiu de 114.155 ms para 110.601 ms, inverso da latência média SQL de 12.85 para 12.95 s⁻¹.
- `import 10k`: batch 500 foi ~4.35x mais rápido que linha a linha.

## Limites da conclusão histórica

Os números acima descrevem SQL executado em loops, com índices removidos/recriados e uma comparação simplificada de inserts. Não validam as metas de vazão HTTP, a API atual, a memória do importador real ou o desempenho do caixa. As medições de importação têm uma amostra por estratégia. Nenhuma meta atual é marcada como atendida com base neste registro.

## Consultas reais e racional de índice
- `GET /sales`:
  - padrão: ordenação por `emission_date desc, id desc`, filtros por `seller_id`, `customer_id`, `status`, `payment_term_id`.
  - índice: `idx_sale_emission_id`, `idx_sale_seller_emission`, `idx_sale_customer_status_emission`, `idx_sale_status_emission`, `idx_sale_payment_term_emission`.
- `GET /sales` com itens:
  - join por `sale_item.sale_id`.
  - índice: `idx_sale_item_sale`.
- filtros textuais de catálogos:
  - índices trigram (`pg_trgm`) em campos buscados por `%search%` para `product`, `customer`, `seller`, `payment_term`, `app_user`.
- `GET /customers/:id/payments`:
  - agregações e ordenação por `customer_id`, `payment_date`, `created_at`.
  - índice: `idx_customer_payment_customer_date`, `idx_customer_payment_method`.

## Evidência de plano de execução
- `GET /sales` otimizado:
  - `Index Scan using idx_sale_emission_id on sale`
  - `Index Scan using idx_sale_item_sale on sale_item`
  - `Execution Time: 13.472 ms` (EXPLAIN ANALYZE com 100 vendas paginadas)
- `customer totals` consolidado:
  - redução de roundtrip da aplicação (duas consultas -> uma consulta).
  - `Execution Time: 69.530 ms` no cenário sintético com alta concentração de dados no mesmo `customer_id`.

## Reprodução atual

Use o [guia do benchmark HTTP descartável](phase6-http-benchmark.md). O harness novo não executa os scripts históricos acima. O SQL histórico remove/recria índices e seu seed remove linhas; os comandos antigos que reutilizavam o Compose da aplicação foram retirados para evitar confusão com o ambiente de desenvolvimento.
