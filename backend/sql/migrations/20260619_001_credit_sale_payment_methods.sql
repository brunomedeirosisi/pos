alter table sale
  drop constraint if exists sale_payment_method_check;

alter table sale
  add constraint sale_payment_method_check
  check (payment_method in ('cash', 'card', 'bank', 'other', 'credit', 'credit_with_entry'));
