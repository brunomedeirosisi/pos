import { Router } from 'express';
import { z } from 'zod';
import { query, withTransaction } from '../db.js';
import { asyncHandler } from '../utils/async-handler.js';
import { badRequest, notFound } from '../errors.js';
import { requirePermission } from '../middleware/auth.js';

export const router = Router();

const listQuerySchema = z.object({
  search: z
    .string()
    .transform((value) => value.trim())
    .pipe(z.string().min(1))
    .optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
});

const statusSchema = z.enum(['active', 'delinquent', 'inactive']).optional();

type CustomerDetailsRow = {
  id: string;
  legacy_code: string | null;
  name: string;
  cpf: string | null;
  address: string | null;
  city: string | null;
  uf: string | null;
  cep: string | null;
  phone: string | null;
  status: string;
  credit_limit: string | number | null;
  notes: string | null;
  total_charges: string | null;
  total_payments: string | null;
  last_payment_date: string | null;
};

const paymentMethodValues = ['cash', 'card', 'bank', 'other'] as const;
const paymentMethodFilterValues = [...paymentMethodValues, 'legacy'] as const;
const paymentMethodSchema = z.enum(paymentMethodValues);
const paymentMethodFilterSchema = z.enum(paymentMethodFilterValues);

const optionalDateSchema = z
  .preprocess((value) => {
    if (value === undefined || value === null || value === '') {
      return undefined;
    }
    if (value instanceof Date) {
      return value;
    }
    const parsed = new Date(String(value));
    return Number.isNaN(parsed.getTime()) ? value : parsed;
  }, z.date())
  .optional();

const paymentInputSchema = z.object({
  amount: z.preprocess(parseDecimalInput, z.number().positive()),
  payment_date: optionalDateSchema,
  method: paymentMethodSchema.optional(),
  reference: z
    .string()
    .trim()
    .max(120)
    .optional()
    .nullable(),
  notes: z
    .string()
    .trim()
    .max(500)
    .optional()
    .nullable(),
});

const paymentListQuerySchema = z
  .object({
    start_date: optionalDateSchema,
    end_date: optionalDateSchema,
    method: paymentMethodFilterSchema.optional(),
    sort: z.enum(['asc', 'desc']).optional(),
  })
  .refine(
    (value) => {
      if (!value.start_date || !value.end_date) return true;
      return value.start_date <= value.end_date;
    },
    { message: 'start_date must be before end_date', path: ['start_date'] }
  );

const OVERPAY_TOLERANCE = 0.005;

function parseDecimalInput(value: unknown) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value === 'number') return value;
  if (typeof value !== 'string') return value;

  const trimmed = value.trim();
  if (!trimmed) return null;

  let normalized = trimmed.replace(/\s+/g, '');
  normalized = normalized.replace(/[^0-9.,+-]/g, '');

  const commaPos = normalized.lastIndexOf(',');
  const dotPos = normalized.lastIndexOf('.');
  if (commaPos > -1 && dotPos > -1) {
    if (commaPos > dotPos) {
      normalized = normalized.replace(/\./g, '');
    } else {
      normalized = normalized.replace(/,/g, '');
    }
  }

  normalized = normalized.replace(',', '.');
  const parsed = Number(normalized);
  return Number.isNaN(parsed) ? value : parsed;
}

const numericField = z.preprocess(parseDecimalInput, z.number().nonnegative().nullable().optional());

function normalizeOptionalText(value: string | null | undefined): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function toNumber(value: string | number | null | undefined): number {
  if (value == null) return 0;
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toDateOnly(value: unknown): string | null {
  if (value == null) return null;
  if (value instanceof Date) {
    return value.toISOString().split('T')[0];
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
      return trimmed.slice(0, 10);
    }
    const parsed = new Date(trimmed);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().split('T')[0];
  }
  return null;
}

function toIsoString(value: unknown): string | null {
  if (value == null) return null;
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === 'string') {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  }
  return null;
}

function getCompanyInfo() {
  return {
    name: process.env.COMPANY_NAME || 'Magazine Medeiros',
    address: process.env.COMPANY_ADDRESS || 'Rua Principal, 123',
    tax_id: process.env.COMPANY_TAX_ID || 'N/A',
  };
}

