-- Account identity and explicit assignment are separate from shared permission roles.
alter table seller add column if not exists user_id uuid unique references app_user(id) on delete set null;
create table if not exists user_seller (
  user_id uuid primary key references app_user(id) on delete cascade,
  seller_id uuid not null unique references seller(id),
  automatic boolean not null default false,
  updated_at timestamptz not null default now()
);
