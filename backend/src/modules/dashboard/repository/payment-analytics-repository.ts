import type { PoolClient } from "pg";
import { query, withTransaction } from "../../../db.js";
import { badRequest, conflict } from "../../../errors.js";
import { queryPage } from "../../../utils/query-page.js";
import { getCustomerOverview } from "../../../services/customer-portfolio.js";
import type {
  PaymentAnalyticsFilters,
  PaymentMetrics,
  PaymentBucket,
  PaymentDistribution,
  PaymentTransaction,
  PaymentRanking,
} from "../contracts/payment-analytics-contracts.js";

type Context = {
  timezone: string;
  today: string;
  asOf: string;
  startDate: string;
  endDate: string;
  previousStart: string;
  previousEnd: string;
  days: number;
};
const shift = (date: string, days: number) =>
  new Date(Date.parse(date) + days * 86400000).toISOString().slice(0, 10);

/** A derived read model, not another financial ledger. Receipt and reversal are separate dated events. */
function eventSql(timezone: string) {
  return `with receipts as (
    select 'sale:'||s.id::text as logical_id,s.id as source_id,'sale'::text as source_type,
      (s.paid_at at time zone ${timezone})::date as receipt_date,s.paid_at as confirmed_at,
      s.customer_id,s.received_by,s.store_id,s.order_number as reference,
      case when s.payment_method='credit_with_entry' then 'credit_entry' else 'cash_sale' end as origin,
      case when s.payment_method='credit_with_entry' then 'unspecified' else s.payment_method end as method,
      greatest(least(coalesce(s.amount_paid,0),coalesce(s.total,0)),0) as amount,
      s.cancelled_at,s.status='cancelled' as reversed
    from sale s where s.status in ('completed','cancelled') and s.paid_at is not null
      and coalesce(s.source,'') not in ('VENDAS','PEDIDOS')
      and s.payment_method in ('cash','card','bank','other','credit_with_entry')
      and s.amount_paid>0 and s.total>0
    union all
    select 'payment:'||p.id::text,p.id,'customer_payment',p.payment_date,
      case when p.source='manual' and (p.created_at at time zone ${timezone})::date=p.payment_date then p.created_at end,
      p.customer_id,p.received_by,p.store_id,p.reference,'debt_payment',p.method,p.amount,p.cancelled_at,p.cancelled_at is not null
    from customer_payment p
  ), events as (
    select logical_id||':receipt' as id,logical_id,source_id,source_type,receipt_date as event_date,confirmed_at,
      customer_id,received_by,store_id,reference,origin,method,amount as gross,0::numeric as refunds,amount as net,'receipt'::text as kind,reversed
    from receipts
    union all
    select logical_id||':reversal',logical_id,source_id,source_type,(cancelled_at at time zone ${timezone})::date,cancelled_at,
      customer_id,received_by,store_id,reference,origin,method,0,amount,-amount,'reversal',true
    from receipts where reversed and cancelled_at is not null
  ) select e.*,c.name as customer_name,u.full_name as receiver_name from events e
    left join customer c on c.id=e.customer_id left join app_user u on u.id=e.received_by`;
}

async function context(
  filters: PaymentAnalyticsFilters,
  client?: PoolClient,
): Promise<Context> {
  const { rows } = await query<{
    timezone: string;
    today: string;
    asOf: string;
  }>(
    `select coalesce($1::text,current_setting('TimeZone')) as timezone,
     (now() at time zone coalesce($1::text,current_setting('TimeZone')))::date::text as today,
     to_char(now() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as "asOf"`,
    [filters.timezone ?? null],
    client,
  );
  const current = rows[0],
    startDate = filters.startDate ?? current.today.slice(0, 7) + "-01",
    endDate = filters.endDate ?? current.today;
  const days = (Date.parse(endDate) - Date.parse(startDate)) / 86400000 + 1;
  if (days < 1 || days > 366) throw badRequest("invalid_date_range");
  return {
    ...current,
    startDate,
    endDate,
    days,
    previousStart: shift(startDate, -days),
    previousEnd: shift(startDate, -1),
  };
}

function source(filters: PaymentAnalyticsFilters, ctx: Context, period = true) {
  const params: unknown[] = [ctx.timezone];
  const bind = (value: unknown) => {
    params.push(value);
    return `$${params.length}`;
  };
  const conditions: string[] = [];
  for (const [key, column] of [
    ["customerId", "customer_id"],
    ["method", "method"],
    ["origin", "origin"],
    ["storeId", "store_id"],
  ] as const) {
    if (filters[key]) conditions.push(`${column}=${bind(filters[key])}`);
  }
  if (filters.receivedBy === "unassigned")
    conditions.push("received_by is null");
  else if (filters.receivedBy)
    conditions.push(`received_by=${bind(filters.receivedBy)}`);
  if (filters.search) {
    const value = bind("%" + filters.search + "%");
    conditions.push(
      `(customer_name ilike ${value} or source_id::text ilike ${value} or reference ilike ${value})`,
    );
  }
  if (period)
    conditions.push(
      `event_date between ${bind(ctx.startDate)}::date and ${bind(ctx.endDate)}::date`,
    );
  return {
    sql: `select * from (${eventSql("$1")}) events ${conditions.length ? "where " + conditions.join(" and ") : ""}`,
    params,
  };
}

