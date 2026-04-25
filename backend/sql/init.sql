-- Basic schema (excerpt). Extend with the full model when ready.
create extension if not exists pgcrypto;
create extension if not exists pg_trgm;

create table if not exists app_role (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text,
  permissions jsonb not null default '[]'::jsonb,
  discount_limit numeric(14,2) default 0
);

create table if not exists app_user (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  password_hash text not null,
  full_name text not null,
  role_id uuid references app_role(id),
  status text not null default 'active',
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists product_group (
  id uuid primary key default gen_random_uuid(),
  legacy_code text unique,
  name text not null
);

create table if not exists product (
  id uuid primary key default gen_random_uuid(),
  legacy_code text unique,
  name text not null,
  barcode text,
  group_id uuid references product_group(id),
  reference text,
  min_stock numeric(14,3),
  price_cash numeric(14,2),
  price_base numeric(14,2),
  cost_price numeric(14,2),
  average_cost numeric(14,2)
);

create table if not exists customer (
  id uuid primary key default gen_random_uuid(),
  legacy_code text unique,
  name text not null,
  cpf text,
  address text, city text, uf text, cep text, phone text,
  status text not null default 'active',
  credit_limit numeric(14,2),
  notes text
);

create table if not exists seller (
  id uuid primary key default gen_random_uuid(),
  legacy_code text unique,
  name text not null
);

create table if not exists payment_term (
  id uuid primary key default gen_random_uuid(),
  legacy_code text unique,
  name text not null
);

create table if not exists sale (
  id uuid primary key default gen_random_uuid(),
  emission_date date not null default now(),
  paid_at timestamptz,
  order_number text,
  seller_id uuid references seller(id),
  customer_id uuid references customer(id),
  payment_term_id uuid references payment_term(id),
  subtotal numeric(14,2),
  discount numeric(14,2),
  refund_amount numeric(14,2) not null default 0,
  total numeric(14,2),
  status text not null default 'completed' check (status in ('draft','completed','cancelled')),
  cancelled_at timestamptz,
  cancellation_reason text,
  store_id text not null default 'main',
  channel text not null default 'pos' check (channel in ('pos','ecommerce','whatsapp','marketplace')),
  source text,
  source_key text,
  unique(source, source_key)
);

create table if not exists sale_item (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid references sale(id) on delete cascade,
  product_id uuid references product(id),
  quantity numeric(14,3) not null,
  unit_price numeric(14,2),
  total numeric(14,2)
);

create index if not exists idx_sale_emission_id on sale(emission_date desc, id desc);
create index if not exists idx_sale_store_paid_status on sale(store_id, emission_date desc, status);
create index if not exists idx_sale_channel_paid on sale(channel, emission_date desc);
create index if not exists idx_sale_status_emission on sale(status, emission_date desc, id desc);
create index if not exists idx_sale_seller_emission on sale(seller_id, emission_date desc, id desc);
create index if not exists idx_sale_customer_status_emission on sale(customer_id, status, emission_date desc, id desc);
create index if not exists idx_sale_payment_term_emission on sale(payment_term_id, emission_date desc, id desc);
create index if not exists idx_sale_item_sale on sale_item(sale_id);
create index if not exists idx_sale_item_product on sale_item(product_id);

create table if not exists stock_movement (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references product(id) on delete cascade,
  date date not null default now(),
  type text not null,
  quantity numeric(14,3) not null,
  unit_value numeric(14,2),
  total numeric(14,2),
  note_number text
);

create index if not exists idx_stock_movement_product on stock_movement(product_id);
create index if not exists idx_stock_movement_product_date on stock_movement(product_id, date desc);

create index if not exists idx_product_name_trgm on product using gin (name gin_trgm_ops);
create index if not exists idx_product_legacy_code_trgm on product using gin (legacy_code gin_trgm_ops);
create index if not exists idx_product_barcode_trgm on product using gin (barcode gin_trgm_ops);
create index if not exists idx_product_group_name_trgm on product_group using gin (name gin_trgm_ops);
create index if not exists idx_product_group_legacy_code_trgm on product_group using gin (legacy_code gin_trgm_ops);
create index if not exists idx_customer_name_trgm on customer using gin (name gin_trgm_ops);
create index if not exists idx_customer_legacy_code_trgm on customer using gin (legacy_code gin_trgm_ops);
create index if not exists idx_customer_cpf_trgm on customer using gin (cpf gin_trgm_ops);
create index if not exists idx_seller_name_trgm on seller using gin (name gin_trgm_ops);
create index if not exists idx_seller_legacy_code_trgm on seller using gin (legacy_code gin_trgm_ops);
create index if not exists idx_payment_term_name_trgm on payment_term using gin (name gin_trgm_ops);
create index if not exists idx_payment_term_legacy_code_trgm on payment_term using gin (legacy_code gin_trgm_ops);
create index if not exists idx_app_user_email_trgm on app_user using gin (email gin_trgm_ops);
create index if not exists idx_app_user_full_name_trgm on app_user using gin (full_name gin_trgm_ops);

create table if not exists customer_payment (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customer(id) on delete cascade,
  amount numeric(14,2) not null check (amount > 0),
  payment_date date not null default now(),
  method text not null default 'cash' check (method in ('cash', 'card', 'bank', 'other', 'legacy')),
  reference text,
  notes text,
  received_by uuid references app_user(id),
  source text not null default 'manual' check (source in ('manual', 'legacy')),
  created_at timestamptz not null default now(),
  legacy_document_value numeric(14,2),
  legacy_remaining numeric(14,2)
);

create index if not exists idx_customer_payment_customer on customer_payment(customer_id);
create index if not exists idx_customer_payment_customer_date on customer_payment(customer_id, payment_date desc, created_at desc);
create index if not exists idx_customer_payment_method on customer_payment(customer_id, method);

create table if not exists audit_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references app_user(id),
  action text not null,
  details jsonb,
  ip_address text,
  created_at timestamptz not null default now()
);

