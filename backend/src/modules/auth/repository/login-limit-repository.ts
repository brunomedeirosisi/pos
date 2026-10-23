import { query } from '../../../db.js';

export type LoginLimitBucket = { key: string; attempts: number; retry_after: number };
export interface LoginLimitStore {
  consume(keys: string[], windowSeconds: number): Promise<LoginLimitBucket[]>;
}

export class PgLoginLimitStore implements LoginLimitStore {
  async consume(keys: string[], windowSeconds: number): Promise<LoginLimitBucket[]> {
    const { rows } = await query<LoginLimitBucket>(
      `with expired as (
         delete from auth_login_limit where key in (
           select key from auth_login_limit where reset_at < now() - make_interval(secs => $2::int)
             and not (key = any($1::text[]))
           order by reset_at limit 100
         )
       )
       insert into auth_login_limit (key, attempts, reset_at)
       select key, 1, now() + make_interval(secs => $2::int) from unnest($1::text[]) as key order by key
       on conflict (key) do update set
         attempts = case when auth_login_limit.reset_at <= now() then 1
                         else least(auth_login_limit.attempts, 2147483646) + 1 end,
         reset_at = case when auth_login_limit.reset_at <= now() then excluded.reset_at
                         else auth_login_limit.reset_at end
       returning key, attempts, greatest(1, ceil(extract(epoch from reset_at - now())))::int as retry_after`,
      [keys, windowSeconds]
    );
    return rows;
  }
}
