import { randomUUID } from 'node:crypto';
import type { ErrorRequestHandler, Request } from 'express';
import type { PoolClient } from 'pg';
import { z } from 'zod';
import { query, withTransaction } from '../db.js';
import { badRequest, conflict, forbidden, HttpError, notFound, unauthorized } from '../errors.js';
import { logAudit } from '../utils/audit.js';
import { MAX_CHECKOUT_QUANTITY, MAX_DECIMAL_UNITS } from '../utils/checkout-decimal.js';
import { productCurrentStockSql } from '../utils/stock-sql.js';
import { logger } from '../observability/logger.js';
import { LEGACY_IMPORT_LOCK_KEY } from './legacy-import/execution-lock.js';

export const manualStockAction = 'STOCK_MANUAL_ADJUSTMENT';
export const adjustmentSchema = z
  .object({
    request_id: z.string().uuid(),
    expected_version: z.string().regex(/^\d{1,19}$/),
    new_quantity: z.number().int().min(0).max(MAX_CHECKOUT_QUANTITY),
    reason: z
      .string()
      .trim()
      .min(1)
      .max(1000)
      .refine((value) => !value.includes('\u0000')),
  })
  .strict();
type AdjustmentInput = z.infer<typeof adjustmentSchema>;
type StockActor = { id: string; name: string; role: string };
type StockProduct = {
  id: string;
  legacy_code: string | null;
  name: string;
  current_stock: string;
  stock_version: string;
};
declare global {
  namespace Express {
    interface Request {
      stockAuditDone?: boolean;
      stockAuditContext?: Record<string, unknown>;
    }
  }
}

export async function requireStockActor(
  userId: string | undefined,
  client: PoolClient,
): Promise<StockActor> {
  if (!userId) throw unauthorized();
  const { rows } = await query<StockActor & { permissions: string[]; status: string }>(
    `select u.id,u.full_name as name,r.name as role,r.permissions,u.status
     from app_user u join app_role r on r.id=u.role_id where u.id=$1 for share of u,r`,
    [userId],
    client,
  );
  const actor = rows[0];
  if (!actor || actor.status !== 'active') throw unauthorized();
  if (
    !['admin', 'manager'].includes(actor.role) ||
    !actor.permissions.some((permission) => permission === '*' || permission === 'stock:adjust')
  )
    throw forbidden();
  return { id: actor.id, name: actor.name, role: actor.role };
}

function units(value: string): bigint {
  const match = /^(-?)(\d+)(?:\.(\d{1,3}))?$/.exec(value);
  if (!match) throw badRequest('stock_adjustment_invalid_balance');
  const amount = BigInt(match[2]) * 1000n + BigInt((match[3] ?? '').padEnd(3, '0'));
  return match[1] ? -amount : amount;
}
function quantity(value: bigint): string {
  const positive = value < 0n ? -value : value;
  return `${value < 0n ? '-' : ''}${positive / 1000n}.${String(positive % 1000n).padStart(3, '0')}`;
}

export async function adjustStock(req: Request) {
  if (!req.user) throw unauthorized();
  const productId = z.string().uuid().parse(req.params.id).toLowerCase();
  const input = adjustmentSchema.parse(req.body);
  const response = await withTransaction(async (client) => {
    const actor = await requireStockActor(req.user?.id, client);
    req.stockAuditContext = { actor };
    const available = await query<{ locked: boolean }>(
      'select pg_try_advisory_xact_lock_shared($1) as locked',
      [LEGACY_IMPORT_LOCK_KEY],
      client,
    );
    if (!available.rows[0].locked) throw conflict('stock_adjustment_import_busy');
    const locked = await query(
      'select id from product where id=$1 for no key update',
      [productId],
      client,
    );
    if (!locked.rows.length) throw notFound('stock_adjustment_product_not_found');
    const { rows: products } = await query<StockProduct>(
      `select id,legacy_code,name,${productCurrentStockSql}::text as current_stock,stock_version::text
       from product where id=$1`,
      [productId],
      client,
    );
    const product = products[0];
    req.stockAuditContext = {
      actor,
      product: { id: product.id, code: product.legacy_code, name: product.name },
      previous_quantity: product.current_stock,
    };
    const previous = await query<{ details: Record<string, any> }>(
      'select details from audit_log where id=$1',
      [input.request_id],
      client,
    );
    if (previous.rows.length) {
      const details = previous.rows[0].details ?? {};
      if (
        details.actor?.id !== actor.id ||
        details.product?.id !== productId ||
        details.reason !== input.reason ||
        details.request?.expected_version !== input.expected_version ||
        details.request?.new_quantity !== input.new_quantity ||
        details.result !== 'success'
      )
        throw conflict('stock_adjustment_request_reused');
      return adjustmentResponse(input.request_id, details);
    }
    if (product.stock_version !== input.expected_version)
      throw conflict('stock_adjustment_conflict');
    const difference = BigInt(input.new_quantity) * 1000n - units(product.current_stock);
    if (difference === 0n) throw badRequest('stock_adjustment_no_change');
    if (difference > MAX_DECIMAL_UNITS || difference < -MAX_DECIMAL_UNITS)
      throw badRequest('stock_adjustment_delta_out_of_range');
    const movementId = randomUUID();
    await query(
      `insert into stock_movement(id,product_id,type,quantity,origin)
      values($1,$2,'ajuste_manual',$3,'operational')`,
      [movementId, productId, quantity(difference)],
      client,
    );
    const version = (
      await query<{ stock_version: string }>(
        'select stock_version::text from product where id=$1',
        [productId],
        client,
      )
    ).rows[0].stock_version;
    const details = {
      ...req.stockAuditContext,
      operation: 'manual_stock_adjustment',
      result: 'success',
      new_quantity: quantity(BigInt(input.new_quantity) * 1000n),
      difference: quantity(difference),
      reason: input.reason,
      movement_id: movementId,
      stock_version: version,
      request: input,
    };
    await logAudit({
      eventId: input.request_id,
      userId: actor.id,
      action: manualStockAction,
      details,
      ipAddress: req.ip,
      client,
    });
    return adjustmentResponse(input.request_id, details);
  });
  req.stockAuditDone = true;
  logger.info(
    {
      event: 'manual_stock_adjustment',
      eventId: response.id,
      productId,
      userId: req.user.id,
      result: 'success',
    },
    'Stock adjustment confirmed',
  );
  return response;
}

