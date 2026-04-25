-- Phase 4 benchmark seed dataset
-- WARNING: run this only in an isolated benchmark database.

\set ON_ERROR_STOP on

begin;

insert into product_group (legacy_code, name)
values ('BENCH_GRP', 'Benchmark Group')
on conflict (legacy_code) do update set name = excluded.name;

insert into product (legacy_code, name, group_id, price_cash, price_base)
select 'BENCH_PROD', 'Benchmark Product', pg.id, 10, 10
from product_group pg
where pg.legacy_code = 'BENCH_GRP'
on conflict (legacy_code) do update set
  name = excluded.name,
  group_id = excluded.group_id,
  price_cash = excluded.price_cash,
  price_base = excluded.price_base;

insert into customer (legacy_code, name, status)
values ('BENCH_CUST', 'Benchmark Customer', 'active')
on conflict (legacy_code) do update set
  name = excluded.name,
  status = excluded.status;

insert into seller (legacy_code, name)
values ('BENCH_SEL', 'Benchmark Seller')
on conflict (legacy_code) do update set name = excluded.name;

insert into payment_term (legacy_code, name)
values ('BENCH_TERM', 'Benchmark Term')
on conflict (legacy_code) do update set name = excluded.name;

with bench_sales as (
  select id from sale where source = 'BENCH'
)
delete from sale_item si
using bench_sales bs
where si.sale_id = bs.id;

delete from sale where source = 'BENCH';
delete from customer_payment where reference like 'BENCH-%';

with refs as (
  select
    (select id from seller where legacy_code = 'BENCH_SEL') as seller_id,
    (select id from customer where legacy_code = 'BENCH_CUST') as customer_id,
    (select id from payment_term where legacy_code = 'BENCH_TERM') as payment_term_id
)
insert into sale (
  emission_date,
  order_number,
  seller_id,
  customer_id,
  payment_term_id,
  subtotal,
  discount,
  total,
  status,
  source,
  source_key
)
select
  now() - ((g % 365) || ' days')::interval,
  'ORD-BENCH-' || g,
  refs.seller_id,
  refs.customer_id,
  refs.payment_term_id,
  100,
  10,
  90,
  'completed',
  'BENCH',
  'BENCH-' || g
from generate_series(1, 120000) g
cross join refs;

with refs as (
  select (select id from product where legacy_code = 'BENCH_PROD') as product_id
), bench_sales as (
  select id
  from sale
  where source = 'BENCH'
)
insert into sale_item (sale_id, product_id, quantity, unit_price, total)
select
  s.id,
  refs.product_id,
  1,
  10,
  10
from bench_sales s
cross join refs
cross join generate_series(1, 3);

with refs as (
  select (select id from customer where legacy_code = 'BENCH_CUST') as customer_id
)
insert into customer_payment (
  customer_id,
  amount,
  payment_date,
  method,
  reference,
  notes,
  received_by,
  source,
  legacy_document_value,
  legacy_remaining
)
select
  refs.customer_id,
  (10 + (g % 100))::numeric,
  current_date - (g % 365),
  'legacy',
  'BENCH-' || g,
  null,
  null,
  'legacy',
  null,
  null
from generate_series(1, 180000) g
cross join refs;

commit;

select 'sale_count' as metric, count(*)::text as value from sale where source = 'BENCH'
union all
select 'sale_item_count', count(*)::text from sale_item si join sale s on s.id = si.sale_id where s.source = 'BENCH'
union all
select 'customer_payment_count', count(*)::text from customer_payment where reference like 'BENCH-%';
