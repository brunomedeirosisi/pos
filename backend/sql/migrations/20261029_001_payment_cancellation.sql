alter table customer_payment
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancelled_by uuid references app_user(id),
  add column if not exists cancellation_reason text;

create index if not exists idx_customer_payment_history
  on customer_payment(payment_date desc, created_at desc, id desc);
create index if not exists idx_customer_payment_receiver_date
  on customer_payment(received_by, payment_date desc, created_at desc, id desc);
