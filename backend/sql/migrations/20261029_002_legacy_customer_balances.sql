create table if not exists customer_legacy_balance (
  customer_id uuid primary key references customer(id) on delete cascade,
  import_id uuid not null references system_legacy_import(id),
  source_balance numeric(14,2) not null,
  reconstructed_balance numeric(14,2) not null,
  adjustment numeric(14,2) not null,
  source_sha256 text not null check (source_sha256 ~ '^[a-f0-9]{64}$'),
  reconciled_at timestamptz not null default now(),
  check (source_balance = reconstructed_balance + adjustment)
);

create or replace view customer_financial_totals as
select c.id as customer_id,
       coalesce(charges.total, 0) as total_charges,
       coalesce(charges.paid, 0) + coalesce(payments.paid, 0) as total_paid,
       coalesce(charges.total, 0) - coalesce(charges.paid, 0) - coalesce(payments.paid, 0)
         + coalesce(lb.adjustment, 0) as current_balance,
       payments.last_payment_date,
       case when lb.customer_id is null then null else jsonb_build_object(
         'source_field', 'CLIENTES.DBF.DEBITO',
         'source_balance', lb.source_balance,
         'reconstructed_balance', lb.reconstructed_balance,
         'adjustment', lb.adjustment,
         'source_sha256', lb.source_sha256,
         'import_session_id', job.session_id,
         'reconciled_at', lb.reconciled_at
       ) end as legacy_balance
from customer c
left join lateral (
  select sum(s.total) as total, sum(s.amount_paid) as paid
  from sale s where s.customer_id = c.id and s.status = 'completed'
) charges on true
left join lateral (
  select sum(p.amount) as paid, max(p.payment_date) as last_payment_date
  from customer_payment p where p.customer_id = c.id and p.cancelled_at is null
) payments on true
left join customer_legacy_balance lb on lb.customer_id = c.id
left join system_legacy_import job on job.id = lb.import_id;
