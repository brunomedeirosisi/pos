import { mapBackupRow } from "../modules/backup/application/backup-use-cases.js";
import type { BackupRow } from "../modules/backup/repository/backup-repository.js";
import { Router, type Request } from "express";
import { z } from "zod";
import { query, withTransaction } from "../db.js";
import { badRequest, notFound } from "../errors.js";
import { requirePermission } from "../middleware/auth.js";
import { asyncHandler } from "../utils/async-handler.js";
import { pageQuerySchema, queryPage } from "../utils/query-page.js";
import {
  mapSale,
  type SaleRecord,
} from "../modules/sales/domain/sales-domain.js";
import { mapPaymentRecord } from "../modules/customer-payments/application/customer-payments-use-cases.js";
import { PgCustomerPaymentsRepository } from "../modules/customer-payments/repository/customer-payments-repository.js";
import {
  customerBalance,
  legacyBalanceFields,
} from "../modules/customer-payments/domain/customer-balance.js";
import type { PaymentHistoryRecord } from "../modules/customer-payments/repository/payment-history-repository.js";
import { getEnv } from "../config/env.js";

// Separate read contracts preserve existing array endpoints and all mutation routes.
export const listsRouter = Router();
const uuid = z.string().uuid();
const filtersSchema = z.object({
  search: z.string().trim().max(200).optional(),
  id: uuid.optional(),
  optionId: z.string().max(200).optional(),
  from: z.string().date().optional(),
  to: z.string().date().optional(),
  seller_id: uuid.optional(),
  customer_id: uuid.optional(),
  payment_term_id: uuid.optional(),
  received_by: uuid.optional(),
  roleId: uuid.optional(),
  saleId: uuid.optional(),
  sessionId: z.string().min(1).max(200).optional(),
  start_date: z.string().date().optional(),
  end_date: z.string().date().optional(),
  method: z.enum(["cash", "card", "bank", "other", "legacy"]).optional(),
  sort: z.enum(["asc", "desc"]).optional(),
  enabled: z.enum(["true", "false"]).optional(),
});
type Filters = z.infer<typeof filtersSchema>;
type Config = {
  permissions: string[];
  sql: string;
  searches?: string[];
  sorts: Record<string, string>;
  defaultSort: string;
  defaultOrder?: "asc" | "desc";
  filters?: Partial<Record<keyof Filters, string>>;
  required?: (keyof Filters)[];
  conditions?: string[];
  itemExpression?: string;
  tieBreaker?: string;
  map?: (row: Record<string, any>) => unknown;
};

const catalog = (
  table: string,
  fields: string,
  searches = ["name", "legacy_code"],
): Config => ({
  permissions: ["catalog:read"],
  sql: `select ${fields} from ${table}`,
  searches,
  sorts: { name: "lower(name)", legacy_code: "legacy_code" },
  defaultSort: "name",
});
const saleSql = `select s.*, seller.name as seller_name, c.name as customer_name, pt.name as payment_term_name,
  case when s.source in ('VENDAS','PEDIDOS') then null
    else greatest(coalesce(s.total,0)-coalesce(s.amount_paid,0),0) end as pending_amount,
  (select coalesce(jsonb_agg(jsonb_build_object('id',si.id,'product_id',si.product_id,
    'product_name',p.name,'quantity',si.quantity,'unit_price',si.unit_price,'total',si.total)
    order by p.name,si.id),'[]'::jsonb) from sale_item si left join product p on p.id=si.product_id
    where si.sale_id=s.id) as items
  from sale s left join seller on seller.id=s.seller_id left join customer c on c.id=s.customer_id
  left join payment_term pt on pt.id=s.payment_term_id`;
const paymentSql = `select p.id,p.customer_id,c.name as customer_name,p.amount,p.payment_date,p.method,
  p.reference,p.notes,p.received_by,u.full_name as received_by_name,p.source,p.created_at,
  p.cancelled_at,p.cancelled_by,actor.full_name as cancelled_by_name,p.cancellation_reason
  from customer_payment p join customer c on c.id=p.customer_id
  left join app_user u on u.id=p.received_by left join app_user actor on actor.id=p.cancelled_by`;
