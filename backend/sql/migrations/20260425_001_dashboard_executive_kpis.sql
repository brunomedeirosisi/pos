alter table product add column if not exists cost_price numeric(14,2);
alter table product add column if not exists average_cost numeric(14,2);

alter table sale add column if not exists paid_at timestamptz;
alter table sale add column if not exists refund_amount numeric(14,2) not null default 0;
alter table sale add column if not exists store_id text not null default 'main';
alter table sale add column if not exists channel text not null default 'pos';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'sale'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%channel%'
  ) then
    alter table sale
      add constraint sale_channel_check check (channel in ('pos','ecommerce','whatsapp','marketplace'));
  end if;
end
$$;

create index if not exists idx_sale_store_paid_status on sale(store_id, emission_date desc, status);
create index if not exists idx_sale_channel_paid on sale(channel, emission_date desc);

create table if not exists stock_movement (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references product(id) on delete cascade,
  date date not null default now(),
  type text not null,
  quantity numeric(14,3) not null,
  unit_value numeric(14,2),
  total numeric(14,2),
  note_number text
);

create index if not exists idx_stock_movement_product on stock_movement(product_id);
create index if not exists idx_stock_movement_product_date on stock_movement(product_id, date desc);
