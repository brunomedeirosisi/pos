-- Attribution for new receipts only. Historical sellers/import times are not payment receivers.
alter table sale add column if not exists received_by uuid references app_user(id) on delete set null;
alter table customer_payment add column if not exists store_id text;
create index if not exists idx_sale_receipt_date on sale(paid_at,id) where amount_paid > 0;
create index if not exists idx_sale_reversal_date on sale(cancelled_at,id) where cancelled_at is not null;
create index if not exists idx_customer_payment_reversal_date on customer_payment(cancelled_at,id) where cancelled_at is not null;
