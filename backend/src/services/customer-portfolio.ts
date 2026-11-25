import { query } from "../db.js";
import type { AuthenticatedUser } from "../modules/auth/domain/auth-types.js";
import type { PoolClient } from "pg";

export function canReadCustomerFinancials(
  user: AuthenticatedUser | undefined,
): boolean {
  return Boolean(user && ["admin", "manager"].includes(user.role));
}

/** Reuse the authoritative balance view; all money arithmetic remains PostgreSQL NUMERIC. */
export async function getCustomerOverview(
  includeFinancials: boolean,
  client?: PoolClient,
) {
  if (!includeFinancials) {
    const { rows } = await query<{ total_customers: number }>(
      "select count(*)::int as total_customers from customer",
      [],
      client,
    );
    return rows[0];
  }
  const { rows } = await query<{
    total_customers: number;
    customers_with_debt: number;
    customers_without_debt: number;
    customers_with_credit: number;
    total_debt: string;
    total_credit: string;
    debt_percentage: string;
    average_debt: string;
    largest_debt: string;
  }>(
    `select count(*)::int as total_customers,
      count(*) filter(where current_balance > 0)::int as customers_with_debt,
      count(*) filter(where current_balance = 0)::int as customers_without_debt,
      count(*) filter(where current_balance < 0)::int as customers_with_credit,
      coalesce(sum(current_balance) filter(where current_balance > 0),0)::text as total_debt,
      coalesce(-sum(current_balance) filter(where current_balance < 0),0)::text as total_credit,
      round(coalesce(100.0 * count(*) filter(where current_balance > 0) / nullif(count(*),0),0),2)::text as debt_percentage,
      round(coalesce(avg(current_balance) filter(where current_balance > 0),0),2)::text as average_debt,
      coalesce(max(current_balance) filter(where current_balance > 0),0)::text as largest_debt
    from customer_financial_totals`,
    [],
    client,
  );
  const row = rows[0];
  return {
    total_customers: row.total_customers,
    financial: {
      customers_with_debt: row.customers_with_debt,
      customers_without_debt: row.customers_without_debt,
      customers_with_credit: row.customers_with_credit,
      total_debt: Number(row.total_debt),
      total_credit: Number(row.total_credit),
      debt_percentage: Number(row.debt_percentage),
      average_debt: Number(row.average_debt),
      largest_debt: Number(row.largest_debt),
    },
  };
}
