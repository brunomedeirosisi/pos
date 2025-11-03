-- Basic schema (excerpt). Extend with the full model when ready.
create extension if not exists pgcrypto;

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
  price_base numeric(14,2)
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
  order_number text,
  seller_id uuid references seller(id),
  customer_id uuid references customer(id),
  payment_term_id uuid references payment_term(id),
  subtotal numeric(14,2),
  discount numeric(14,2),
  total numeric(14,2),
  status text not null default 'completed' check (status in ('draft','completed','cancelled')),
  cancelled_at timestamptz,
  cancellation_reason text,
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
select 'admin@localhost.com', '$2a$10$gJtzg1fW/bSe4DYihnDpku.Cmwb/kxb4a1RRHsSXnD/c.MeDYrzPK', 'System Administrator', id
from app_role
where name = 'admin'
on conflict (email) do nothing;
