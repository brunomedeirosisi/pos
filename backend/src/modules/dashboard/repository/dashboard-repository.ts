import { query } from '../../../db.js';
import type {
  CategoriesMetric,
  DashboardFilterDto,
  PeakHoursMetric,
  ProductAbcMetric,
  SellerRankingSort,
  TopProductMetric,
} from '../contracts/dashboard-contracts.js';
import {
  DEFAULT_TIMEZONE,
  groupSmallCategories,
  resolveProductMetricExpression,
  resolveSellerOrderBy,
  weekdayNameFromIso,
} from '../domain/dashboard-domain.js';

type FilterParams = [Date | null, Date | null, string, string | null, string | null, string | null, string | null, string | null];

type Decimalish = string | number | null;

const FILTERED_SALES_CTE = `
with params as (
  select
    coalesce($1::date, date_trunc('month', now() at time zone $3)::date) as start_date,
    coalesce($2::date, (now() at time zone $3)::date) as end_date,
    $3::text as timezone
),
filtered_sales as (
  select s.*
  from sale s
  cross join params p
  where s.status = 'completed'
    and s.emission_date >= p.start_date
    and s.emission_date <= p.end_date
    and ($4::text is null or s.store_id = $4::text)
    and ($5::uuid is null or s.seller_id = $5::uuid)
    and ($7::text is null or s.channel = $7::text)
    and ($8::uuid is null or s.payment_term_id = $8::uuid)
    and (
      $6::uuid is null
      or exists (
        select 1
        from sale_item sale_item_filter
        join product product_filter on product_filter.id = sale_item_filter.product_id
        where sale_item_filter.sale_id = s.id
          and product_filter.group_id = $6::uuid
      )
    )
),
filtered_sale_items as (
  select
    si.sale_id,
    si.product_id,
    si.quantity::numeric as quantity,
    coalesce(si.unit_price, 0)::numeric as unit_price,
    coalesce(si.total, si.quantity * coalesce(si.unit_price, 0))::numeric as item_total,
    p.name as product_name,
    p.reference as sku,
    p.group_id as category_id,
    coalesce(pg.name, 'Sem categoria') as category_name,
    p.cost_price,
    p.average_cost,
    p.price_base
  from sale_item si
  join filtered_sales fs on fs.id = si.sale_id
  join product p on p.id = si.product_id
  left join product_group pg on pg.id = p.group_id
  where ($6::uuid is null or p.group_id = $6::uuid)
)
`;

const SALE_REVENUE_SQL = `coalesce(fs.total, coalesce(fs.subtotal, 0) - coalesce(fs.discount, 0)) - coalesce(fs.refund_amount, 0)`;
const ITEM_COST_SQL = `coalesce(fsi.cost_price, fsi.average_cost, fsi.price_base)`;

