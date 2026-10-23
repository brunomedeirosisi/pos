create table if not exists auth_session (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app_user(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  check (expires_at > created_at)
);
create index if not exists idx_auth_session_user on auth_session(user_id);
create index if not exists idx_auth_session_expiration on auth_session(expires_at);

create table if not exists auth_login_limit (
  key text primary key,
  attempts integer not null check (attempts > 0),
  reset_at timestamptz not null
);
create index if not exists idx_auth_login_limit_reset on auth_login_limit(reset_at);
