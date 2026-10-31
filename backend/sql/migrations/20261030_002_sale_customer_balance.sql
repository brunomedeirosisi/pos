-- Historical receipts remain unknown; never infer an old balance from today's balance.
alter table sale add column if not exists customer_balance_after_sale numeric(20,2);

-- Tendered change does not repay earlier debt. Preserve imported accounting
-- exactly, including the authoritative legacy balance reconciliation.
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
  select sum(s.total) as total, sum(case when s.source in ('VENDAS','PEDIDOS') or s.payment_method is null
                then s.amount_paid
                else least(coalesce(s.amount_paid,0), coalesce(s.total,0)) end) as paid
  from sale s where s.customer_id = c.id and s.status = 'completed'
) charges on true
left join lateral (
  select sum(p.amount) as paid, max(p.payment_date) as last_payment_date
  from customer_payment p where p.customer_id = c.id and p.cancelled_at is null
) payments on true
left join customer_legacy_balance lb on lb.customer_id = c.id
left join system_legacy_import job on job.id = lb.import_id;