function toNumber(value: Decimalish): number {
  if (value == null) return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toDateOrNull(value?: Date): Date | null {
  return value ?? null;
}

function buildFilterParams(filters: DashboardFilterDto): FilterParams {
  return [
    toDateOrNull(filters.startDate),
    toDateOrNull(filters.endDate),
    filters.timezone?.trim() || DEFAULT_TIMEZONE,
    filters.storeId?.trim() || null,
    filters.sellerId ?? null,
    filters.categoryId ?? null,
    filters.channel ?? null,
    filters.paymentTermId ?? null,
  ];
}

export type DashboardFilterOptionsDto = {
  stores: Array<{ id: string; name: string }>;
  sellers: Array<{ id: string; name: string }>;
  categories: Array<{ id: string; name: string }>;
  channels: Array<{ id: string; name: string }>;
  paymentTerms: Array<{ id: string; name: string }>;
};

export type DashboardSummaryDto = {
  revenueToday: number;
  averageTicket: number;
  ordersToday: number;
  ordersPeriod: number;
  grossMarginPercentage: number;
  missingCostItemsPercentage: number;
};

export type DashboardCustomerKpiDto = {
  newCustomers: number;
  returningCustomers: number;
  returningCustomerPercentage: number;
  purchaseFrequency: number;
};

export type DashboardCriticalStockItemDto = {
  productId: string;
  productName: string;
  sku: string | null;
  currentStock: number;
  minimumStock: number;
  status: 'OK' | 'LOW' | 'OUT_OF_STOCK';
};

export type DashboardTopProductDto = {
  productId: string;
  productName: string;
  sku: string | null;
  quantitySold: number;
  revenue: number;
} | null;

export type DashboardSalesByDayItemDto = {
  date: string;
  revenue: number;
  orders: number;
  averageTicket: number;
  grossMarginPercentage: number;
};

export type DashboardCategoriesResponseDto = {
  metric: CategoriesMetric;
  items: Array<{
    categoryId: string | null;
    categoryName: string;
    value: number;
    percentage: number;
    revenue: number;
    quantity: number;
    margin: number;
  }>;
};

export type DashboardPeakHoursResponseDto = {
  metric: PeakHoursMetric;
  items: Array<{
    weekday: number;
    weekdayName: string;
    hour: number;
    orders: number;
    revenue: number;
  }>;
};

export type DashboardSellerRankingItemDto = {
  sellerId: string | null;
  sellerName: string;
  revenue: number;
  orders: number;
  averageTicket: number;
  grossMarginPercentage: number;
  participationPercentage: number;
  rank: number;
};

export type DashboardProductAbcItemDto = {
  productId: string;
  productName: string;
  sku: string | null;
  categoryName: string;
  quantitySold: number;
  revenue: number;
  margin: number;
  participationPercentage: number;
  accumulatedPercentage: number;
  abcClass: 'A' | 'B' | 'C';
};

export type DashboardProductAbcResponseDto = {
  metric: ProductAbcMetric;
  total: number;
  items: DashboardProductAbcItemDto[];
};

export class PgDashboardRepository {
  async listFilterOptions(): Promise<DashboardFilterOptionsDto> {
    const [storesResult, sellersResult, categoriesResult, paymentTermsResult, channelsResult] = await Promise.all([
      query<{ id: string | null }>(
        `select distinct nullif(trim(store_id), '') as id
         from sale
         order by id nulls last`
      ),
      query<{ id: string; name: string }>(`select id, name from seller order by name asc`),
      query<{ id: string; name: string }>(`select id, name from product_group order by name asc`),
      query<{ id: string; name: string }>(`select id, name from payment_term order by name asc`),
      query<{ id: string | null }>(`select distinct nullif(trim(channel), '') as id from sale order by id nulls last`),
    ]);

    const stores = storesResult.rows
      .map((row) => row.id?.trim())
      .filter((id): id is string => Boolean(id))
      .map((id) => ({ id, name: id }));
    if (!stores.length) {
      stores.push({ id: 'main', name: 'Main' });
    }

    const knownChannels = [
      { id: 'pos', name: 'POS' },
      { id: 'ecommerce', name: 'E-commerce' },
      { id: 'whatsapp', name: 'WhatsApp' },
      { id: 'marketplace', name: 'Marketplace' },
    ];
    const existingChannels = new Set(
      channelsResult.rows
        .map((row) => row.id?.trim().toLowerCase())
        .filter((id): id is string => Boolean(id))
    );
    const channels = [...knownChannels];
    existingChannels.forEach((id) => {
      if (!knownChannels.some((entry) => entry.id === id)) {
        channels.push({ id, name: id.toUpperCase() });
      }
    });

    return {
      stores,
      sellers: sellersResult.rows.map((row) => ({ id: row.id, name: row.name })),
      categories: categoriesResult.rows.map((row) => ({ id: row.id, name: row.name })),
      channels,
      paymentTerms: paymentTermsResult.rows.map((row) => ({ id: row.id, name: row.name })),
    };
  }

  async getSummary(filters: DashboardFilterDto): Promise<DashboardSummaryDto> {
    const params = buildFilterParams(filters);
    const { rows } = await query<{
      revenue_today: Decimalish;
      average_ticket: Decimalish;
      orders_today: Decimalish;
      orders_period: Decimalish;
      gross_margin_percentage: Decimalish;
      missing_cost_items_percentage: Decimalish;
    }>(
      `${FILTERED_SALES_CTE},
       today_scope as (
         select (now() at time zone (select timezone from params))::date as today_local
       ),
       margin_scope as (
         select
           case
             when coalesce(sum(fsi.item_total), 0) <= 0 then 0
             else ((sum(fsi.item_total) - sum(fsi.quantity * coalesce(${ITEM_COST_SQL}, 0))) / sum(fsi.item_total)) * 100
           end as gross_margin_percentage,
           case
             when coalesce(sum(fsi.quantity), 0) <= 0 then 0
             else (sum(case when ${ITEM_COST_SQL} is null then fsi.quantity else 0 end) / sum(fsi.quantity)) * 100
           end as missing_cost_items_percentage
         from filtered_sale_items fsi
       )
       select
         coalesce(sum(case
           when coalesce((fs.paid_at at time zone (select timezone from params))::date, fs.emission_date) = ts.today_local
             then ${SALE_REVENUE_SQL}
             else 0
         end), 0) as revenue_today,
         case when count(*) = 0 then 0 else coalesce(sum(${SALE_REVENUE_SQL}), 0) / count(*) end as average_ticket,
         count(*) filter (
           where coalesce((fs.paid_at at time zone (select timezone from params))::date, fs.emission_date) = ts.today_local
         ) as orders_today,
         count(*) as orders_period,
          coalesce(max(ms.gross_margin_percentage), 0) as gross_margin_percentage,
          coalesce(max(ms.missing_cost_items_percentage), 0) as missing_cost_items_percentage
        from filtered_sales fs
        cross join today_scope ts
        cross join margin_scope ms`,
      params
    );

    const row = rows[0];
    return {
      revenueToday: Number(toNumber(row?.revenue_today).toFixed(2)),
      averageTicket: Number(toNumber(row?.average_ticket).toFixed(2)),
      ordersToday: Math.round(toNumber(row?.orders_today)),
      ordersPeriod: Math.round(toNumber(row?.orders_period)),
      grossMarginPercentage: Number(toNumber(row?.gross_margin_percentage).toFixed(2)),
      missingCostItemsPercentage: Number(toNumber(row?.missing_cost_items_percentage).toFixed(2)),
    };
  }

  async getCustomerKpis(filters: DashboardFilterDto): Promise<DashboardCustomerKpiDto> {
    const params = buildFilterParams(filters);
    const { rows } = await query<{
      new_customers: Decimalish;
      returning_customers: Decimalish;
      returning_customer_percentage: Decimalish;
      purchase_frequency: Decimalish;
    }>(
      `${FILTERED_SALES_CTE},
       customer_history as (
         select
           s.customer_id,
           min(s.emission_date) as first_purchase_date
         from sale s
         cross join params p
         where s.status = 'completed'
           and s.customer_id is not null
           and ($4::text is null or s.store_id = $4::text)
           and ($5::uuid is null or s.seller_id = $5::uuid)
           and ($7::text is null or s.channel = $7::text)
           and ($8::uuid is null or s.payment_term_id = $8::uuid)
           and (
             $6::uuid is null
             or exists (
               select 1
               from sale_item sale_item_filter
               join product product_filter on product_filter.id = sale_item_filter.product_id
               where sale_item_filter.sale_id = s.id
                 and product_filter.group_id = $6::uuid
             )
           )
         group by s.customer_id
       ),
       customers_in_period as (
         select
           fs.customer_id,
           count(*)::int as orders_count
         from filtered_sales fs
         where fs.customer_id is not null
         group by fs.customer_id
       )
       select
         count(*) filter (where ch.first_purchase_date >= p.start_date and ch.first_purchase_date <= p.end_date) as new_customers,
         count(*) filter (where ch.first_purchase_date < p.start_date) as returning_customers,
         case
           when count(*) = 0 then 0
           else (count(*) filter (where ch.first_purchase_date < p.start_date)::numeric / count(*)::numeric) * 100
         end as returning_customer_percentage,
         case
           when count(*) = 0 then 0
           else coalesce(sum(cip.orders_count), 0)::numeric / count(*)::numeric
         end as purchase_frequency
       from customers_in_period cip
       join customer_history ch on ch.customer_id = cip.customer_id
       cross join params p`,
      params
    );

    const row = rows[0];
    return {
      newCustomers: Math.round(toNumber(row?.new_customers)),
      returningCustomers: Math.round(toNumber(row?.returning_customers)),
      returningCustomerPercentage: Number(toNumber(row?.returning_customer_percentage).toFixed(2)),
      purchaseFrequency: Number(toNumber(row?.purchase_frequency).toFixed(2)),
    };
  }

  async getTopProduct(filters: DashboardFilterDto, metric: TopProductMetric): Promise<DashboardTopProductDto> {
    const params = [...buildFilterParams(filters), metric];
    const { rows } = await query<{
      product_id: string;
      product_name: string;
      sku: string | null;
      quantity_sold: Decimalish;
      revenue: Decimalish;
    }>(
      `${FILTERED_SALES_CTE}
       select
         fsi.product_id,
         fsi.product_name,
         nullif(trim(fsi.sku), '') as sku,
         sum(fsi.quantity) as quantity_sold,
         sum(fsi.item_total) as revenue
       from filtered_sale_items fsi
       group by fsi.product_id, fsi.product_name, fsi.sku
       order by
         case when $9::text = 'revenue' then sum(fsi.item_total) end desc nulls last,
         case when $9::text = 'quantity' then sum(fsi.quantity) end desc nulls last,
         sum(fsi.item_total) desc,
         fsi.product_name asc
       limit 1`,
      params
    );

    const row = rows[0];
    if (!row) return null;
    return {
      productId: row.product_id,
      productName: row.product_name,
      sku: row.sku ?? null,
      quantitySold: Number(toNumber(row.quantity_sold).toFixed(3)),
      revenue: Number(toNumber(row.revenue).toFixed(2)),
    };
  }

  async getCriticalStock(filters: DashboardFilterDto): Promise<DashboardCriticalStockItemDto[]> {
    const params = [filters.categoryId ?? null, 20];
    const { rows } = await query<{
      product_id: string;
      product_name: string;
      sku: string | null;
      current_stock: Decimalish;
      minimum_stock: Decimalish;
    }>(
      `with stock_position as (
         select
           p.id as product_id,
           p.name as product_name,
           nullif(trim(p.reference), '') as sku,
           coalesce(p.min_stock, 0) as minimum_stock,
           coalesce(
             sum(
               case
                 when sm.type is null then 0
                 when lower(trim(sm.type)) in ('e', 'entrada', 'in', 'credit', 'compra') then abs(coalesce(sm.quantity, 0))
                 when lower(trim(sm.type)) in ('s', 'saida', 'out', 'debit', 'venda') then -abs(coalesce(sm.quantity, 0))
                 else coalesce(sm.quantity, 0)
               end
             ),
             0
           ) as current_stock
         from product p
         left join stock_movement sm on sm.product_id = p.id
         where ($1::uuid is null or p.group_id = $1::uuid)
         group by p.id, p.name, p.reference, p.min_stock
       )
       select product_id, product_name, sku, current_stock, minimum_stock
       from stock_position
       where minimum_stock > 0
         and current_stock <= minimum_stock
       order by (minimum_stock - current_stock) desc, product_name asc
       limit $2::int`,
      params
    );

    return rows.map((row) => {
      const currentStock = Number(toNumber(row.current_stock).toFixed(3));
      const minimumStock = Number(toNumber(row.minimum_stock).toFixed(3));
      const status: 'OK' | 'LOW' | 'OUT_OF_STOCK' = currentStock <= 0 ? 'OUT_OF_STOCK' : currentStock <= minimumStock ? 'LOW' : 'OK';
      return {
        productId: row.product_id,
        productName: row.product_name,
        sku: row.sku ?? null,
        currentStock,
        minimumStock,
        status,
      };
    });
  }

  async getSalesByDay(
    filters: DashboardFilterDto,
    comparePrevious = false
  ): Promise<{ items: DashboardSalesByDayItemDto[]; previousItems: DashboardSalesByDayItemDto[] }> {
    const params = buildFilterParams(filters);
    const { rows } = await query<{
      date: string;
      revenue: Decimalish;
      orders: Decimalish;
      average_ticket: Decimalish;
      gross_margin_percentage: Decimalish;
    }>(
      `${FILTERED_SALES_CTE},
       days as (
         select generate_series(
           (select start_date from params),
           (select end_date from params),
           '1 day'::interval
         )::date as day
       ),
       sales_daily as (
         select
           fs.emission_date as day,
           sum(${SALE_REVENUE_SQL}) as revenue,
           count(*) as orders
         from filtered_sales fs
         group by fs.emission_date
       ),
       margin_daily as (
         select
           fs.emission_date as day,
           sum(fsi.item_total) as items_revenue,
           sum(fsi.quantity * coalesce(${ITEM_COST_SQL}, 0)) as cmv
         from filtered_sales fs
         left join filtered_sale_items fsi on fsi.sale_id = fs.id
         group by fs.emission_date
       )
       select
         to_char(days.day, 'YYYY-MM-DD') as date,
         coalesce(sd.revenue, 0) as revenue,
         coalesce(sd.orders, 0) as orders,
         case when coalesce(sd.orders, 0) = 0 then 0 else coalesce(sd.revenue, 0) / sd.orders end as average_ticket,
         case
           when coalesce(md.items_revenue, 0) <= 0 then 0
           else ((coalesce(md.items_revenue, 0) - coalesce(md.cmv, 0)) / md.items_revenue) * 100
         end as gross_margin_percentage
       from days
       left join sales_daily sd on sd.day = days.day
       left join margin_daily md on md.day = days.day
       order by days.day asc`,
      params
    );

    const items = rows.map((row) => ({
      date: row.date,
      revenue: Number(toNumber(row.revenue).toFixed(2)),
      orders: Math.round(toNumber(row.orders)),
      averageTicket: Number(toNumber(row.average_ticket).toFixed(2)),
      grossMarginPercentage: Number(toNumber(row.gross_margin_percentage).toFixed(2)),
    }));

    if (!comparePrevious) {
      return { items, previousItems: [] };
    }

    const previousRows = await query<{
      date: string;
      revenue: Decimalish;
      orders: Decimalish;
      average_ticket: Decimalish;
      gross_margin_percentage: Decimalish;
    }>(
      `${FILTERED_SALES_CTE},
       previous_bounds as (
         select
           (start_date - ((end_date - start_date + 1)::int))::date as previous_start,
           (start_date - 1)::date as previous_end
         from params
       ),
       days as (
         select generate_series(
           (select previous_start from previous_bounds),
           (select previous_end from previous_bounds),
           '1 day'::interval
         )::date as day
       ),
       previous_sales as (
         select
           s.emission_date as day,
           sum(coalesce(s.total, coalesce(s.subtotal, 0) - coalesce(s.discount, 0)) - coalesce(s.refund_amount, 0)) as revenue,
           count(*) as orders
         from sale s
         cross join params p
         cross join previous_bounds pb
         where s.status = 'completed'
           and s.emission_date >= pb.previous_start
           and s.emission_date <= pb.previous_end
           and ($4::text is null or s.store_id = $4::text)
           and ($5::uuid is null or s.seller_id = $5::uuid)
           and ($7::text is null or s.channel = $7::text)
           and ($8::uuid is null or s.payment_term_id = $8::uuid)
           and (
             $6::uuid is null
             or exists (
               select 1
               from sale_item sale_item_filter
               join product product_filter on product_filter.id = sale_item_filter.product_id
               where sale_item_filter.sale_id = s.id
                 and product_filter.group_id = $6::uuid
             )
           )
         group by s.emission_date
       ),
       previous_margin as (
         select
           s.emission_date as day,
           sum(coalesce(si.total, si.quantity * coalesce(si.unit_price, 0))) as items_revenue,
           sum(si.quantity * coalesce(p.cost_price, p.average_cost, p.price_base, 0)) as cmv
         from sale s
         join sale_item si on si.sale_id = s.id
         join product p on p.id = si.product_id
         cross join previous_bounds pb
         where s.status = 'completed'
           and s.emission_date >= pb.previous_start
           and s.emission_date <= pb.previous_end
           and ($4::text is null or s.store_id = $4::text)
           and ($5::uuid is null or s.seller_id = $5::uuid)
           and ($7::text is null or s.channel = $7::text)
           and ($8::uuid is null or s.payment_term_id = $8::uuid)
           and ($6::uuid is null or p.group_id = $6::uuid)
         group by s.emission_date
       )
       select
         to_char(days.day, 'YYYY-MM-DD') as date,
         coalesce(ps.revenue, 0) as revenue,
         coalesce(ps.orders, 0) as orders,
         case when coalesce(ps.orders, 0) = 0 then 0 else coalesce(ps.revenue, 0) / ps.orders end as average_ticket,
         case
           when coalesce(pm.items_revenue, 0) <= 0 then 0
           else ((coalesce(pm.items_revenue, 0) - coalesce(pm.cmv, 0)) / pm.items_revenue) * 100
         end as gross_margin_percentage
       from days
       left join previous_sales ps on ps.day = days.day
       left join previous_margin pm on pm.day = days.day
       order by days.day asc`,
      params
    );

    return {
      items,
      previousItems: previousRows.rows.map((row) => ({
        date: row.date,
        revenue: Number(toNumber(row.revenue).toFixed(2)),
        orders: Math.round(toNumber(row.orders)),
        averageTicket: Number(toNumber(row.average_ticket).toFixed(2)),
        grossMarginPercentage: Number(toNumber(row.gross_margin_percentage).toFixed(2)),
      })),
    };
  }

  async getCategories(filters: DashboardFilterDto, metric: CategoriesMetric): Promise<DashboardCategoriesResponseDto> {
    const params = buildFilterParams(filters);
    const { rows } = await query<{
      category_id: string | null;
      category_name: string | null;
      revenue: Decimalish;
      quantity: Decimalish;
      margin: Decimalish;
    }>(
      `${FILTERED_SALES_CTE}
       select
         fsi.category_id,
         fsi.category_name,
         sum(fsi.item_total) as revenue,
         sum(fsi.quantity) as quantity,
         sum(fsi.item_total - (fsi.quantity * coalesce(${ITEM_COST_SQL}, 0))) as margin
       from filtered_sale_items fsi
       group by fsi.category_id, fsi.category_name
       order by revenue desc`,
      params
    );

    const groupedItems = groupSmallCategories(
      rows.map((row) => ({
        categoryId: row.category_id,
        categoryName: row.category_name,
        revenue: toNumber(row.revenue),
        quantity: toNumber(row.quantity),
        margin: toNumber(row.margin),
      })),
      metric
    );

    return {
      metric,
      items: groupedItems.map((item) => ({
        categoryId: item.categoryId,
        categoryName: item.categoryName,
        value: Number(item.value.toFixed(2)),
        percentage: Number(item.percentage.toFixed(2)),
        revenue: Number(item.revenue.toFixed(2)),
        quantity: Number(item.quantity.toFixed(3)),
        margin: Number(item.margin.toFixed(2)),
      })),
    };
  }

  async getPeakHours(filters: DashboardFilterDto, metric: PeakHoursMetric): Promise<DashboardPeakHoursResponseDto> {
    const params = buildFilterParams(filters);
    const { rows } = await query<{
      weekday: Decimalish;
      hour: Decimalish;
      orders: Decimalish;
      revenue: Decimalish;
    }>(
      `${FILTERED_SALES_CTE}
       select
         extract(isodow from coalesce(fs.paid_at at time zone (select timezone from params), fs.emission_date::timestamp + interval '12 hour')) as weekday,
         extract(hour from coalesce(fs.paid_at at time zone (select timezone from params), fs.emission_date::timestamp + interval '12 hour')) as hour,
         count(*) as orders,
         sum(${SALE_REVENUE_SQL}) as revenue
       from filtered_sales fs
       group by 1, 2
       order by 1 asc, 2 asc`,
      params
    );

    return {
      metric,
      items: rows.map((row) => {
        const weekday = Math.round(toNumber(row.weekday));
        const hour = Math.round(toNumber(row.hour));
        return {
          weekday,
          weekdayName: weekdayNameFromIso(weekday),
          hour,
          orders: Math.round(toNumber(row.orders)),
          revenue: Number(toNumber(row.revenue).toFixed(2)),
        };
      }),
    };
  }

  async getSellerRanking(
    filters: DashboardFilterDto,
    sortBy: SellerRankingSort,
    limit: number
  ): Promise<DashboardSellerRankingItemDto[]> {
    const params = [...buildFilterParams(filters), limit];
    const orderBySql = resolveSellerOrderBy(sortBy);

    const { rows } = await query<{
      seller_id: string | null;
      seller_name: string;
      revenue: Decimalish;
      orders: Decimalish;
      average_ticket: Decimalish;
      gross_margin_percentage: Decimalish;
      participation_percentage: Decimalish;
      rank: Decimalish;
    }>(
      `${FILTERED_SALES_CTE},
       seller_revenue as (
         select
           coalesce(fs.seller_id::text, '__null__') as seller_key,
           fs.seller_id,
           coalesce(seller_ref.name, 'Sem vendedor') as seller_name,
           sum(${SALE_REVENUE_SQL}) as revenue,
           count(*) as orders
         from filtered_sales fs
         left join seller seller_ref on seller_ref.id = fs.seller_id
         group by coalesce(fs.seller_id::text, '__null__'), fs.seller_id, seller_ref.name
       ),
       seller_margin as (
         select
           coalesce(fs.seller_id::text, '__null__') as seller_key,
           sum(fsi.item_total) as items_revenue,
           sum(fsi.quantity * coalesce(${ITEM_COST_SQL}, 0)) as cmv
         from filtered_sales fs
         left join filtered_sale_items fsi on fsi.sale_id = fs.id
         group by coalesce(fs.seller_id::text, '__null__')
       ),
       joined as (
         select
           sr.seller_id,
           sr.seller_name,
           sr.revenue,
           sr.orders,
           case when sr.orders = 0 then 0 else sr.revenue / sr.orders end as average_ticket,
           case
             when coalesce(sm.items_revenue, 0) <= 0 then 0
             else ((coalesce(sm.items_revenue, 0) - coalesce(sm.cmv, 0)) / sm.items_revenue) * 100
           end as gross_margin_percentage
         from seller_revenue sr
         left join seller_margin sm on sm.seller_key = sr.seller_key
       ),
       ranked as (
         select
           j.*,
           case
             when coalesce(sum(j.revenue) over(), 0) <= 0 then 0
             else (j.revenue / sum(j.revenue) over()) * 100
           end as participation_percentage,
           row_number() over (order by ${orderBySql}) as rank
         from joined j
       )
       select
         seller_id,
         seller_name,
         revenue,
         orders,
         average_ticket,
         gross_margin_percentage,
         participation_percentage,
         rank
       from ranked
       order by ${orderBySql}
       limit $9::int`,
      params
    );

    return rows.map((row) => ({
      sellerId: row.seller_id ?? null,
      sellerName: row.seller_name,
      revenue: Number(toNumber(row.revenue).toFixed(2)),
      orders: Math.round(toNumber(row.orders)),
      averageTicket: Number(toNumber(row.average_ticket).toFixed(2)),
      grossMarginPercentage: Number(toNumber(row.gross_margin_percentage).toFixed(2)),
      participationPercentage: Number(toNumber(row.participation_percentage).toFixed(2)),
      rank: Math.round(toNumber(row.rank)),
    }));
  }

  async getProductAbc(
    filters: DashboardFilterDto,
    metric: ProductAbcMetric,
    limit: number,
    offset: number
  ): Promise<DashboardProductAbcResponseDto> {
    const params = [...buildFilterParams(filters), limit, offset];
    const metricExpression = resolveProductMetricExpression(metric);
    const { rows } = await query<{
      product_id: string;
      product_name: string;
      sku: string | null;
      category_name: string;
      quantity_sold: Decimalish;
      revenue: Decimalish;
      margin: Decimalish;
      participation_percentage: Decimalish;
      accumulated_percentage: Decimalish;
      abc_class: 'A' | 'B' | 'C';
      total_count: Decimalish;
    }>(
      `${FILTERED_SALES_CTE},
       product_metrics as (
         select
           fsi.product_id,
           fsi.product_name,
           nullif(trim(fsi.sku), '') as sku,
           fsi.category_name,
           sum(fsi.quantity) as quantity_sold,
           sum(fsi.item_total) as revenue,
           sum(fsi.item_total - (fsi.quantity * coalesce(${ITEM_COST_SQL}, 0))) as margin
         from filtered_sale_items fsi
         group by fsi.product_id, fsi.product_name, fsi.sku, fsi.category_name
       ),
       ranked as (
         select
           pm.*,
           (${metricExpression}) as metric_value,
           sum(${metricExpression}) over () as metric_total,
           sum(${metricExpression}) over (order by ${metricExpression} desc, pm.product_id asc) as metric_accumulated
         from product_metrics pm
       ),
       classified as (
         select
           ranked.*,
           case when metric_total <= 0 then 0 else (metric_value / metric_total) * 100 end as participation_percentage,
           case when metric_total <= 0 then 0 else (metric_accumulated / metric_total) * 100 end as accumulated_percentage
         from ranked
       )
       select
         product_id,
         product_name,
         sku,
         category_name,
         quantity_sold,
         revenue,
         margin,
         participation_percentage,
         accumulated_percentage,
         case
           when accumulated_percentage <= 80 then 'A'
           when accumulated_percentage <= 95 then 'B'
           else 'C'
         end as abc_class,
         count(*) over() as total_count
       from classified
       order by metric_value desc, product_id asc
       limit $9::int
       offset $10::int`,
      params
    );

    return {
      metric,
      total: rows.length > 0 ? Math.round(toNumber(rows[0].total_count)) : 0,
      items: rows.map((row) => ({
        productId: row.product_id,
        productName: row.product_name,
        sku: row.sku ?? null,
        categoryName: row.category_name || 'Sem categoria',
        quantitySold: Number(toNumber(row.quantity_sold).toFixed(3)),
        revenue: Number(toNumber(row.revenue).toFixed(2)),
        margin: Number(toNumber(row.margin).toFixed(2)),
        participationPercentage: Number(toNumber(row.participation_percentage).toFixed(2)),
        accumulatedPercentage: Number(toNumber(row.accumulated_percentage).toFixed(2)),
        abcClass: row.abc_class,
      })),
    };
  }
}