const metrics = `jsonb_build_object('gross',coalesce(sum(gross),0),'refunds',coalesce(sum(refunds),0),
  'net',coalesce(sum(net),0),'count',count(*) filter(where kind='receipt'),
  'average',round(coalesce(sum(gross)/nullif(count(*) filter(where kind='receipt'),0),0),2),
  'debtGross',coalesce(sum(gross) filter(where origin='debt_payment'),0),
  'debtCount',count(*) filter(where origin='debt_payment' and kind='receipt'),
  'averageAmortization',round(coalesce(sum(gross) filter(where origin='debt_payment')/nullif(count(*) filter(where origin='debt_payment' and kind='receipt'),0),0),2),
  'debtPercentage',round(coalesce(100*sum(gross) filter(where origin='debt_payment')/nullif(sum(gross),0),0),2))`;

export class PgPaymentAnalyticsRepository {
  async options() {
    const result = await query<{ timezone: string; today: string }>(
      `select current_setting('TimeZone') as timezone,current_date::text as today`,
    );
    return result.rows[0];
  }
  async summary(filters: PaymentAnalyticsFilters) {
    return withTransaction(async (client) => {
      await query(
        "set transaction isolation level repeatable read read only",
        [],
        client,
      );
      const ctx = await context(filters, client),
        scoped = source(filters, ctx, false);
      const params = [
        ...scoped.params,
        ctx.startDate,
        ctx.endDate,
        ctx.previousStart,
        ctx.previousEnd,
        ctx.today,
        filters.grouping,
        ctx.days,
      ];
      const base = scoped.params.length;
      const p = (offset: number) => `$${base + offset}`;
      const { rows } = await query<{
        current: PaymentMetrics;
        previous: PaymentMetrics;
        today: PaymentMetrics;
        yesterday: PaymentMetrics;
        series: PaymentBucket[];
        methods: PaymentDistribution[];
        origins: PaymentDistribution[];
        heatmap: {
          weekday: number;
          hour: number;
          gross: number;
          count: number;
        }[];
        coverage: {
          unknownTime: number;
          unknownEmployee: number;
          unknownStore: number;
          unknownMethod: number;
          undatedReversals: number;
        };
      }>(
        `with scoped as materialized (${scoped.sql}),
      period as (select * from scoped where event_date between ${p(1)}::date and ${p(2)}::date),
      previous as (select * from scoped where event_date between ${p(3)}::date and ${p(4)}::date),
      daily as (select event_date,sum(gross) gross,sum(refunds) refunds,sum(net) net,count(*) filter(where kind='receipt') as count from period group by event_date),
      old_daily as (select event_date,sum(net) net from previous group by event_date),
      buckets as (select date_trunc(${p(6)},day)::date as date,coalesce(sum(d.gross),0) gross,coalesce(sum(d.refunds),0) refunds,
        coalesce(sum(d.net),0) net,coalesce(sum(d.count),0) count,coalesce(sum(old.net),0) as "previousNet"
        from generate_series(${p(1)}::date,${p(2)}::date,interval '1 day') day
        left join daily d on d.event_date=day::date left join old_daily old on old.event_date=day::date-${p(7)}::int group by 1),
      methods as (select method as key,sum(gross) gross,sum(refunds) refunds,sum(net) net,count(*) filter(where kind='receipt') count from period group by method),
      origins as (select origin as key,sum(gross) gross,sum(refunds) refunds,sum(net) net,count(*) filter(where kind='receipt') count from period group by origin),
      heat as (select extract(isodow from confirmed_at at time zone $1)::int as weekday,extract(hour from confirmed_at at time zone $1)::int as "hour",
        sum(gross) gross,count(*)::int count from period where kind='receipt' and confirmed_at is not null group by 1,2)
      select (select ${metrics} from period) as current,(select ${metrics} from previous) as previous,
        (select ${metrics} from scoped where event_date=${p(5)}::date) as today,
        (select ${metrics} from scoped where event_date=${p(5)}::date-1) as yesterday,
        (select coalesce(jsonb_agg(buckets order by date),'[]') from buckets) series,
        (select coalesce(jsonb_agg(methods order by gross desc,key),'[]') from methods) methods,
        (select coalesce(jsonb_agg(origins order by gross desc,key),'[]') from origins) origins,
        (select coalesce(jsonb_agg(heat order by weekday,"hour"),'[]') from heat) heatmap,
        (select jsonb_build_object('unknownTime',count(*) filter(where confirmed_at is null),
          'unknownEmployee',count(*) filter(where received_by is null),'unknownStore',count(*) filter(where store_id is null),
          'unknownMethod',count(*) filter(where method in ('legacy','unspecified')),
          'undatedReversals',count(*) filter(where reversed and not exists(select 1 from scoped r where r.logical_id=period.logical_id and r.kind='reversal')))
          from period where kind='receipt') as coverage`,
        params,
        client,
      );
      const portfolio = await getCustomerOverview(true, client);
      const financial =
        "financial" in portfolio ? portfolio.financial : undefined;
      const row = rows[0];
      const change =
        row.previous.net === 0
          ? null
          : Number(
              (
                ((row.current.net - row.previous.net) /
                  Math.abs(row.previous.net)) *
                100
              ).toFixed(2),
            );
      const delta = (current: number, previous: number) =>
        previous === 0
          ? null
          : Number(
              (((current - previous) / Math.abs(previous)) * 100).toFixed(2),
            );
      return {
        ...row,
        context: ctx,
        changePercentage: change,
        todayChangePercentage: delta(row.today.net, row.yesterday.net),
        averageChangePercentage: delta(
          row.current.average,
          row.previous.average,
        ),
        position: {
          asOf: ctx.asOf,
          referenceDate: ctx.today,
          scope: "global_current",
          total: financial?.total_debt ?? 0,
          debtorCount: financial?.customers_with_debt ?? 0,
          overdue: null,
          notDue: null,
          delinquencyPercentage: null,
          historicalSeries: null,
          aging: null,
          settledObligations: null,
        },
      };
    });
  }
  async page(
    kind: "transactions" | "customers" | "employees",
    filters: PaymentAnalyticsFilters,
  ) {
    const ctx = await context(filters),
      scoped = source(filters, ctx);
    if (kind === "transactions")
      return queryPage<PaymentTransaction>({
        ...scoped,
        input: filters,
        sorts: {
          date: "event_date",
          amount: "net",
          customer: "lower(customer_name)",
          employee: "lower(receiver_name)",
          method: "method",
          origin: "origin",
          id: "source_id",
          kind: "kind",
        },
        defaultSort: "date",
        defaultOrder: "desc",
        tieBreaker: "id",
      });
    const customer = kind === "customers";
    const identity = customer
      ? "coalesce(customer_id::text,'anonymous:'||logical_id)"
      : "coalesce(received_by::text,'unassigned')";
    const entity = customer ? "customer_id" : "received_by",
      name = customer ? "customer_name" : "receiver_name";
    const sql = `with events as (${scoped.sql}), ranked as (
      select ${identity} as id,${entity} as entity_id,${name} as name,sum(gross) as gross,sum(refunds) as refunds,sum(net) as net,
      count(*) filter(where kind='receipt')::int as count,
      round(coalesce(sum(gross)/nullif(count(*) filter(where kind='receipt'),0),0),2) as average,
      round(coalesce(100*sum(gross)/nullif((select sum(gross) from events),0),0),2) as participation,
      max(event_date) filter(where kind='receipt') as last_date
      from events group by 1,2,3)
      select ranked.*,${customer ? "(select current_balance from customer_financial_totals where customer_id=ranked.entity_id)" : "null::numeric"} as current_balance from ranked`;
    return queryPage<PaymentRanking>({
      sql,
      params: scoped.params,
      input: filters,
      sorts: {
        net: "net",
        gross: "gross",
        count: "count",
        average: "average",
        name: "lower(name)",
        last_date: "last_date",
      },
      defaultSort: "net",
      defaultOrder: "desc",
    });
  }
  async exportRows(filters: PaymentAnalyticsFilters) {
    const ctx = await context(filters),
      scoped = source(filters, ctx);
    const sorts: Record<string, string> = {
      date: "event_date",
      amount: "net",
      customer: "lower(customer_name)",
      employee: "lower(receiver_name)",
      method: "method",
      origin: "origin",
      id: "source_id",
      kind: "kind",
    };
    const key = filters.sortBy ?? "date";
    if (!Object.hasOwn(sorts, key)) throw badRequest("invalid_sort_field");
    const sort = sorts[key];
    const result = await query<PaymentTransaction>(
      `${scoped.sql} order by ${sort} ${filters.sortOrder ?? "desc"} nulls last,id desc limit 100001`,
      scoped.params,
    );
    if (result.rows.length > 100000)
      throw conflict("payment_export_limit_exceeded");
    return result.rows;
  }
}
