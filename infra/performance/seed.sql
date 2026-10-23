-- Called ONLY through benchmark-disposable.mjs in its fixed tmpfs test database.
\set ON_ERROR_STOP on
do $$
begin
  if current_database() <> 'pos_phase0_test' or current_user <> 'pos_test' then
    raise exception 'Synthetic benchmark database required';
  end if;
  if exists (select 1 from sale) or exists (select 1 from product) then
    raise exception 'Benchmark requires fresh empty core tables';
  end if;
end $$;
begin;
insert into product (id, legacy_code, name, price_cash, price_base, cost_price)
select md5('phase6-product-' || g)::uuid, 'PHASE6-P-' || g, 'Synthetic benchmark product ' || g, 10, 10, 6
from generate_series(1, 30) g;

insert into sale (id, emission_date, paid_at, order_number, payment_method, amount_paid, change_amount, subtotal, discount, total, source, source_key)
select md5('phase6-sale-' || g)::uuid, date '2026-01-01' + (g % 300), timestamptz '2026-01-01 12:00:00+00' + (g % 300) * interval '1 day',
  'PHASE6-' || g, 'cash', 30, 0, 30, 0, 30, 'PHASE6_BENCH', g::text
from generate_series(1, 120000) g;

insert into sale_item (id, sale_id, product_id, quantity, unit_price, total)
select md5(s.id::text || ':' || item)::uuid, s.id, p.id, 1, 10, 10
from sale s cross join generate_series(1, 3) item
join product p on p.legacy_code = 'PHASE6-P-' || ((s.source_key::integer + item) % 30 + 1);
commit;
analyze sale;
analyze sale_item;
analyze product;
select json_build_object('sales', (select count(*) from sale), 'saleItems', (select count(*) from sale_item), 'products', (select count(*) from product));