function buildPaymentFilterClauses(customerId: string, filters: z.infer<typeof paymentListQuerySchema>) {
  const params: unknown[] = [customerId];
  const conditions = ['p.customer_id = $1'];

  if (filters.start_date) {
    params.push(filters.start_date);
    conditions.push(`p.payment_date >= $${params.length}`);
  }
  if (filters.end_date) {
    params.push(filters.end_date);
    conditions.push(`p.payment_date <= $${params.length}`);
  }
  if (filters.method) {
    params.push(filters.method);
    conditions.push(`p.method = $${params.length}`);
  }

  const whereClause = conditions.length ? `where ${conditions.join(' and ')}` : '';
  return { whereClause, params };
}

const baseSchema = z.object({
  legacy_code: z
    .string()
    .trim()
    .min(1)
    .optional()
    .nullable(),
  name: z
    .string()
    .trim()
    .min(1),
  cpf: z
    .string()
    .trim()
    .min(1)
    .optional()
    .nullable(),
  address: z
    .string()
    .trim()
    .min(1)
    .optional()
    .nullable(),
  city: z
    .string()
    .trim()
    .min(1)
    .optional()
    .nullable(),
  uf: z
    .string()
    .trim()
    .length(2)
    .transform((value) => value.toUpperCase())
    .optional()
    .nullable(),
  cep: z
    .string()
    .trim()
    .min(1)
    .optional()
    .nullable(),
  phone: z
    .string()
    .trim()
    .min(1)
    .optional()
    .nullable(),
  status: statusSchema,
  credit_limit: numericField,
  notes: z
    .string()
    .trim()
    .optional()
    .nullable(),
});

router.get(
  '/',
  requirePermission('catalog:read'),
  asyncHandler(async (req, res) => {
    const { search, limit = 100 } = listQuerySchema.parse(req.query);

    const params: unknown[] = [];
    let whereClause = '';

    if (search) {
      const likeValue = `%${search}%`;
      params.push(likeValue, likeValue, likeValue);
      const nameParam = params.length - 2;
      const legacyParam = params.length - 1;
      const docParam = params.length;
      whereClause = `where name ilike $${nameParam} or coalesce(legacy_code, '') ilike $${legacyParam} or coalesce(cpf, '') ilike $${docParam}`;
    }

    params.push(limit);
    const limitParam = params.length;

    const { rows } = await query(
      `select id, legacy_code, name, cpf, address, city, uf, cep, phone, status, credit_limit, notes
       from customer
       ${whereClause}
       order by name asc
       limit $${limitParam}`,
      params
    );
    res.json(rows);
  })
);

router.post(
  '/',
  requirePermission('catalog:write'),
  asyncHandler(async (req, res) => {
    const body = baseSchema.parse(req.body);
    const { rows } = await query(
      `insert into customer (legacy_code, name, cpf, address, city, uf, cep, phone, status, credit_limit, notes)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       returning id, legacy_code, name, cpf, address, city, uf, cep, phone, status, credit_limit, notes`,
      [
        body.legacy_code ?? null,
        body.name,
        body.cpf ?? null,
        body.address ?? null,
        body.city ?? null,
        body.uf ?? null,
        body.cep ?? null,
        body.phone ?? null,
        body.status ?? 'active',
        body.credit_limit ?? null,
        body.notes ?? null,
      ]
    );

    res.status(201).json(rows[0]);
  })
);

router.get(
  '/:id',
  requirePermission('catalog:read'),
  asyncHandler(async (req, res) => {
    const { rows } = await query<CustomerDetailsRow>(
      `select
         c.id,
         c.legacy_code,
         c.name,
         c.cpf,
         c.address,
         c.city,
         c.uf,
         c.cep,
         c.phone,
         c.status,
         c.credit_limit,
         c.notes,
         coalesce(charges.total_charges, 0) as total_charges,
         coalesce(payments.total_payments, 0) as total_payments,
         payments.last_payment_date
       from customer c
       left join lateral (
         select coalesce(sum(s.total), 0) as total_charges
         from sale s
         where s.customer_id = c.id and s.status = 'completed'
       ) as charges on true
       left join lateral (
         select coalesce(sum(p.amount), 0) as total_payments, max(p.payment_date) as last_payment_date
         from customer_payment p
         where p.customer_id = c.id
       ) as payments on true
       where c.id = $1`,
      [req.params.id]
    );
    const customer = rows[0];
    if (!customer) {
      throw notFound('customer not found');
    }
    const { total_charges, total_payments, last_payment_date, ...base } = customer;
    const charges = toNumber(total_charges);
    const payments = toNumber(total_payments);
    const balance = Number((charges - payments).toFixed(2));

    res.json({
      ...base,
      totals: {
        total_charges: charges,
        total_payments: payments,
        current_balance: balance,
        last_payment_date,
      },
    });
  })
);