const saleFilters = {
  from: "emission_date >=",
  to: "emission_date <=",
  seller_id: "seller_id =",
  customer_id: "customer_id =",
  payment_term_id: "payment_term_id =",
};
const sales: Config = {
  permissions: ["sales:read"],
  sql: saleSql,
  filters: saleFilters,
  sorts: {
    emission_date: "emission_date",
    total: "total",
    order_number: "order_number",
  },
  defaultSort: "emission_date",
  defaultOrder: "desc",
  map: (row) => ({
    ...mapSale(row as SaleRecord),
    seller_name: row.seller_name,
    customer_name: row.customer_name,
    payment_term_name: row.payment_term_name,
  }),
};
const payments: Config = {
  permissions: ["catalog:read"],
  sql: paymentSql,
  filters: {
    from: "payment_date >=",
    to: "payment_date <=",
    customer_id: "customer_id =",
    received_by: "received_by =",
  },
  sorts: {
    payment_date: "payment_date",
    amount: "amount",
    created_at: "created_at",
  },
  defaultSort: "payment_date",
  defaultOrder: "desc",
  map: (row) => ({
    ...mapPaymentRecord(row as PaymentHistoryRecord),
    customer_id: row.customer_id,
    customer_name: row.customer_name,
  }),
};
const configs: Record<string, Config> = {
  products: catalog(
    "product",
    "id,legacy_code,name,barcode,group_id,reference,min_stock,price_cash,price_base,(select pg.name from product_group pg where pg.id=product.group_id) as group_name",
    ["name", "legacy_code", "barcode"],
  ),
  "product-groups": catalog("product_group", "id,legacy_code,name"),
  customers: catalog(
    "customer",
    "id,legacy_code,name,cpf,address,city,uf,cep,phone,status,credit_limit,notes",
    ["name", "legacy_code", "cpf"],
  ),
  sellers: {
    ...catalog("seller", "id,legacy_code,name"),
    permissions: ["catalog:read", "users:write"],
  },
  "payment-terms": catalog("payment_term", "id,legacy_code,name"),
  sales,
  payments,
  "customer-sales": {
    ...sales,
    required: ["customer_id"],
    conditions: ["status != 'draft'"],
  },
  "customer-payments": {
    ...payments,
    required: ["customer_id"],
    conditions: ["cancelled_at is null"],
    filters: {
      customer_id: "customer_id =",
      start_date: "payment_date >=",
      end_date: "payment_date <=",
      method: "method =",
    },
  },
  "customer-activity": {
    permissions: ["catalog:read"],
    required: ["customer_id"],
    filters: { customer_id: "customer_id =" },
    sql: `select id,customer_id,emission_date as activity_date,'sale'::text as kind,null::date as payment_date,null::text as method
      from sale where status!='draft' union all
      select id,customer_id,coalesce(payment_date,created_at::date),'payment',payment_date,method
      from customer_payment where cancelled_at is null`,
    sorts: { date: "activity_date" },
    defaultSort: "date",
    defaultOrder: "desc",
    tieBreaker: "kind desc,id",
    itemExpression: `to_jsonb(entry) || case when kind='sale' then jsonb_build_object('sale',
      (select to_jsonb(detail) from (${saleSql}) detail where detail.id=entry.id))
      else jsonb_build_object('payment',(select to_jsonb(detail) from (${paymentSql}) detail where detail.id=entry.id)) end`,
    map: (row) =>
      row.kind === "sale"
        ? { ...row, sale: sales.map!(row.sale) }
        : { ...row, payment: payments.map!(row.payment) },
  },
  users: {
    permissions: ["users:read"],
    sql: `select u.id,u.email,u.full_name as "fullName",u.status,u.last_login_at as "lastLoginAt",
      u.created_at as "createdAt",u.updated_at as "updatedAt",
      case when r.id is null then null else jsonb_build_object('id',r.id,'name',r.name,
        'discountLimit',coalesce(r.discount_limit,0),'permissions',r.permissions) end as role,
      coalesce(r.permissions,'[]'::jsonb) as permissions from app_user u left join app_role r on r.id=u.role_id`,
    searches: ['"fullName"', "email"],
    sorts: { name: 'lower("fullName")', email: "lower(email)" },
    defaultSort: "name",
  },
  roles: {
    permissions: ["roles:read", "roles:write", "users:read", "users:write"],
    sql: 'select id,name,description,permissions,coalesce(discount_limit,0) as "discountLimit" from app_role',
    searches: ["name"],
    sorts: { name: "lower(name)" },
    defaultSort: "name",
  },
  "role-users": {
    permissions: ["users:read", "users:write"],
    required: ["roleId"],
    filters: { roleId: "role_id =" },
    sql: `select u.id,u.full_name as "fullName",u.email,u.status,u.role_id,
      case when s.id is null then null else jsonb_build_object('id',s.id,'name',s.name,'legacy_code',s.legacy_code) end as seller,
      coalesce(us.automatic,false) as automatic from app_user u
      left join user_seller us on us.user_id=u.id left join seller s on s.id=us.seller_id`,
    searches: ['"fullName"', "email"],
    sorts: { name: 'lower("fullName")', email: "email" },
    defaultSort: "name",
  },
  receivers: {
    permissions: ["catalog:read"],
    sql: `select id,full_name from app_user u
      where exists(select 1 from customer_payment p where p.received_by=u.id)`,
    searches: ["full_name"],
    sorts: { name: "lower(full_name)" },
    defaultSort: "name",
  },
  backups: {
    permissions: ["system:backup:read"],
    sql: "select b.id,b.filename,b.size_bytes,b.created_at,b.checksum,b.metadata,u.id as created_by_id,u.full_name as created_by_full_name from system_backup b left join app_user u on u.id=b.created_by",
    map: (row) => mapBackupRow(row as BackupRow),
    searches: ["filename"],
    sorts: { created_at: "created_at", filename: "filename" },
    defaultSort: "created_at",
    defaultOrder: "desc",
  },
  printers: {
    permissions: ["sales:read", "printers:manage"],
    sql: `select p.id,p.display_name,p.enabled,p.created_at,p.revoked_at,s.last_seen_at,
      coalesce(s.last_seen_at>now()-interval '30 seconds',false) as online
      from print_printer p left join print_agent_state s on s.printer_id=p.id`,
    searches: ["display_name"],
    filters: { enabled: "enabled =" },
    sorts: { created_at: "created_at", name: "lower(display_name)" },
    defaultSort: "created_at",
  },
  "print-jobs": {
    permissions: ["sales:read"],
    required: ["saleId"],
    filters: { saleId: "sale_id =" },
    sql: `select id,id as job_id,printer_id,printer_name,sale_id,status,copies,receipt_code,
      requested_at,started_at,finished_at,result_code from print_job`,
    sorts: { requested_at: "requested_at" },
    defaultSort: "requested_at",
    defaultOrder: "desc",
  },
  "legacy-logs": {
    permissions: ["system:import:legacy"],
    required: ["sessionId"],
    filters: { sessionId: "session_id =" },
    sql: `select l.id,l.level,l.message,l.created_at,i.session_id from system_legacy_import_log l
      join system_legacy_import i on i.id=l.import_id`,
    sorts: { created_at: "created_at" },
    defaultSort: "created_at",
  },
  "legacy-warnings": {
    permissions: ["system:import:legacy"],
    required: ["sessionId"],
    filters: { sessionId: "session_id =" },
    sql: `select warning.ordinality as id,warning.message,i.session_id from system_legacy_import i
      cross join lateral jsonb_array_elements_text(coalesce(i.summary->'sales'->'mismatches','[]'::jsonb))
      with ordinality as warning(message,ordinality)`,
    searches: ["message"],
    sorts: { id: "id" },
    defaultSort: "id",
  },
};

