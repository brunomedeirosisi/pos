-- Serialize first startup across API replicas. This SQL batch is transactional.
select pg_advisory_xact_lock(20261030);

-- Deliberately outside public and excluded from application backups.
create schema if not exists pos_recovery;
create table if not exists pos_recovery.archive (
  filename text primary key,
  checksum text not null,
  size_bytes bigint not null,
  metadata jsonb,
  created_at timestamptz not null default now(),
  trusted boolean not null default false,
  deleted boolean not null default false
);
create table if not exists pos_recovery.operation (
  id uuid primary key,
  actor_id text,
  status text not null,
  stage text not null,
  backup_filename text not null,
  snapshot_filename text,
  details jsonb not null default '{}',
  started_at timestamptz not null default now(),
  finished_at timestamptz
);
create table if not exists pos_recovery.state (
  singleton boolean primary key default true check (singleton),
  operation_id uuid
);
insert into pos_recovery.state(singleton) values (true) on conflict do nothing;

-- Installation preferences and scheduler receipts survive public-schema restore.
create table if not exists pos_recovery.backup_schedule (
  singleton boolean primary key default true check (singleton),
  enabled boolean not null default false,
  daily_time time not null default '03:00' check (daily_time < '24:00'::time and extract(second from daily_time)=0),
  next_run_at timestamptz,
  updated_at timestamptz not null default now(),
  updated_by text
);
insert into pos_recovery.backup_schedule(singleton) values(true) on conflict do nothing;

create table if not exists pos_recovery.backup_run (
  id uuid primary key default gen_random_uuid(),
  scheduled_for timestamptz not null unique,
  status text not null check (status in ('running','completed','failed')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  backup_filename text,
  error_message text
);
create index if not exists idx_backup_run_started on pos_recovery.backup_run(started_at desc,id desc);

-- Use calendar days in the database's store zone, never an interval of 24 hours.
create or replace function pos_recovery.next_backup_at(backup_time time, reference_time timestamptz, zone text)
returns timestamptz language sql stable as $$
  select case
    when ((reference_time at time zone zone)::date + backup_time) at time zone zone > reference_time
    then ((reference_time at time zone zone)::date + backup_time) at time zone zone
    else (((reference_time at time zone zone)::date + 1) + backup_time) at time zone zone
  end
$$;