router.get(
  '/:id/payments',
  requirePermission('catalog:read'),
  asyncHandler(async (req, res) => {
    const customerId = req.params.id;
    const filters = paymentListQuerySchema.parse(req.query);
    const orderDirection = filters.sort ?? 'desc';

    const response = await withTransaction(async (client) => {
      const { rowCount: customerExists } = await query('select 1 from customer where id = $1 for share', [customerId], client);
      if (customerExists === 0) {
        throw notFound('customer not found');
      }

      const [{ total: totalChargesRaw }] = (
        await query<{ total: string | null }>(
          `select coalesce(sum(total), 0) as total
           from sale
           where customer_id = $1 and status = 'completed'`,
          [customerId],
          client
        )
      ).rows;

      const [{ total: totalPaidRaw }] = (
        await query<{ total: string | null }>(
          `select coalesce(sum(amount), 0) as total
           from customer_payment
           where customer_id = $1`,
          [customerId],
          client
        )
      ).rows;

      const totalDebt = toNumber(totalChargesRaw);
      const totalPaid = toNumber(totalPaidRaw);
      const currentBalance = Number((totalDebt - totalPaid).toFixed(2));

      const { whereClause, params } = buildPaymentFilterClauses(customerId, filters);

      const { rows } = await query<{
        id: string;
        amount: string | number;
        payment_date: string | Date | null;
        method: string | null;
        reference: string | null;
        notes: string | null;
        received_by: string | null;
        received_by_name: string | null;
        source: string;
        created_at: string | Date | null;
      }>(
        `select
           p.id,
           p.amount,
           p.payment_date,
           p.method,
           p.reference,
           p.notes,
           p.received_by,
           u.full_name as received_by_name,
           p.source,
           p.created_at
         from customer_payment p
         left join app_user u on u.id = p.received_by
         ${whereClause}
         order by p.payment_date ${orderDirection}, p.created_at ${orderDirection}`,
        params,
        client
      );

      const formatted = rows.map((row) => ({
        id: row.id,
        amount: toNumber(row.amount),
        payment_date: toDateOnly(row.payment_date),
        method: (row.method as (typeof paymentMethodFilterValues)[number]) ?? 'cash',
        reference: row.reference ?? null,
        notes: row.notes ?? null,
        received_by: row.received_by,
        received_by_name: row.received_by_name ?? null,
        source: row.source,
        created_at: toIsoString(row.created_at),
      }));

      const { rows: filteredAgg } = await query<{ total: string | null; count: string | number | null }>(
        `select coalesce(sum(p.amount), 0) as total, count(*) as count
         from customer_payment p
         ${whereClause}`,
        params,
        client
      );

      const filteredTotal = toNumber(filteredAgg[0]?.total ?? 0);
      const filteredCount = Number(filteredAgg[0]?.count ?? 0);

      return {
        payments: formatted,
        summary: {
          total_debt: totalDebt,
          total_paid: totalPaid,
          current_balance: currentBalance,
          filtered_total_paid: filteredTotal,
          filtered_count: filteredCount,
          applied_filters: {
            start_date: toDateOnly(filters.start_date),
            end_date: toDateOnly(filters.end_date),
            method: filters.method ?? null,
            sort: orderDirection,
          },
        },
      };
    });

    res.json(response);
  })
);

