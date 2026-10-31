-- Deterministic page ordering, including duplicate names and dates.
create index if not exists idx_product_page_name on product(lower(name),id);
create index if not exists idx_product_group_page_name on product_group(lower(name),id);
create index if not exists idx_customer_page_name on customer(lower(name),id);
create index if not exists idx_seller_page_name on seller(lower(name),id);
create index if not exists idx_payment_term_page_name on payment_term(lower(name),id);
create index if not exists idx_app_role_page_name on app_role(lower(name),id);
create index if not exists idx_app_user_page_name on app_user(lower(full_name),id);
create index if not exists idx_app_user_role_page_name on app_user(role_id,lower(full_name),id);
create index if not exists idx_customer_payment_active_page on customer_payment(customer_id,payment_date desc,id desc) where cancelled_at is null;
create index if not exists idx_print_job_sale_page on print_job(sale_id,requested_at desc,id desc);
create index if not exists idx_legacy_log_page on system_legacy_import_log(import_id,created_at,id);
create index if not exists idx_backup_page on system_backup(created_at desc,id desc);
