create table if not exists print_printer (
  id text primary key,
  display_name text not null check (char_length(display_name) between 1 and 100),
  agent_token_sha256 text unique check (agent_token_sha256 ~ '^[a-f0-9]{64}$'),
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);
insert into print_printer(id,display_name) values('principal','Caixa 1') on conflict(id) do nothing;
insert into print_printer(id,display_name)
  select distinct printer_id,printer_id from print_job on conflict(id) do nothing;
alter table print_job add column if not exists printer_name text;
update print_job set printer_name=case when printer_id='principal' then 'Caixa 1' else printer_id end where printer_name is null;
alter table print_job alter column printer_name set not null;
alter table print_job add constraint print_job_printer_fk foreign key(printer_id) references print_printer(id);
create table if not exists print_enrollment (
  code_sha256 text primary key check (code_sha256 ~ '^[a-f0-9]{64}$'),
  printer_id text not null unique,
  display_name text not null check (char_length(display_name) between 1 and 100),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now()+interval '15 minutes'),
  consumed_at timestamptz
);
