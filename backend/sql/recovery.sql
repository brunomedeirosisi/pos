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
