alter table sale
  add column if not exists payment_method text check (payment_method in ('cash', 'card', 'bank', 'other')),
  add column if not exists amount_paid numeric(14,2),
  add column if not exists change_amount numeric(14,2) not null default 0;

update sale
set paid_at = coalesce(paid_at, emission_date::timestamptz)
where paid_at is null;
