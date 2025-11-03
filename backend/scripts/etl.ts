// Placeholder for ETL pipeline (CSV staging -> core tables).
// Suggested steps:
// 1) Load CSVs exported from DBF into `stg_*` tables.
// 2) Insert/Upsert into core: product_group, product, customer, seller, payment_term.
// 3) Normalize VENDAS/PEDIDOS (expand 1..7 slots into sale_item rows).
// 4) Reconciliation reports (totals per day).

console.log('ETL skeleton – implement staging loaders and transformations here.');
