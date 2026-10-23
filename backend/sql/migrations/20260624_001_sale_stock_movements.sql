alter table if exists stock_movement
  add column if not exists sale_id uuid references sale(id) on delete set null;

create index if not exists idx_stock_movement_sale on stock_movement(sale_id);
create index if not exists idx_stock_movement_sale_product_type on stock_movement(sale_id, product_id, type);