create index if not exists idx_audit_log_created_at on audit_log(created_at desc);

create table if not exists system_backup (
  id uuid primary key default gen_random_uuid(),
  filename text not null unique,
  size_bytes bigint,
  created_at timestamptz not null default now(),
  created_by uuid references app_user(id),
  checksum text,
  metadata jsonb
);

create index if not exists idx_system_backup_created_at on system_backup(created_at desc);

create table if not exists system_backup_operation (
  id uuid primary key default gen_random_uuid(),
  operation_type text not null check (operation_type in ('backup', 'restore', 'retention')),
  status text not null check (status in ('running', 'completed', 'failed', 'rolled_back', 'warning')),
  backup_filename text,
  snapshot_filename text,
  requested_by uuid references app_user(id),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  timeout_ms integer,
  details jsonb,
  error_message text
);

create index if not exists idx_system_backup_operation_started_at on system_backup_operation(started_at desc);
create index if not exists idx_system_backup_operation_type_status on system_backup_operation(operation_type, status);

create table if not exists system_legacy_import (
  id uuid primary key default gen_random_uuid(),
  session_id text not null unique,
  session_dir text not null,
  overwrite boolean not null default false,
  status text not null default 'queued',
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  created_by uuid references app_user(id),
  report_path text,
  summary jsonb,
  error_message text
);

create table if not exists system_legacy_import_log (
  id bigserial primary key,
  import_id uuid not null references system_legacy_import(id) on delete cascade,
  level text not null default 'info',
  message text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_system_legacy_import_status on system_legacy_import(status);
create index if not exists idx_system_legacy_import_log_import on system_legacy_import_log(import_id, created_at);

insert into app_role (name, description, permissions, discount_limit)
values
  ('admin', 'Full access administrator', '["*"]', 100),
  (
    'manager',
    'Store manager',
    '["catalog:read","catalog:write","sales:read","sales:cancel","pos:checkout","reports:view","system:backup:read","system:backup:create","system:backup:download"]',
    15
  ),
  ('seller', 'Sales operator', '["catalog:read","pos:checkout","sales:read"]', 5)
on conflict (name) do update set
  description = excluded.description,
  permissions = excluded.permissions,
  discount_limit = excluded.discount_limit;

insert into app_user (email, password_hash, full_name, role_id)
select 'admin@localhost.com', crypt('magazine', gen_salt('bf', 10)), 'System Administrator', id
from app_role
where name = 'admin'
on conflict (email) do nothing;