router.get(
  '/:id/payments/report',
  requirePermission('catalog:read'),
  asyncHandler(async (req, res) => {
    const customerId = req.params.id;
    const filters = paymentListQuerySchema.parse(req.query);
    const orderDirection = filters.sort ?? 'desc';

    const report = await withTransaction(async (client) => {
      const { rows: customerRows } = await query<{
        id: string;
        legacy_code: string | null;
        name: string;
        cpf: string | null;
        address: string | null;
        city: string | null;
        uf: string | null;
        cep: string | null;
        phone: string | null;
      }>('select * from customer where id = $1 for share', [customerId], client);

      const customer = customerRows[0];
      if (!customer) {
        throw notFound('customer not found');
      }

      const [{ total: totalChargesRaw }] = (
        await query<{ total: string | null }>(
          `select coalesce(sum(total), 0) as total
           from sale
           where customer_id = $1 and status = 'completed'`,
          [customerId],
          client
        )
      ).rows;

      const [{ total: totalPaidRaw }] = (
        await query<{ total: string | null }>(
          `select coalesce(sum(amount), 0) as total
           from customer_payment
           where customer_id = $1`,
          [customerId],
          client
        )
      ).rows;

      const totalDebt = toNumber(totalChargesRaw);
      const totalPaid = toNumber(totalPaidRaw);
      const currentBalance = Number((totalDebt - totalPaid).toFixed(2));

      const { whereClause, params } = buildPaymentFilterClauses(customerId, filters);

      const { rows } = await query<{
        id: string;
        amount: string | number;
        payment_date: string | Date | null;
        method: string | null;
        reference: string | null;
        notes: string | null;
        received_by: string | null;
        received_by_name: string | null;
        source: string;
        created_at: string | Date | null;
      }>(
        `select
           p.id,
           p.amount,
           p.payment_date,
           p.method,
           p.reference,
           p.notes,
           p.received_by,
           u.full_name as received_by_name,
           p.source,
           p.created_at
         from customer_payment p
         left join app_user u on u.id = p.received_by
         ${whereClause}
         order by p.payment_date ${orderDirection}, p.created_at ${orderDirection}`,
        params,
        client
      );

      const formatted = rows.map((row) => ({
        id: row.id,
        amount: toNumber(row.amount),
        payment_date: toDateOnly(row.payment_date),
        method: (row.method as (typeof paymentMethodFilterValues)[number]) ?? 'cash',
        reference: row.reference ?? null,
        notes: row.notes ?? null,
        received_by: row.received_by,
        received_by_name: row.received_by_name ?? null,
        source: row.source,
        created_at: toIsoString(row.created_at),
      }));

      const { rows: filteredAgg } = await query<{ total: string | null; count: string | number | null }>(
        `select coalesce(sum(p.amount), 0) as total, count(*) as count
         from customer_payment p
         ${whereClause}`,
        params,
        client
      );

      const filteredTotal = toNumber(filteredAgg[0]?.total ?? 0);
      const filteredCount = Number(filteredAgg[0]?.count ?? 0);

      return {
        generated_at: new Date().toISOString(),
        company: getCompanyInfo(),
        customer: {
          id: customer.id,
          legacy_code: customer.legacy_code,
          name: customer.name,
          cpf: customer.cpf,
          address: customer.address,
          city: customer.city,
          uf: customer.uf,
          cep: customer.cep,
          phone: customer.phone,
        },
        payments: formatted,
        summary: {
          total_debt: totalDebt,
          total_paid: totalPaid,
          current_balance: currentBalance,
          filtered_total_paid: filteredTotal,
          filtered_count: filteredCount,
          applied_filters: {
            start_date: toDateOnly(filters.start_date),
            end_date: toDateOnly(filters.end_date),
            method: filters.method ?? null,
            sort: orderDirection,
          },
        },
      };
    });

    res.json(report);
  })
);

