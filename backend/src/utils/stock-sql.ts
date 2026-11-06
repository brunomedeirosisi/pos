// Shared by catalog reads and the critical-stock dashboard. The movement alias is sm.
export const stockQuantitySql = `case
  when sm.type is null then 0
  when lower(trim(sm.type)) in ('e', 'entrada', 'in', 'credit', 'compra') then abs(coalesce(sm.quantity, 0))
  when lower(trim(sm.type)) in ('s', 'saida', 'out', 'debit', 'venda') then -abs(coalesce(sm.quantity, 0))
  else coalesce(sm.quantity, 0)
end`;

// Correlated by product ID so paginated catalog reads use the existing movement index.
export const productCurrentStockSql = `(coalesce((select ls.adjustment
  from product_legacy_stock ls where ls.product_id = product.id), 0)
  + (select coalesce(sum(${stockQuantitySql}), 0)
  from stock_movement sm where sm.product_id = product.id))`;