function adjustmentResponse(id: string, details: Record<string, any>) {
  return {
    id,
    product_id: details.product.id,
    previous_quantity: Number(details.previous_quantity),
    new_quantity: Number(details.new_quantity),
    difference: Number(details.difference),
    stock_version: details.stock_version,
  };
}

export async function recordStockFailure(req: Request, error: unknown): Promise<void> {
  if (req.stockAuditDone) return;
  const target = z
    .string()
    .uuid()
    .safeParse(req.params.id ?? req.originalUrl.match(/products\/([^/]+)\/stock-adjustments/)?.[1]);
  let context = req.stockAuditContext;
  if (!context?.product && target.success) {
    const { rows } = await query<StockProduct>(
      `select id,legacy_code,name,${productCurrentStockSql}::text as current_stock
      from product where id=$1`,
      [target.data],
    );
    if (rows[0])
      context = {
        ...context,
        product: { id: rows[0].id, code: rows[0].legacy_code, name: rows[0].name },
        previous_quantity: rows[0].current_stock,
      };
  }
  const body = req.body as Partial<AdjustmentInput> | undefined;
  const actor = req.user
    ? (
        await query<StockActor>(
          `select u.id,u.full_name as name,r.name as role
    from app_user u left join app_role r on r.id=u.role_id where u.id=$1`,
          [req.user.id],
        )
      ).rows[0]
    : null;
  const eventId = randomUUID();
  await logAudit({
    eventId,
    userId: actor?.id ?? null,
    action: manualStockAction,
    ipAddress: req.ip,
    details: {
      ...context,
      actor: actor ?? null,
      operation: 'manual_stock_adjustment',
      result: 'failure',
      product_id: target.success ? target.data : null,
      new_quantity: context?.previous_quantity ?? null,
      difference: '0.000',
      requested_quantity:
        typeof body?.new_quantity === 'number' && Number.isFinite(body.new_quantity)
          ? body.new_quantity
          : null,
      reason:
        typeof body?.reason === 'string'
          ? body.reason.replaceAll('\u0000', '').slice(0, 1000)
          : null,
      error_code:
        error instanceof HttpError
          ? error.message
          : error instanceof z.ZodError
            ? 'validation_failed'
            : 'internal_error',
      request_id: req.requestId ?? null,
      client_request_id: z.string().uuid().safeParse(body?.request_id).success
        ? body?.request_id
        : null,
    },
  });
  req.stockAuditDone = true;
  logger.warn(
    {
      event: 'manual_stock_adjustment',
      eventId,
      result: 'failure',
      userId: req.user?.id,
      productId: target.success ? target.data : null,
    },
    'Stock adjustment rejected',
  );
}

export const stockFailureAuditMiddleware: ErrorRequestHandler = (error, req, _res, next) => {
  if (
    req.method !== 'POST' ||
    !/^\/api\/v1\/products\/[^/]+\/stock-adjustments\/?(?:\?|$)/.test(req.originalUrl) ||
    req.stockAuditDone
  )
    return next(error);
  void recordStockFailure(req, error)
    .then(() => next(error))
    .catch((auditError: unknown) => {
      logger.error(
        { event: 'stock_adjustment_audit_unavailable', error: String(auditError) },
        'Stock audit could not be persisted',
      );
      next(new HttpError(503, 'stock_adjustment_audit_unavailable'));
    });
};

export const stockHistorySql = `select id,created_at,details->'product'->>'id' as product_id,
 details->'product'->>'code' as product_code,details->'product'->>'name' as product_name,
 details->'actor'->>'id' as user_id,details->'actor'->>'name' as user_name,details->'actor'->>'role' as role,
 (details->>'previous_quantity')::numeric as previous_quantity,(details->>'new_quantity')::numeric as new_quantity,
 (details->>'difference')::numeric as difference,details->>'reason' as reason,
 case when (details->>'difference')::numeric>0 then 'increase' else 'decrease' end as movement_type
 from audit_log where action='STOCK_MANUAL_ADJUSTMENT' and details->>'result'='success'`;