router.get(
  '/:customerId/payments/:paymentId/receipt',
  requirePermission('catalog:read'),
  asyncHandler(async (req, res) => {
    const { customerId, paymentId } = req.params;

    const payload = await withTransaction(async (client) => {
      const { rows: customerRows } = await query<{
        id: string;
        legacy_code: string | null;
        name: string;
        cpf: string | null;
        address: string | null;
        city: string | null;
        uf: string | null;
        cep: string | null;
        phone: string | null;
      }>('select * from customer where id = $1 for share', [customerId], client);

      const customer = customerRows[0];
      if (!customer) {
        throw notFound('customer not found');
      }

      const { rows: paymentRows } = await query<{
        id: string;
        amount: string | number;
        payment_date: string | Date | null;
        method: string | null;
        reference: string | null;
        notes: string | null;
        received_by: string | null;
        received_by_name: string | null;
        source: string;
        created_at: string | Date | null;
      }>(
        `select
           p.id,
           p.amount,
           p.payment_date,
           p.method,
           p.reference,
           p.notes,
           p.received_by,
           u.full_name as received_by_name,
           p.source,
           p.created_at
         from customer_payment p
         left join app_user u on u.id = p.received_by
         where p.id = $1 and p.customer_id = $2`,
        [paymentId, customerId],
        client
      );

      const paymentRow = paymentRows[0];
      if (!paymentRow) {
        throw notFound('payment not found');
      }

      const paymentDateValue =
        paymentRow.payment_date instanceof Date
          ? paymentRow.payment_date
          : paymentRow.payment_date
          ? new Date(paymentRow.payment_date)
          : new Date();

      const paymentCreatedAtValue =
        paymentRow.created_at instanceof Date
          ? paymentRow.created_at
          : paymentRow.created_at
          ? new Date(paymentRow.created_at)
          : new Date();

      const [{ total: totalChargesRaw }] = (
        await query<{ total: string | null }>(
          `select coalesce(sum(total), 0) as total
           from sale
           where customer_id = $1 and status = 'completed'`,
          [customerId],
          client
        )
      ).rows;

      const [{ total: totalPaidRaw }] = (
        await query<{ total: string | null }>(
          `select coalesce(sum(amount), 0) as total
           from customer_payment
           where customer_id = $1`,
          [customerId],
          client
        )
      ).rows;

      const { rows: paidBeforeRows } = await query<{ total: string | null }>(
        `select coalesce(sum(amount), 0) as total
         from customer_payment cp
         where cp.customer_id = $1
           and (
             cp.payment_date < $2
             or (cp.payment_date = $2 and cp.created_at < $3)
             or (cp.payment_date = $2 and cp.created_at = $3 and cp.id < $4)
           )`,
        [customerId, paymentDateValue, paymentCreatedAtValue, paymentRow.id],
        client
      );

      const totalDebt = toNumber(totalChargesRaw);
      const totalPaid = toNumber(totalPaidRaw);
      const paidBefore = toNumber(paidBeforeRows[0]?.total ?? 0);
      const paymentAmount = toNumber(paymentRow.amount);
      const previousBalance = Number((totalDebt - paidBefore).toFixed(2));
      const newBalance = Math.max(0, Number((previousBalance - paymentAmount).toFixed(2)));

      return {
        company: getCompanyInfo(),
        customer: {
          id: customer.id,
          legacy_code: customer.legacy_code,
          name: customer.name,
          cpf: customer.cpf,
          address: customer.address,
          city: customer.city,
          uf: customer.uf,
          cep: customer.cep,
          phone: customer.phone,
        },
        payment: {
          id: paymentRow.id,
          code: `REC-${paymentRow.id.slice(0, 8).toUpperCase()}`,
          amount: paymentAmount,
          payment_date: toDateOnly(paymentRow.payment_date),
          method: (paymentRow.method as (typeof paymentMethodFilterValues)[number]) ?? 'cash',
          reference: paymentRow.reference ?? null,
          notes: paymentRow.notes ?? null,
          received_by: paymentRow.received_by,
          received_by_name: paymentRow.received_by_name ?? null,
          source: paymentRow.source,
          created_at: toIsoString(paymentRow.created_at),
        },
        balances: {
          total_debt: totalDebt,
          total_paid: totalPaid,
          previous_balance: previousBalance,
          payment_amount: paymentAmount,
          new_balance: newBalance,
        },
        generated_at: new Date().toISOString(),
      };
    });

    res.json(payload);
  })
);

router.get(
  '/:id/sales',
  requirePermission('sales:read'),
  asyncHandler(async (req, res) => {
    const { rowCount } = await query('select 1 from customer where id = $1', [req.params.id]);
    if (rowCount === 0) {
      throw notFound('customer not found');
    }

    const { rows } = await query<{
      id: string;
      emission_date: string | Date;
      order_number: string | null;
      total: string | number | null;
      status: string;
    }>(
      `select id, emission_date, order_number, total, status
       from sale
       where customer_id = $1 and status != 'draft'
       order by emission_date desc, id desc
       limit 100`,
      [req.params.id]
    );

    const formatted = rows.map((row) => ({
      id: row.id,
      emission_date: toDateOnly(row.emission_date),
      order_number: row.order_number ?? null,
      total: toNumber(row.total),
      status: row.status as 'draft' | 'completed' | 'cancelled',
    }));

    res.json(formatted);
  })
);

