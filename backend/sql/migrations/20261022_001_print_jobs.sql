create table if not exists print_job (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null unique,
  sale_id uuid not null references sale(id) on delete cascade,
  printer_id text not null default 'principal',
  copies integer not null check (copies between 1 and 10),
  locale text not null check (locale in ('pt-BR','en')),
  receipt_code text not null,
  content text not null check (octet_length(content) between 1 and 1048576),
  status text not null default 'queued' check (status in ('queued','claimed','spooling','submitted','failed','uncertain')),
  claim_token uuid,
  lease_until timestamptz,
  requested_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  result_code text
);
create index if not exists idx_print_job_queue on print_job(printer_id,status,requested_at,id);
create index if not exists idx_print_job_sale on print_job(sale_id,requested_at desc);
create table if not exists print_agent_state (
  printer_id text primary key,
  last_seen_at timestamptz not null default now()
);