for (const [resource, source] of Object.entries({
  "dashboard-sellers": "sellers",
  "dashboard-categories": "product-groups",
  "dashboard-payment-terms": "payment-terms",
})) {
  configs[resource] = {
    ...configs[source],
    permissions: ["sales:read", "reports:view"],
  };
}
configs["dashboard-stores"] = {
  permissions: ["sales:read", "reports:view"],
  sql: `select distinct trim(store_id) as id,trim(store_id) as name from sale where nullif(trim(store_id),'') is not null`,
  searches: ["name"],
  sorts: { name: "name" },
  defaultSort: "name",
};
function parseFilters(req: Request) {
  const filters = filtersSchema.parse(req.query);
  if (
    (filters.from && filters.to && filters.from > filters.to) ||
    (filters.start_date &&
      filters.end_date &&
      filters.start_date > filters.end_date)
  ) {
    throw badRequest("invalid_date_range");
  }
  return filters;
}

for (const [resource, config] of Object.entries(configs)) {
  listsRouter.get(
    `/${resource}`,
    requirePermission(...config.permissions),
    asyncHandler(async (req, res) => {
      const input = pageQuerySchema.parse(req.query);
      const filters = parseFilters(req);
      if (filters.sort && !input.sortOrder) input.sortOrder = filters.sort;
      for (const key of config.required ?? [])
        if (!filters[key]) throw badRequest(`missing_${key}`);
      const params: unknown[] = [];
      const conditions = [...(config.conditions ?? [])];
      const bind = (value: unknown) => {
        params.push(value);
        return `$${params.length}`;
      };
      if (filters.search && config.searches?.length) {
        const parameter = bind(`%${filters.search}%`);
        conditions.push(
          `(${config.searches.map((column) => `${column} ilike ${parameter}`).join(" or ")})`,
        );
      }
      if (filters.id) conditions.push(`id=${bind(filters.id)}`);
      if (filters.optionId)
        conditions.push(`id::text=${bind(filters.optionId)}`);
      for (const [key, expression] of Object.entries(config.filters ?? {})) {
        const value = filters[key as keyof Filters];
        if (value !== undefined)
          conditions.push(`${expression} ${bind(value)}`);
      }
      if (resource === "printers" && getEnv().PRINT_MODE !== "queue")
        conditions.push("false");
      if (resource === "customer-activity") {
        const permissions = req.user?.permissions ?? [];
        if (!permissions.includes("*") && !permissions.includes("sales:read"))
          conditions.push("kind='payment'");
        const paymentConditions: string[] = [];
        if (filters.start_date)
          paymentConditions.push(`payment_date >= ${bind(filters.start_date)}`);
        if (filters.end_date)
          paymentConditions.push(`payment_date <= ${bind(filters.end_date)}`);
        if (filters.method)
          paymentConditions.push(`method = ${bind(filters.method)}`);
        if (paymentConditions.length)
          conditions.push(
            `(kind='sale' or (${paymentConditions.join(" and ")}))`,
          );
      }
      if (resource === "role-users") {
        if (
          !(
            await query("select id from app_role where id=$1", [filters.roleId])
          ).rowCount
        )
          throw notFound("role not found");
      }
      const pageOptions = {
        ...config,
        input,
        params,
        sql: `select * from (${config.sql}) dataset ${conditions.length ? `where ${conditions.join(" and ")}` : ""}`,
      };
      if (resource === "customer-payments") {
        const result = await withTransaction(async (client) => {
          await query(
            "set transaction isolation level repeatable read read only",
            [],
            client,
          );
          const repository = new PgCustomerPaymentsRepository();
          if (
            !(await repository.customerExists(
              filters.customer_id!,
              undefined,
              client,
            ))
          )
            throw notFound("customer not found");
          const totals = await repository.getCustomerFinancialTotals(
            filters.customer_id!,
            client,
          );
          const page = await queryPage<Record<string, any>>({
            ...pageOptions,
            client,
            aggregates: { amount: "coalesce(sum(amount),0)" },
          });
          return {
            ...page,
            items: page.items.map(config.map!),
            summary: {
              total_debt: totals.totalCharges,
              total_paid: totals.totalPaid,
              ...legacyBalanceFields(totals),
              current_balance: customerBalance(totals),
              filtered_total_paid: Number(page.totals?.amount ?? 0),
              filtered_count: page.pagination.totalItems,
              applied_filters: {
                start_date: filters.start_date ?? null,
                end_date: filters.end_date ?? null,
                method: filters.method ?? null,
                sort: input.sortOrder ?? "desc",
              },
            },
          };
        });
        res.set("Cache-Control", "no-store").json(result);
        return;
      }
      const page = await queryPage<Record<string, any>>(pageOptions);
      res
        .set("Cache-Control", "no-store")
        .json({
          ...page,
          items: config.map ? page.items.map(config.map) : page.items,
        });
    }),
  );
}
