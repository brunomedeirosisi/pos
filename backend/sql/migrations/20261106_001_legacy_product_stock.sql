-- Before this migration only the legacy importer wrote movements without sale_id.
-- New movements default to operational, including future manual adjustments.
alter table stock_movement add column if not exists origin text not null default 'operational';
update stock_movement set origin='legacy' where sale_id is null;
alter table stock_movement add constraint stock_movement_origin_check check (origin in ('operational','legacy'));

alter table stg_produto add column if not exists esto_prod text;

create table if not exists product_legacy_stock (
  product_id uuid primary key references product(id) on delete cascade,
  import_id uuid not null references system_legacy_import(id),
  source_quantity numeric(14,3) not null,
  reconstructed_quantity numeric not null,
  adjustment numeric not null,
  source_sha256 text not null check (source_sha256 ~ '^[a-f0-9]{64}$'),
  reconciled_at timestamptz not null default now(),
  check (source_quantity = reconstructed_quantity + adjustment)
);