router.post(
  '/:id/payments',
  requirePermission('catalog:write'),
  asyncHandler(async (req, res) => {
    if (!req.user) {
      throw badRequest('user context missing');
    }
    const currentUser = req.user;
    const customerId = req.params.id;
    const payload = paymentInputSchema.parse(req.body);
    const result = await withTransaction(async (client) => {
      const { rows: customerRows } = await query<{ id: string }>(
        'select id from customer where id = $1 for update',
        [customerId],
        client
      );
      if (!customerRows[0]) {
        throw notFound('customer not found');
      }

      const { rows: chargesRows } = await query<{ total: string | null }>(
        `select coalesce(sum(total), 0) as total
         from sale
         where customer_id = $1 and status = 'completed'`,
        [customerId],
        client
      );
      const totalCharges = toNumber(chargesRows[0]?.total ?? 0);

      const { rows: paymentsRows } = await query<{ total: string | null }>(
        `select coalesce(sum(amount), 0) as total
         from customer_payment
         where customer_id = $1`,
        [customerId],
        client
      );
      const totalPayments = toNumber(paymentsRows[0]?.total ?? 0);

      const openBalance = Number((totalCharges - totalPayments).toFixed(2));
      if (openBalance <= 0) {
        throw badRequest('customer has no outstanding balance');
      }
      if (payload.amount > openBalance + OVERPAY_TOLERANCE) {
        throw badRequest('payment exceeds open balance');
      }

      const paymentDate = payload.payment_date ?? new Date();
      const reference = normalizeOptionalText(payload.reference);
      const notes = normalizeOptionalText(payload.notes);
      const method = payload.method ?? 'cash';

      const { rows: inserted } = await query<{
        id: string;
        amount: string | number;
        payment_date: string | Date | null;
        method: string;
        reference: string | null;
        notes: string | null;
        received_by: string;
        created_at: string | Date | null;
      }>(
        `insert into customer_payment (
           customer_id,
           amount,
           payment_date,
           method,
           reference,
           notes,
           received_by,
           source
         )
         values ($1, $2, $3, $4, $5, $6, $7, 'manual')
         returning id, amount, payment_date, method, reference, notes, received_by, created_at`,
        [customerId, payload.amount, paymentDate, method, reference, notes, currentUser.id],
        client
      );

      const row = inserted[0];
      return {
        id: row.id,
        amount: toNumber(row.amount),
        payment_date: toDateOnly(row.payment_date),
        method: row.method,
        reference: row.reference ?? null,
        notes: row.notes ?? null,
        received_by: row.received_by,
        received_by_name: currentUser.fullName ?? null,
        source: 'manual',
        created_at: toIsoString(row.created_at),
        summary: {
          total_debt: totalCharges,
          total_paid: Number((totalPayments + toNumber(row.amount)).toFixed(2)),
          previous_balance: openBalance,
          new_balance: Math.max(0, Number((openBalance - toNumber(row.amount)).toFixed(2))),
        },
      };
    });

    const { summary, ...payment } = result;
    res
      .status(201)
      .json({ payment, summary, receipt_hint: `REC-${payment.id.slice(0, 8).toUpperCase()}` });
  })
);

router.patch(
  '/:id',
  requirePermission('catalog:write'),
  asyncHandler(async (req, res) => {
    const body = baseSchema.partial().parse(req.body);
    const entries = Object.entries(body).filter(([, value]) => value !== undefined);
    if (entries.length === 0) {
      return res.status(204).send();
    }

    const sets = entries.map(([field], index) => `${field} = $${index + 1}`);
    const values = entries.map(([, value]) => value);
    values.push(req.params.id);

    const { rows } = await query(
      `update customer
       set ${sets.join(', ')}
       where id = $${entries.length + 1}
       returning id, legacy_code, name, cpf, address, city, uf, cep, phone, status, credit_limit, notes`,
      values
    );
    const customer = rows[0];
    if (!customer) {
      throw notFound('customer not found');
    }
    res.json(customer);
  })
);
