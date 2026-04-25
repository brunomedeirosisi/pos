-- Phase 4 before/after benchmark
-- WARNING: this script drops/recreates indexes and is intended only for isolated benchmark databases.

\set ON_ERROR_STOP on

drop index if exists idx_sale_emission_id;
drop index if exists idx_sale_status_emission;
drop index if exists idx_sale_seller_emission;
drop index if exists idx_sale_customer_status_emission;
drop index if exists idx_sale_payment_term_emission;
drop index if exists idx_sale_item_sale;
drop index if exists idx_sale_item_product;

create temp table bench_metrics (
  scenario text not null,
  ms numeric not null
);

do $$
declare
  i integer;
  t0 timestamptz;
begin
  for i in 1..80 loop
    t0 := clock_timestamp();

    perform *
    from (
      select
        s.id,
        s.emission_date,
        s.order_number,
        s.seller_id,
        s.customer_id,
        s.payment_term_id,
        s.subtotal,
        s.discount,
        s.total,
        s.status,
        s.source,
        s.source_key,
        s.cancelled_at,
        s.cancellation_reason,
        coalesce(
          json_agg(
            json_build_object(
              'id', si.id,
              'product_id', si.product_id,
              'product_name', p.name,
              'quantity', si.quantity,
              'unit_price', si.unit_price,
              'total', si.total
            )
          ) filter (where si.id is not null),
          '[]'
        ) as items
      from sale s
      left join sale_item si on si.sale_id = s.id
      left join product p on p.id = si.product_id
      where s.source = 'BENCH'
      group by s.id
      order by s.emission_date desc, s.id desc
      limit 100
    ) legacy_query;

    insert into bench_metrics(scenario, ms)
    values ('sales_list_legacy_no_index', extract(epoch from (clock_timestamp() - t0)) * 1000);
  end loop;
end $$;

create index if not exists idx_sale_emission_id on sale(emission_date desc, id desc);
create index if not exists idx_sale_status_emission on sale(status, emission_date desc, id desc);
create index if not exists idx_sale_seller_emission on sale(seller_id, emission_date desc, id desc);
create index if not exists idx_sale_customer_status_emission on sale(customer_id, status, emission_date desc, id desc);
create index if not exists idx_sale_payment_term_emission on sale(payment_term_id, emission_date desc, id desc);
create index if not exists idx_sale_item_sale on sale_item(sale_id);
create index if not exists idx_sale_item_product on sale_item(product_id);

do $$
declare
  i integer;
  t0 timestamptz;
begin
  for i in 1..80 loop
    t0 := clock_timestamp();

    perform *
    from (
      with sale_page as (
        select
          s.id,
          s.emission_date,
          s.order_number,
          s.seller_id,
          s.customer_id,
          s.payment_term_id,
          s.subtotal,
          s.discount,
          s.total,
          s.status,
          s.source,
          s.source_key,
          s.cancelled_at,
          s.cancellation_reason
        from sale s
        where s.source = 'BENCH'
        order by s.emission_date desc, s.id desc
        limit 100
      )
      select
        sp.id,
        sp.emission_date,
        sp.order_number,
        sp.seller_id,
        sp.customer_id,
        sp.payment_term_id,
        sp.subtotal,
        sp.discount,
        sp.total,
        sp.status,
        sp.source,
        sp.source_key,
        sp.cancelled_at,
        sp.cancellation_reason,
        coalesce(
          json_agg(
            json_build_object(
              'id', si.id,
              'product_id', si.product_id,
              'product_name', p.name,
              'quantity', si.quantity,
              'unit_price', si.unit_price,
              'total', si.total
            )
          ) filter (where si.id is not null),
          '[]'
        ) as items
      from sale_page sp
      left join sale_item si on si.sale_id = sp.id
      left join product p on p.id = si.product_id
      group by
        sp.id,
        sp.emission_date,
        sp.order_number,
        sp.seller_id,
        sp.customer_id,
        sp.payment_term_id,
        sp.subtotal,
        sp.discount,
        sp.total,
        sp.status,
        sp.source,
        sp.source_key,
        sp.cancelled_at,
        sp.cancellation_reason
      order by sp.emission_date desc, sp.id desc
    ) optimized_query;

    insert into bench_metrics(scenario, ms)
    values ('sales_list_optimized_with_index', extract(epoch from (clock_timestamp() - t0)) * 1000);
  end loop;
end $$;

do $$
declare
  i integer;
  t0 timestamptz;
  cust_id uuid;
begin
  select id into cust_id from customer where legacy_code = 'BENCH_CUST' limit 1;

  for i in 1..120 loop
    t0 := clock_timestamp();

    perform coalesce(sum(s.total), 0)
    from sale s
    where s.customer_id = cust_id
      and s.status = 'completed';

    perform coalesce(sum(cp.amount), 0)
    from customer_payment cp
    where cp.customer_id = cust_id;

    insert into bench_metrics(scenario, ms)
    values ('customer_totals_dual_query', extract(epoch from (clock_timestamp() - t0)) * 1000);
  end loop;
end $$;

do $$
declare
  i integer;
  t0 timestamptz;
  cust_id uuid;
begin
  select id into cust_id from customer where legacy_code = 'BENCH_CUST' limit 1;

  for i in 1..120 loop
    t0 := clock_timestamp();

    perform
      (select coalesce(sum(s.total), 0) from sale s where s.customer_id = cust_id and s.status = 'completed') as total_charges,
      (select coalesce(sum(cp.amount), 0) from customer_payment cp where cp.customer_id = cust_id) as total_paid;

    insert into bench_metrics(scenario, ms)
    values ('customer_totals_single_query', extract(epoch from (clock_timestamp() - t0)) * 1000);
  end loop;
end $$;

do $$
declare
  t0 timestamptz;
  i integer;
begin
  create temp table bench_import_tmp (
    seq_no integer not null,
    payload text not null
  );

  t0 := clock_timestamp();
  for i in 1..10000 loop
    insert into bench_import_tmp(seq_no, payload)
    values (i, md5(i::text));
  end loop;
  insert into bench_metrics(scenario, ms)
  values ('import_row_by_row_10k', extract(epoch from (clock_timestamp() - t0)) * 1000);

  truncate bench_import_tmp;

  t0 := clock_timestamp();
  for i in 0..19 loop
    insert into bench_import_tmp(seq_no, payload)
    select (i * 500) + g, md5(((i * 500) + g)::text)
    from generate_series(1, 500) g;
  end loop;
  insert into bench_metrics(scenario, ms)
  values ('import_batch_500_10k', extract(epoch from (clock_timestamp() - t0)) * 1000);
end $$;

select
  scenario,
  round(avg(ms)::numeric, 3) as avg_ms,
  round(percentile_cont(0.95) within group (order by ms)::numeric, 3) as p95_ms,
  round((1000.0 / nullif(avg(ms), 0))::numeric, 2) as throughput_rps
from bench_metrics
group by scenario
order by scenario;
