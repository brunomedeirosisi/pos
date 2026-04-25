import path from 'node:path';
import os from 'node:os';
import { promises as fsp } from 'node:fs';
import { randomUUID } from 'node:crypto';
import extract from 'extract-zip';
import { DBFFile } from 'dbffile';
import type { Job } from 'bullmq';
import { Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';
import type { PoolClient } from 'pg';
import { query, withTransaction } from '../../db.js';
import { getEnv } from '../../config/env.js';

type LegacyImportJob = {
  id: string;
  sessionId: string;
  sessionDir: string;
  overwrite: boolean;
  userId: string;
};

type LegacyImportStatusLog = {
  createdAt: string;
  level: string;
  message: string;
};

type LegacyImportStatus = {
  status: string;
  overwrite: boolean;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  retryCount: number;
  currentStage: string | null;
  lastErrorStage: string | null;
  reconciliationVersion: string | null;
  summary: unknown;
  error: string | null;
  reportAvailable: boolean;
  reportJsonAvailable: boolean;
  checkpoints: LegacyImportCheckpoint[];
  logs: LegacyImportStatusLog[];
};

type LegacyImportCheckpointStatus = 'pending' | 'running' | 'completed' | 'failed';

type LegacyImportCheckpoint = {
  stage: string;
  status: LegacyImportCheckpointStatus;
  startedAt: string | null;
  finishedAt: string | null;
  summary: unknown;
  error: string | null;
};

type LegacyImportQueuePayload = {
  importId: string;
};

const env = getEnv();
let initialized = false;
let queueConnection: IORedis | null = null;
let importQueue: Queue<LegacyImportQueuePayload> | null = null;
let dlqQueue: Queue<Record<string, unknown>> | null = null;
let importWorker: Worker<LegacyImportQueuePayload> | null = null;

const REQUIRED_FILES = ['PRODUTO.DBF', 'GRUPO.DBF', 'CLIENTES.DBF', 'VENDEDOR.DBF', 'VENDAS.DBF', 'PEDIDOS.DBF', 'PAGAMENT.DBF'];

type StagingColumn = {
  name: string;
  field: string;
};

type StagingConfig = {
  file: string;
  table: string;
  columns: StagingColumn[];
};

const STAGING_CONFIG: StagingConfig[] = [
  {
    file: 'GRUPO.DBF',
    table: 'stg_grupo',
    columns: [
      { name: 'cod_grup', field: 'COD_GRUP' },
      { name: 'nome', field: 'NOME_GRUP' },
    ],
  },
  {
    file: 'PRODUTO.DBF',
    table: 'stg_produto',
    columns: [
      { name: 'cod_prod', field: 'COD_PROD' },
      { name: 'nome_prod', field: 'NOME_PROD' },
      { name: 'cod_barra', field: 'COD_BARRA' },
      { name: 'referencia', field: 'REFERENCIA' },
      { name: 'cod_grup', field: 'COD_GRUP' },
      { name: 'esto_min', field: 'EST_MINIMO' },
      { name: 'avista', field: 'AVISTA' },
      { name: 'preco_base', field: 'VLR_UN_PRO' },
    ],
  },
  {
    file: 'CLIENTES.DBF',
    table: 'stg_clientes',
    columns: [
      { name: 'codigo', field: 'CODIGO' },
      { name: 'nome', field: 'NOME' },
      { name: 'cpf', field: 'CPF' },
      { name: 'endereco', field: 'ENDERECO' },
      { name: 'cidade', field: 'CIDADE' },
      { name: 'uf', field: 'UF' },
      { name: 'cep', field: 'CEP' },
      { name: 'fone', field: 'FONE' },
      { name: 'status', field: 'SITUACAO' },
      { name: 'obs', field: 'OBSERVACAO' },
    ],
  },
  {
    file: 'VENDEDOR.DBF',
    table: 'stg_vendedor',
    columns: [
      { name: 'codigo', field: 'CODIGO' },
      { name: 'nome', field: 'NOME' },
    ],
  },
  {
    file: 'FORMA_PG.DBF',
    table: 'stg_forma_pg',
    columns: [
      { name: 'cod_fpg', field: 'COD_FPG' },
      { name: 'forma', field: 'FORMA' },
    ],
  },
  {
    file: 'VENDAS.DBF',
    table: 'stg_vendas',
    columns: [
      { name: 'pedido', field: 'PEDIDO' },
      { name: 'emissao', field: 'EMISSAO' },
      { name: 'cod_vend', field: 'COD_VEND' },
      { name: 'cod_cli', field: 'COD_CLI' },
      { name: 'cod_fpg', field: 'COD_FPG' },
      { name: 'sub_total', field: 'SUB_TOTAL' },
      { name: 'desconto', field: 'DESCONTO' },
      { name: 'total_gera', field: 'TOTAL_GERA' },
      { name: 'cod1', field: 'COD1' },
      { name: 'cod2', field: 'COD2' },
      { name: 'cod3', field: 'COD3' },
      { name: 'cod4', field: 'COD4' },
      { name: 'cod5', field: 'COD5' },
      { name: 'cod6', field: 'COD6' },
      { name: 'cod7', field: 'COD7' },
      { name: 'qtde1', field: 'QTDE1' },
      { name: 'qtde2', field: 'QTDE2' },
      { name: 'qtde3', field: 'QTDE3' },
      { name: 'qtde4', field: 'QTDE4' },
      { name: 'qtde5', field: 'QTDE5' },
      { name: 'qtde6', field: 'QTDE6' },
      { name: 'qtde7', field: 'QTDE7' },
      { name: 'vlr1', field: 'VLR1' },
      { name: 'vlr2', field: 'VLR2' },
      { name: 'vlr3', field: 'VLR3' },
      { name: 'vlr4', field: 'VLR4' },
      { name: 'vlr5', field: 'VLR5' },
      { name: 'vlr6', field: 'VLR6' },
      { name: 'vlr7', field: 'VLR7' },
      { name: 'total1', field: 'TOTAL1' },
      { name: 'total2', field: 'TOTAL2' },
      { name: 'total3', field: 'TOTAL3' },
      { name: 'total4', field: 'TOTAL4' },
      { name: 'total5', field: 'TOTAL5' },
      { name: 'total6', field: 'TOTAL6' },
      { name: 'total7', field: 'TOTAL7' },
    ],
  },
  {
    file: 'PEDIDOS.DBF',
    table: 'stg_pedidos',
    columns: [
      { name: 'pedido', field: 'PEDIDO' },
      { name: 'emissao', field: 'EMISSAO' },
      { name: 'cod_vend', field: 'COD_VEND' },
      { name: 'cod_cli', field: 'COD_CLI' },
      { name: 'cod_fpg', field: 'F_PG' },
      { name: 'sub_total', field: 'SUB_TOTAL' },
      { name: 'desconto', field: 'DESCONTO' },
      { name: 'total_gera', field: 'TOTAL_GERA' },
      { name: 'cod1', field: 'COD1' },
      { name: 'cod2', field: 'COD2' },
      { name: 'cod3', field: 'COD3' },
      { name: 'cod4', field: 'COD4' },
      { name: 'cod5', field: 'COD5' },
      { name: 'cod6', field: 'COD6' },
      { name: 'cod7', field: 'COD7' },
      { name: 'qtde1', field: 'QTDE1' },
      { name: 'qtde2', field: 'QTDE2' },
      { name: 'qtde3', field: 'QTDE3' },
      { name: 'qtde4', field: 'QTDE4' },
      { name: 'qtde5', field: 'QTDE5' },
      { name: 'qtde6', field: 'QTDE6' },
      { name: 'qtde7', field: 'QTDE7' },
      { name: 'vlr1', field: 'VLR1' },
      { name: 'vlr2', field: 'VLR2' },
      { name: 'vlr3', field: 'VLR3' },
      { name: 'vlr4', field: 'VLR4' },
      { name: 'vlr5', field: 'VLR5' },
      { name: 'vlr6', field: 'VLR6' },
      { name: 'vlr7', field: 'VLR7' },
      { name: 'total1', field: 'TOTAL1' },
      { name: 'total2', field: 'TOTAL2' },
      { name: 'total3', field: 'TOTAL3' },
      { name: 'total4', field: 'TOTAL4' },
      { name: 'total5', field: 'TOTAL5' },
      { name: 'total6', field: 'TOTAL6' },
      { name: 'total7', field: 'TOTAL7' },
    ],
  },
  {
    file: 'PAGAMENT.DBF',
    table: 'stg_pagament',
    columns: [
      { name: 'cod_cli', field: 'COD_CLI' },
      { name: 'valor_doc', field: 'VALOR_DOC' },
      { name: 'vlr_pago', field: 'VLR_PAGO' },
      { name: 'restante', field: 'RESTANTE' },
      { name: 'pagamento', field: 'PAGAMENTO' },
    ],
  },
  {
    file: 'MOV_EST.DBF',
    table: 'stg_mov_est',
    columns: [
      { name: 'tip_mov', field: 'TIP_MOV' },
      { name: 'data', field: 'DATA' },
      { name: 'cod_prod', field: 'COD_PROD' },
      { name: 'qtde', field: 'QTDE' },
      { name: 'valor', field: 'VALOR' },
      { name: 'total', field: 'TOTAL' },
      { name: 'nf', field: 'NF' },
    ],
  },
];

const RECONCILIATION_VERSION = 'legacy-reconciliation/v1';

const IMPORT_STAGE_SEQUENCE = [
  'reset-target',
  ...STAGING_CONFIG.map((config) => `load-staging:${config.table}`),
  'migrate-master',
  'migrate-sales',
  'migrate-customer-payments',
  'migrate-stock',
  'reconciliation-report',
] as const;

type ImportStage = (typeof IMPORT_STAGE_SEQUENCE)[number];

function normalizeString(value: unknown): string | null {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString().split('T')[0];
  const str = String(value).trim();
  return str.length ? str : null;
}

function normalizeNumber(value: unknown): number | null {
  if (value == null || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const parsed = Number(String(value).replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeDate(value: unknown): Date | null {
  if (value instanceof Date) return value;
  if (typeof value === 'string' && value.trim().length) {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return null;
}

function normalizeLegacyCodeNumber(value: string): string | null {
  const parsed = normalizeNumber(value);
  if (parsed == null || !Number.isFinite(parsed) || !Number.isInteger(parsed)) {
    return null;
  }
  return String(parsed);
}

async function runDbQuery<T extends Record<string, unknown> = Record<string, unknown>>(
  text: string,
  params?: unknown[],
  client?: PoolClient
) {
  return query<T>(text, params as any[] | undefined, client);
}

async function appendLog(
  importId: string,
  level: 'info' | 'warn' | 'error',
  message: string,
  client?: PoolClient
): Promise<void> {
  await runDbQuery(
    `insert into system_legacy_import_log (import_id, level, message) values ($1, $2, $3)`,
    [importId, level, message],
    client
  );
}

async function updateImportStatus(
  importId: string,
  status: string,
  fields: Record<string, unknown> = {},
  client?: PoolClient
): Promise<void> {
  const keys = Object.keys(fields);
  const sets = ['status = $2'];
  const values: unknown[] = [importId, status];
  keys.forEach((key, index) => {
    sets.push(`${key} = $${index + 3}`);
    values.push(fields[key]);
  });
  await runDbQuery(`update system_legacy_import set ${sets.join(', ')} where id = $1`, values, client);
}

async function upsertStageCheckpoint(
  importId: string,
  stage: ImportStage,
  input: {
    status: LegacyImportCheckpointStatus;
    startedAt?: string | null;
    finishedAt?: string | null;
    summary?: unknown;
    errorMessage?: string | null;
  },
  client?: PoolClient
): Promise<void> {
  await runDbQuery(
    `insert into system_legacy_import_checkpoint (
       import_id,
       stage,
       status,
       started_at,
       finished_at,
       summary,
       error_message,
       updated_at
     )
     values ($1, $2, $3, $4, $5, $6::jsonb, $7, now())
     on conflict (import_id, stage) do update set
       status = excluded.status,
       started_at = excluded.started_at,
       finished_at = excluded.finished_at,
       summary = excluded.summary,
       error_message = excluded.error_message,
       updated_at = now()`,
    [
      importId,
      stage,
      input.status,
      input.startedAt ?? null,
      input.finishedAt ?? null,
      input.summary == null ? null : JSON.stringify(input.summary),
      input.errorMessage ?? null,
    ],
    client
  );
}

async function assertLegacyImportSchemaReady(): Promise<void> {
  const requiredTables = [
    ...STAGING_CONFIG.map((config) => config.table),
    'system_legacy_import',
    'system_legacy_import_log',
    'system_legacy_import_checkpoint',
    'system_legacy_import_dead_letter',
  ];

  const { rows } = await runDbQuery<{ table_name: string }>(
    `select table_name
     from information_schema.tables
     where table_schema = 'public'
       and table_name = any($1::text[])`,
    [requiredTables]
  );

  const existing = new Set(rows.map((row) => row.table_name));
  const missing = requiredTables.filter((tableName) => !existing.has(tableName));
  if (missing.length) {
    throw new Error(
      `legacy import schema is not ready; missing tables: ${missing.join(', ')}. Run versioned migrations before importing.`
    );
  }
}

async function readDirectoryRecursive(root: string): Promise<string[]> {
  const entries = await fsp.readdir(root, { withFileTypes: true });
  const results: string[] = [];
  for (const entry of entries) {
    const resolved = path.join(root, entry.name);
    if (entry.isDirectory()) {
      results.push(...(await readDirectoryRecursive(resolved)));
    } else {
      results.push(resolved);
    }
  }
  return results;
}

async function prepareLegacyFiles(sessionDir: string): Promise<Map<string, string>> {
  const files = await readDirectoryRecursive(sessionDir);
  const map = new Map<string, string>();
  for (const file of files) {
    const ext = path.extname(file).toLowerCase();
    if (ext === '.zip') {
      const extractDir = path.join(sessionDir, path.parse(file).name);
      await fsp.mkdir(extractDir, { recursive: true });
      await extract(file, { dir: extractDir });
      await fsp.unlink(file);
      const extracted = await readDirectoryRecursive(extractDir);
      extracted.forEach((ex) => {
        map.set(path.basename(ex).toUpperCase(), ex);
      });
    } else {
      map.set(path.basename(file).toUpperCase(), file);
    }
  }
  return map;
}

async function ensureStagingTable(config: StagingConfig, client?: PoolClient): Promise<void> {
  await runDbQuery(`truncate ${config.table}`, undefined, client);
}

async function batchInsertRows(table: string, columns: string[], rows: unknown[][], client?: PoolClient): Promise<void> {
  if (!rows.length) {
    return;
  }

  const values: unknown[] = [];
  const tuples = rows.map((row, rowIndex) => {
    const placeholders = row.map((_value, columnIndex) => `$${rowIndex * columns.length + columnIndex + 1}`);
    values.push(...row);
    return `(${placeholders.join(', ')})`;
  });

  await runDbQuery(
    `insert into ${table} (${columns.join(', ')})
     values ${tuples.join(', ')}`,
    values,
    client
  );
}

async function loadDbfIntoStaging(
  importId: string,
  config: StagingConfig,
  files: Map<string, string>,
  client?: PoolClient
): Promise<number> {
  const filePath = files.get(config.file);
  if (!filePath) {
    await appendLog(importId, 'warn', `Optional file ${config.file} not provided; skipping.`);
    return 0;
  }

  await ensureStagingTable(config, client);

  const dbf = await DBFFile.open(filePath, { encoding: 'latin1' });
  let total = 0;

  while (true) {
    const records = await dbf.readRecords(500);
    if (!records.length) break;
    const rows = records.map((record) =>
      config.columns.map((column) => {
        const value = record[column.field];
        if (value instanceof Date) {
          return value.toISOString();
        }
        if (value === null || value === undefined) return null;
        return String(value).trim();
      })
    );

    await batchInsertRows(
      config.table,
      config.columns.map((column) => column.name),
      rows,
      client
    );
    total += rows.length;
  }

  return total;
}

async function truncateCoreTables(client?: PoolClient): Promise<void> {
  await runDbQuery('truncate sale_item cascade', undefined, client);
  await runDbQuery('truncate sale cascade', undefined, client);
  await runDbQuery('truncate customer_payment cascade', undefined, client);
  await runDbQuery('truncate stock_movement cascade', undefined, client);
  await runDbQuery('truncate product cascade', undefined, client);
  await runDbQuery('truncate product_group cascade', undefined, client);
  await runDbQuery('truncate customer cascade', undefined, client);
  await runDbQuery('truncate seller cascade', undefined, client);
  await runDbQuery('truncate payment_term cascade', undefined, client);
}

async function truncateStagingTables(client?: PoolClient): Promise<void> {
  for (const config of STAGING_CONFIG) {
    await runDbQuery(`truncate ${config.table}`, undefined, client);
  }
}

async function buildLegacyMap(table: string, client?: PoolClient): Promise<Map<string, string>> {
  const { rows } = await runDbQuery<{ legacy_code: string | null; id: string }>(
    `select legacy_code, id from ${table} where legacy_code is not null`,
    undefined,
    client
  );
  const map = new Map<string, string>();
  for (const row of rows) {
    if (row.legacy_code) {
      map.set(String(row.legacy_code).trim(), row.id);
    }
  }
  return map;
}

function buildLegacyVariants(value: string): string[] {
  const trimmed = value.trim();
  if (!trimmed) return [];
  const variants = new Set<string>();
  variants.add(trimmed);
  variants.add(trimmed.toUpperCase());

  const numericVariant = normalizeLegacyCodeNumber(trimmed);
  if (numericVariant) {
    variants.add(numericVariant);
  }

  const noLeadingZeros = trimmed.replace(/^0+/, '');
  if (noLeadingZeros) {
    variants.add(noLeadingZeros);
    variants.add(noLeadingZeros.toUpperCase());
  }

  const digitsOnly = trimmed.replace(/[^0-9]/g, '');
  if (digitsOnly) {
    variants.add(digitsOnly);
    variants.add(digitsOnly.replace(/^0+/, ''));
  }

  return Array.from(variants).filter((entry) => entry.length > 0);
}

function buildProductLegacyVariants(value: string): string[] {
  const trimmed = value.trim();
  if (!trimmed) return [];
  const variants = new Set<string>();
  variants.add(trimmed);
  variants.add(trimmed.toUpperCase());

  const numericVariant = normalizeLegacyCodeNumber(trimmed);
  if (numericVariant) {
    variants.add(numericVariant);
  }

  const noLeadingZeros = trimmed.replace(/^0+/, '');
  if (noLeadingZeros) {
    variants.add(noLeadingZeros);
    variants.add(noLeadingZeros.toUpperCase());
  }

  return Array.from(variants).filter((entry) => entry.length > 0);
}

async function buildCustomerLegacyMap(client?: PoolClient): Promise<Map<string, string>> {
  const { rows } = await runDbQuery<{ legacy_code: string | null; id: string }>(
    `select legacy_code, id from customer where legacy_code is not null`,
    undefined,
    client
  );
  const map = new Map<string, string>();
  for (const row of rows) {
    if (!row.legacy_code) continue;
    const variants = buildLegacyVariants(String(row.legacy_code));
    variants.forEach((variant) => map.set(variant, row.id));
  }
  return map;
}

async function buildProductLegacyMap(client?: PoolClient): Promise<Map<string, string>> {
  const { rows } = await runDbQuery<{ legacy_code: string | null; id: string }>(
    `select legacy_code, id from product where legacy_code is not null`,
    undefined,
    client
  );
  const map = new Map<string, string>();
  for (const row of rows) {
    if (!row.legacy_code) continue;
    const variants = buildProductLegacyVariants(String(row.legacy_code));
    variants.forEach((variant) => map.set(variant, row.id));
  }
  return map;
}

function resolveCustomerId(customerMap: Map<string, string>, value: unknown): string | null {
  if (value == null) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  const candidates = buildLegacyVariants(raw);
  for (const candidate of candidates) {
    const id = customerMap.get(candidate);
    if (id) {
      return id;
    }
  }
  return customerMap.get(raw) ?? null;
}

function resolveProductId(productMap: Map<string, string>, value: unknown): string | null {
  if (value == null) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  const candidates = buildProductLegacyVariants(raw);
  for (const candidate of candidates) {
    const id = productMap.get(candidate);
    if (id) {
      return id;
    }
  }
  return productMap.get(raw) ?? null;
}

function resolveLegacyId(map: Map<string, string>, value: unknown): string | null {
  if (value == null) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  const candidates = buildLegacyVariants(raw);
  for (const candidate of candidates) {
    const id = map.get(candidate);
    if (id) {
      return id;
    }
  }
  return map.get(raw) ?? null;
}

async function migrateMasterData(_overwrite: boolean, client?: PoolClient): Promise<Record<string, number>> {
  const summary: Record<string, number> = {};

  await runDbQuery(
    `
    insert into product_group (legacy_code, name)
    select trim(cod_grup),
           coalesce(nullif(trim(nome), ''), trim(cod_grup)) as name
    from stg_grupo
    where cod_grup is not null
    on conflict (legacy_code) do update
      set name = excluded.name
  `,
    undefined,
    client
  );
  summary.productGroups = Number((await runDbQuery('select count(*) from stg_grupo', undefined, client)).rows[0].count);

  await runDbQuery(
    `
    insert into product (legacy_code, name, barcode, reference, min_stock, price_cash, price_base, group_id)
    select
      trim(s.cod_prod),
      s.nome_prod,
      nullif(trim(s.cod_barra), ''),
      nullif(trim(s.referencia), ''),
      nullif(trim(s.esto_min), '')::numeric,
      nullif(trim(s.avista), '')::numeric,
      nullif(trim(s.preco_base), '')::numeric,
      pg.id
    from stg_produto s
    left join product_group pg on pg.legacy_code = trim(s.cod_grup)
    where s.cod_prod is not null
    on conflict (legacy_code) do update set
      name = excluded.name,
      barcode = excluded.barcode,
      reference = excluded.reference,
      min_stock = excluded.min_stock,
      price_cash = excluded.price_cash,
      price_base = excluded.price_base,
      group_id = excluded.group_id
  `,
    undefined,
    client
  );
  summary.products = Number((await runDbQuery('select count(*) from stg_produto', undefined, client)).rows[0].count);

  await runDbQuery(
    `
    insert into customer (legacy_code, name, cpf, address, city, uf, cep, phone, status, notes)
    select
      trim(s.codigo),
      s.nome,
      nullif(trim(s.cpf), ''),
      nullif(trim(s.endereco), ''),
      nullif(trim(s.cidade), ''),
      nullif(trim(s.uf), ''),
      nullif(trim(s.cep), ''),
      nullif(trim(s.fone), ''),
      case
        when s.status is null or trim(s.status) = '' then 'active'
        when upper(trim(s.status)) in ('1', 'A', 'ATIVO', 'ACTIVE') then 'active'
        when upper(trim(s.status)) in ('2', 'D', 'E', 'DELINQUENT', 'INADIMPLENTE', 'DEVEDOR') then 'delinquent'
        when upper(trim(s.status)) in ('0', '3', 'I', 'INATIVO', 'INACTIVE') then 'inactive'
        else 'active'
      end,
      nullif(trim(s.obs), '')
    from stg_clientes s
    where s.codigo is not null
    on conflict (legacy_code) do update set
      name = excluded.name,
      cpf = excluded.cpf,
      address = excluded.address,
      city = excluded.city,
      uf = excluded.uf,
      cep = excluded.cep,
      phone = excluded.phone,
      status = excluded.status,
      notes = excluded.notes
  `,
    undefined,
    client
  );
  summary.customers = Number((await runDbQuery('select count(*) from stg_clientes', undefined, client)).rows[0].count);

  await runDbQuery(
    `
    insert into seller (legacy_code, name)
    select trim(codigo), nome
    from stg_vendedor
    where codigo is not null
    on conflict (legacy_code) do update set name = excluded.name
  `,
    undefined,
    client
  );
  summary.sellers = Number((await runDbQuery('select count(*) from stg_vendedor', undefined, client)).rows[0].count);

  await runDbQuery(
    `
    insert into payment_term (legacy_code, name)
    select trim(cod_fpg), forma
    from stg_forma_pg
    where cod_fpg is not null
    on conflict (legacy_code) do update set name = excluded.name
  `,
    undefined,
    client
  );
  summary.paymentTerms = Number((await runDbQuery('select count(*) from stg_forma_pg', undefined, client)).rows[0].count);

  return summary;
}

async function migrateCustomerPayments(client?: PoolClient): Promise<number> {
  const { rows } = await runDbQuery('select * from stg_pagament', undefined, client);
  const customerMap = await buildCustomerLegacyMap(client);
  let count = 0;
  const batch: unknown[][] = [];
  const BATCH_SIZE = 1000;

  const flush = async () => {
    if (!batch.length) return;
    await batchInsertRows(
      'customer_payment',
      [
        'customer_id',
        'amount',
        'payment_date',
        'method',
        'reference',
        'notes',
        'received_by',
        'source',
        'legacy_document_value',
        'legacy_remaining',
      ],
      batch,
      client
    );
    batch.length = 0;
  };

  for (const row of rows) {
    if (!row.cod_cli) continue;
    const customerId = resolveCustomerId(customerMap, row.cod_cli);
    if (!customerId) continue;
    const paid = normalizeNumber(row.vlr_pago);
    const documentValue = normalizeNumber(row.valor_doc);
    const remaining = normalizeNumber(row.restante);
    let amount = paid;
    if (amount == null) {
      if (documentValue != null && remaining != null) {
        amount = documentValue - remaining;
      } else {
        amount = documentValue;
      }
    }
    if (!amount || amount <= 0) continue;
    batch.push([
      customerId,
      amount,
      normalizeDate(row.pagamento) ?? new Date(),
      'legacy',
      null,
      null,
      null,
      'legacy',
      documentValue,
      remaining,
    ]);
    if (batch.length >= BATCH_SIZE) {
      await flush();
    }
    count += 1;
  }
  await flush();
  return count;
}

async function migrateStockMovements(client?: PoolClient): Promise<number> {
  const { rows } = await runDbQuery('select * from stg_mov_est', undefined, client);
  let count = 0;
  const productMap = await buildProductLegacyMap(client);
  const batch: unknown[][] = [];
  const BATCH_SIZE = 1000;

  const flush = async () => {
    if (!batch.length) return;
    await batchInsertRows(
      'stock_movement',
      ['product_id', 'date', 'type', 'quantity', 'unit_value', 'total', 'note_number'],
      batch,
      client
    );
    batch.length = 0;
  };

  for (const row of rows) {
    if (!row.cod_prod) continue;
    const productId = resolveProductId(productMap, row.cod_prod);
    if (!productId) continue;
    batch.push([
      productId,
      normalizeDate(row.data),
      normalizeString(row.tip_mov),
      normalizeNumber(row.qtde),
      normalizeNumber(row.valor),
      normalizeNumber(row.total),
      normalizeString(row.nf),
    ]);
    if (batch.length >= BATCH_SIZE) {
      await flush();
    }
    count += 1;
  }
  await flush();
  return count;
}

type SaleSummary = {
  sales: number;
  saleItems: number;
  orders: number;
  orderItems: number;
  mismatches: string[];
};

function extractSaleItems(row: any): Array<{ cod: string; quantity: number; price: number; total: number }> {
  const items: Array<{ cod: string; quantity: number; price: number; total: number }> = [];
  for (let index = 1; index <= 7; index += 1) {
    const codeKey = `cod${index}`;
    const qtyKey = `qtde${index}`;
    const priceKey = `vlr${index}`;
    const totalKey = `total${index}`;
    const code = row[codeKey];
    if (!code) continue;
    items.push({
      cod: String(code).trim(),
      quantity: normalizeNumber(row[qtyKey]) ?? 0,
      price: normalizeNumber(row[priceKey]) ?? 0,
      total: normalizeNumber(row[totalKey]) ?? 0,
    });
  }
  return items;
}

function buildDeduplicatedSourceKey(baseKey: string, seen: Map<string, number>): string {
  const current = (seen.get(baseKey) ?? 0) + 1;
  seen.set(baseKey, current);
  if (current === 1) {
    return baseKey;
  }
  return `${baseKey}#${current}`;
}

function buildOrderNumberVariants(value: string): string[] {
  const trimmed = value.trim();
  if (!trimmed) return [];

  const variants = new Set<string>();
  variants.add(trimmed);

  const numericVariant = normalizeLegacyCodeNumber(trimmed);
  if (numericVariant) {
    variants.add(numericVariant);
  }

  if (/^\d+$/.test(trimmed)) {
    const noLeadingZeros = trimmed.replace(/^0+/, '');
    if (noLeadingZeros) {
      variants.add(noLeadingZeros);
    }
  }

  if (/^[\d.,\s-]+$/.test(trimmed)) {
    const digitsOnly = trimmed.replace(/[^0-9]/g, '');
    if (digitsOnly) {
      variants.add(digitsOnly);
      const noLeadingZeros = digitsOnly.replace(/^0+/, '');
      if (noLeadingZeros) {
        variants.add(noLeadingZeros);
      }
    }
  }

  return Array.from(variants).filter((entry) => entry.length > 0);
}

type SalesFallbackLookup = {
  customerId: string | null;
  paymentTermId: string | null;
};

async function buildSalesFallbackLookup(
  customerMap: Map<string, string>,
  paymentTermMap: Map<string, string>,
  client?: PoolClient
): Promise<Map<string, SalesFallbackLookup>> {
  const lookup = new Map<string, SalesFallbackLookup>();
  const exactSeen = new Set<string>();
  const { rows } = await runDbQuery(
    `select pedido, cod_cli, cod_fpg
     from stg_pedidos
     where pedido is not null
     order by pedido, emissao desc nulls last, ctid desc`,
    undefined,
    client
  );

  for (const row of rows) {
    const sourceNumber = row.pedido ? String(row.pedido).trim() : null;
    if (!sourceNumber) {
      continue;
    }

    const customerId = row.cod_cli ? resolveCustomerId(customerMap, row.cod_cli) : null;
    const paymentTermId = resolveLegacyId(paymentTermMap, row.cod_fpg);
    if (!exactSeen.has(sourceNumber)) {
      lookup.set(sourceNumber, { customerId, paymentTermId });
      exactSeen.add(sourceNumber);
    }
    const variants = buildOrderNumberVariants(sourceNumber);
    for (const variant of variants) {
      if (variant === sourceNumber) {
        continue;
      }
      if (lookup.has(variant)) {
        continue;
      }
      lookup.set(variant, { customerId, paymentTermId });
    }
  }

  return lookup;
}

function resolveSalesFallback(
  lookup: Map<string, SalesFallbackLookup>,
  sourceNumber: string
): SalesFallbackLookup | null {
  for (const variant of buildOrderNumberVariants(sourceNumber)) {
    const fallback = lookup.get(variant);
    if (fallback) {
      return fallback;
    }
  }
  return null;
}

async function migrateSales(overwrite: boolean, client?: PoolClient): Promise<SaleSummary> {
  const summary: SaleSummary = {
    sales: 0,
    saleItems: 0,
    orders: 0,
    orderItems: 0,
    mismatches: [],
  };

  if (overwrite) {
    await runDbQuery(`delete from sale where source in ('VENDAS', 'PEDIDOS')`, undefined, client);
  }

  const sellerMap = await buildLegacyMap('seller', client);
  const customerMap = await buildCustomerLegacyMap(client);
  const paymentTermMap = await buildLegacyMap('payment_term', client);
  const productMap = await buildProductLegacyMap(client);
  const fallbackLookup = await buildSalesFallbackLookup(customerMap, paymentTermMap, client);
  const salesSourceCount = new Map<string, number>();
  const ordersSourceCount = new Map<string, number>();

  const sales = await runDbQuery(
    `select *
     from stg_vendas
     order by pedido nulls last, emissao nulls last, cod_vend nulls last, ctid`,
    undefined,
    client
  );

  if (overwrite) {
    const saleBatch: unknown[][] = [];
    const itemBatch: unknown[][] = [];
    const SALES_BATCH_SIZE = 1000;
    const ITEMS_BATCH_SIZE = 5000;

    const flushSales = async () => {
      if (!saleBatch.length) return;
      await batchInsertRows(
        'sale',
        [
          'id',
          'emission_date',
          'order_number',
          'seller_id',
          'customer_id',
          'payment_term_id',
          'subtotal',
          'discount',
          'total',
          'status',
          'source',
          'source_key',
        ],
        saleBatch,
        client
      );
      saleBatch.length = 0;
    };

    const flushItems = async () => {
      if (!itemBatch.length) return;
      await batchInsertRows('sale_item', ['sale_id', 'product_id', 'quantity', 'unit_price', 'total'], itemBatch, client);
      itemBatch.length = 0;
    };

    for (const row of sales.rows) {
      const sourceNumber = row.pedido ? String(row.pedido).trim() : null;
      if (!sourceNumber) continue;
      const sourceKey = buildDeduplicatedSourceKey(sourceNumber, salesSourceCount);

      const emission = normalizeDate(row.emissao);
      const sellerId = resolveLegacyId(sellerMap, row.cod_vend);
      let customerId = row.cod_cli ? resolveCustomerId(customerMap, row.cod_cli) : null;
      let paymentTermId = resolveLegacyId(paymentTermMap, row.cod_fpg);
      if ((!customerId || !paymentTermId) && sourceNumber) {
        const fallback = resolveSalesFallback(fallbackLookup, sourceNumber);
        if (fallback) {
          customerId = customerId ?? fallback.customerId;
          paymentTermId = paymentTermId ?? fallback.paymentTermId;
        }
      }

      const saleId = randomUUID();
      saleBatch.push([
        saleId,
        emission,
        sourceNumber,
        sellerId ?? null,
        customerId ?? null,
        paymentTermId ?? null,
        normalizeNumber(row.sub_total),
        normalizeNumber(row.desconto),
        normalizeNumber(row.total_gera),
        'completed',
        'VENDAS',
        sourceKey,
      ]);

      const items = extractSaleItems(row);
      for (const item of items) {
        const productId = resolveProductId(productMap, item.cod);
        if (!productId) {
          summary.mismatches.push(`Sale ${sourceNumber}: product ${item.cod} not found`);
          continue;
        }
        itemBatch.push([saleId, productId, item.quantity, item.price, item.total]);
        summary.saleItems += 1;
      }
      summary.sales += 1;

      if (saleBatch.length >= SALES_BATCH_SIZE) {
        await flushSales();
      }
      if (itemBatch.length >= ITEMS_BATCH_SIZE) {
        if (saleBatch.length) {
          await flushSales();
        }
        await flushItems();
      }
    }

    const orders = await runDbQuery(
      `select *
       from stg_pedidos
       order by pedido nulls last, emissao nulls last, cod_vend nulls last, cod_cli nulls last, ctid`,
      undefined,
      client
    );
    for (const row of orders.rows) {
      const sourceNumber = row.pedido ? String(row.pedido).trim() : null;
      if (!sourceNumber) continue;
      const sourceKey = buildDeduplicatedSourceKey(sourceNumber, ordersSourceCount);

      const emission = normalizeDate(row.emissao);
      const sellerId = resolveLegacyId(sellerMap, row.cod_vend);
      let customerId = row.cod_cli ? resolveCustomerId(customerMap, row.cod_cli) : null;
      let paymentTermId = resolveLegacyId(paymentTermMap, row.cod_fpg);
      if ((!customerId || !paymentTermId) && sourceNumber) {
        const fallback = resolveSalesFallback(fallbackLookup, sourceNumber);
        if (fallback) {
          customerId = customerId ?? fallback.customerId;
          paymentTermId = paymentTermId ?? fallback.paymentTermId;
        }
      }

      const saleId = randomUUID();
      saleBatch.push([
        saleId,
        emission,
        sourceNumber,
        sellerId ?? null,
        customerId ?? null,
        paymentTermId ?? null,
        normalizeNumber(row.sub_total),
        normalizeNumber(row.desconto),
        normalizeNumber(row.total_gera),
        'completed',
        'PEDIDOS',
        sourceKey,
      ]);

      const items = extractSaleItems(row);
      for (const item of items) {
        const productId = resolveProductId(productMap, item.cod);
        if (!productId) {
          summary.mismatches.push(`Order ${sourceNumber}: product ${item.cod} not found`);
          continue;
        }
        itemBatch.push([saleId, productId, item.quantity, item.price, item.total]);
        summary.orderItems += 1;
      }
      summary.orders += 1;

      if (saleBatch.length >= SALES_BATCH_SIZE) {
        await flushSales();
      }
      if (itemBatch.length >= ITEMS_BATCH_SIZE) {
        if (saleBatch.length) {
          await flushSales();
        }
        await flushItems();
      }
    }

    await flushSales();
    await flushItems();
    return summary;
  }

  for (const row of sales.rows) {
    const sourceNumber = row.pedido ? String(row.pedido).trim() : null;
    if (!sourceNumber) continue;
    const sourceKey = buildDeduplicatedSourceKey(sourceNumber, salesSourceCount);

    const emission = normalizeDate(row.emissao);
    const sellerId = resolveLegacyId(sellerMap, row.cod_vend);
    let customerId = row.cod_cli ? resolveCustomerId(customerMap, row.cod_cli) : null;
    let paymentTermId = resolveLegacyId(paymentTermMap, row.cod_fpg);
    if ((!customerId || !paymentTermId) && sourceNumber) {
      const fallback = resolveSalesFallback(fallbackLookup, sourceNumber);
      if (fallback) {
        customerId = customerId ?? fallback.customerId;
        paymentTermId = paymentTermId ?? fallback.paymentTermId;
      }
    }

    const saleResult = await runDbQuery(
      `insert into sale (emission_date, order_number, seller_id, customer_id, payment_term_id, subtotal,
discount, total, status, source, source_key)
       values ($1, $2, $3, $4, $5, $6, $7, $8, 'completed', 'VENDAS', $9)
       on conflict (source, source_key) do update set
         emission_date = excluded.emission_date,
         order_number = excluded.order_number,
         seller_id = excluded.seller_id,
         customer_id = excluded.customer_id,
         payment_term_id = excluded.payment_term_id,
         subtotal = excluded.subtotal,
         discount = excluded.discount,
         total = excluded.total,

         status = excluded.status
       returning id`,
      [
        emission,
        sourceNumber,
        sellerId ?? null,
        customerId ?? null,
        paymentTermId ?? null,
        normalizeNumber(row.sub_total),
        normalizeNumber(row.desconto),
        normalizeNumber(row.total_gera),
        sourceKey,
      ],
      client
    );

    const saleId = saleResult.rows[0].id;
    await runDbQuery('delete from sale_item where sale_id = $1', [saleId], client);

    const items = extractSaleItems(row);
    const batchItems: unknown[][] = [];
    for (const item of items) {
      const productId = resolveProductId(productMap, item.cod);
      if (!productId) {
        summary.mismatches.push(`Sale ${sourceNumber}: product ${item.cod} not found`);
        continue;
      }
      batchItems.push([saleId, productId, item.quantity, item.price, item.total]);
      summary.saleItems += 1;
    }
    await batchInsertRows('sale_item', ['sale_id', 'product_id', 'quantity', 'unit_price', 'total'], batchItems, client);
    summary.sales += 1;
  }

  const orders = await runDbQuery(
    `select *
     from stg_pedidos
     order by pedido nulls last, emissao nulls last, cod_vend nulls last, cod_cli nulls last, ctid`,
    undefined,
    client
  );
  for (const row of orders.rows) {
    const sourceNumber = row.pedido ? String(row.pedido).trim() : null;
    if (!sourceNumber) continue;
    const sourceKey = buildDeduplicatedSourceKey(sourceNumber, ordersSourceCount);

    const emission = normalizeDate(row.emissao);
    const sellerId = resolveLegacyId(sellerMap, row.cod_vend);
    let customerId = row.cod_cli ? resolveCustomerId(customerMap, row.cod_cli) : null;
    let paymentTermId = resolveLegacyId(paymentTermMap, row.cod_fpg);
    if ((!customerId || !paymentTermId) && sourceNumber) {
      const fallback = resolveSalesFallback(fallbackLookup, sourceNumber);
      if (fallback) {
        customerId = customerId ?? fallback.customerId;
        paymentTermId = paymentTermId ?? fallback.paymentTermId;
      }
    }

    const saleResult = await runDbQuery(
      `insert into sale (emission_date, order_number, seller_id, customer_id, payment_term_id, subtotal, discount, total, source, source_key, status)
        values ($1, $2, $3, $4, $5, $6, $7, $8, 'PEDIDOS', $9, 'completed')
        on conflict (source, source_key) do update set
          emission_date = excluded.emission_date,
          order_number = excluded.order_number,
          seller_id = excluded.seller_id,
          customer_id = excluded.customer_id,
         payment_term_id = excluded.payment_term_id,
         subtotal = excluded.subtotal,
         discount = excluded.discount,
         total = excluded.total,
         status = excluded.status
       returning id`,
      [
        emission,
        sourceNumber,
        sellerId ?? null,
        customerId ?? null,
        paymentTermId ?? null,
        normalizeNumber(row.sub_total),
        normalizeNumber(row.desconto),
        normalizeNumber(row.total_gera),
        sourceKey,
      ],
      client
    );

    const saleId = saleResult.rows[0].id;
    await runDbQuery('delete from sale_item where sale_id = $1', [saleId], client);

    const items = extractSaleItems(row);
    const batchItems: unknown[][] = [];
    for (const item of items) {
      const productId = resolveProductId(productMap, item.cod);
      if (!productId) {
        summary.mismatches.push(`Order ${sourceNumber}: product ${item.cod} not found`);
        continue;
      }
      batchItems.push([saleId, productId, item.quantity, item.price, item.total]);
      summary.orderItems += 1;
    }
    await batchInsertRows('sale_item', ['sale_id', 'product_id', 'quantity', 'unit_price', 'total'], batchItems, client);
    summary.orders += 1;
  }

  return summary;
}

async function createReconciliationReport(
  importId: string,
  sessionId: string,
  sessionDir: string,
  summary: Record<string, unknown>,
  saleSummary: SaleSummary,
  payments: number,
  stocks: number,
  client?: PoolClient
): Promise<{ csvPath: string; jsonPath: string; version: string }> {
  const csvPath = path.join(sessionDir, 'reconciliation.v1.csv');
  const jsonPath = path.join(sessionDir, 'reconciliation.v1.json');
  const lines: string[] = [];
  lines.push('metric,legacy_value,imported_value,notes');
  const productLegacy = Number(summary.productGroups ?? 0);
  const productsLegacy = Number(summary.products ?? 0);
  const customerLegacy = Number(summary.customers ?? 0);
  const paymentLegacy = Number(payments);
  const stockLegacy = Number(stocks);

  const targetProducts = Number((await runDbQuery('select count(*) from product', undefined, client)).rows[0].count);
  const targetCustomers = Number((await runDbQuery('select count(*) from customer', undefined, client)).rows[0].count);
  const targetSales = Number((await runDbQuery("select count(*) from sale where source = 'VENDAS'", undefined, client)).rows[0].count);
  const targetSaleItems = Number(
    (await runDbQuery("select count(*) from sale_item si join sale s on s.id = si.sale_id where s.source = 'VENDAS'", undefined, client))
      .rows[0].count
  );
  const targetOrders = Number((await runDbQuery("select count(*) from sale where source = 'PEDIDOS'", undefined, client)).rows[0].count);
  const targetOrderItems = Number(
    (await runDbQuery("select count(*) from sale_item si join sale s on s.id = si.sale_id where s.source = 'PEDIDOS'", undefined, client))
      .rows[0].count
  );
  const targetPayments = Number((await runDbQuery('select count(*) from customer_payment', undefined, client)).rows[0].count);
  const targetStocks = Number((await runDbQuery('select count(*) from stock_movement', undefined, client)).rows[0].count);

  lines.push(`product_groups,${productLegacy},,`);
  lines.push(`products,${productsLegacy},${targetProducts},`);
  lines.push(`customers,${customerLegacy},${targetCustomers},`);
  lines.push(`sales,${saleSummary.sales},${targetSales},`);
  lines.push(`sale_items,${saleSummary.saleItems},${targetSaleItems},`);
  lines.push(`orders,${saleSummary.orders},${targetOrders},`);
  lines.push(`order_items,${saleSummary.orderItems},${targetOrderItems},`);
  lines.push(`customer_payments,${paymentLegacy},${targetPayments},`);
  lines.push(`stock_movements,${stockLegacy},${targetStocks},`);

  if (saleSummary.mismatches.length) {
    saleSummary.mismatches.forEach((mismatch) => {
      lines.push(`mismatch,,,"${mismatch.replace(/"/g, '""')}"`);
    });
  }

  const metrics = [
    { metric: 'product_groups', legacy: productLegacy, imported: null as number | null },
    { metric: 'products', legacy: productsLegacy, imported: targetProducts },
    { metric: 'customers', legacy: customerLegacy, imported: targetCustomers },
    { metric: 'sales', legacy: saleSummary.sales, imported: targetSales },
    { metric: 'sale_items', legacy: saleSummary.saleItems, imported: targetSaleItems },
    { metric: 'orders', legacy: saleSummary.orders, imported: targetOrders },
    { metric: 'order_items', legacy: saleSummary.orderItems, imported: targetOrderItems },
    { metric: 'customer_payments', legacy: paymentLegacy, imported: targetPayments },
    { metric: 'stock_movements', legacy: stockLegacy, imported: targetStocks },
  ];

  const reconciliationDocument = {
    version: RECONCILIATION_VERSION,
    generated_at: new Date().toISOString(),
    import_id: importId,
    session_id: sessionId,
    metrics,
    mismatches: saleSummary.mismatches,
  };

  await fsp.writeFile(csvPath, lines.join(os.EOL), 'utf8');
  await fsp.writeFile(jsonPath, JSON.stringify(reconciliationDocument, null, 2), 'utf8');

  return {
    csvPath,
    jsonPath,
    version: RECONCILIATION_VERSION,
  };
}

async function runImportStage<T>(
  job: LegacyImportJob,
  stage: ImportStage,
  checkpointCache: Map<string, { status: LegacyImportCheckpointStatus; summary: unknown }>,
  handler: (client: PoolClient) => Promise<T>
): Promise<T> {
  const existing = checkpointCache.get(stage);
  if (existing?.status === 'completed') {
    await appendLog(job.id, 'info', `Skipping stage ${stage} because checkpoint is already completed`);
    return existing.summary as T;
  }

  const startedAt = new Date().toISOString();
  await appendLog(job.id, 'info', `Starting stage ${stage}`);
  await updateImportStatus(job.id, 'running', {
    current_stage: stage,
    last_heartbeat: startedAt,
    error_message: null,
  });

  try {
    const stageResult = await withTransaction(async (client) => {
      await upsertStageCheckpoint(
        job.id,
        stage,
        {
          status: 'running',
          startedAt,
          finishedAt: null,
          summary: null,
          errorMessage: null,
        },
        client
      );

      const result = await handler(client);
      await upsertStageCheckpoint(
        job.id,
        stage,
        {
          status: 'completed',
          startedAt,
          finishedAt: new Date().toISOString(),
          summary: result,
          errorMessage: null,
        },
        client
      );
      return result;
    });

    checkpointCache.set(stage, { status: 'completed', summary: stageResult });
    await appendLog(job.id, 'info', `Completed stage ${stage}`);
    return stageResult;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await upsertStageCheckpoint(job.id, stage, {
      status: 'failed',
      startedAt,
      finishedAt: new Date().toISOString(),
      summary: null,
      errorMessage: message,
    });
    await appendLog(job.id, 'error', `Stage ${stage} failed: ${message}`);
    throw error;
  }
}

async function runImport(job: LegacyImportJob): Promise<void> {
  await appendLog(job.id, 'info', 'Preparing legacy files for import');
  const filesMap = await prepareLegacyFiles(job.sessionDir);

  for (const required of REQUIRED_FILES) {
    if (!filesMap.has(required)) {
      throw new Error(`Required legacy file ${required} missing after extraction`);
    }
  }

  const checkpointRows = await runDbQuery<{
    stage: string;
    status: LegacyImportCheckpointStatus;
    summary: unknown;
  }>(`select stage, status, summary from system_legacy_import_checkpoint where import_id = $1`, [job.id]);
  const checkpointCache = new Map<string, { status: LegacyImportCheckpointStatus; summary: unknown }>(
    checkpointRows.rows.map((row) => [row.stage, { status: row.status, summary: row.summary }])
  );

  await runImportStage(job, 'reset-target', checkpointCache, async (client) => {
    if (job.overwrite) {
      await appendLog(job.id, 'info', 'Clearing existing data before import', client);
      await truncateCoreTables(client);
    }
    await truncateStagingTables(client);
    return { overwrite: job.overwrite };
  });

  const stagingSummary: Record<string, number> = {};
  for (const config of STAGING_CONFIG) {
    const stageName = `load-staging:${config.table}` as ImportStage;
    const count = await runImportStage(job, stageName, checkpointCache, async (client) => {
      return loadDbfIntoStaging(job.id, config, filesMap, client);
    });
    stagingSummary[config.table] = Number(count ?? 0);
  }

  const masterSummary = await runImportStage(job, 'migrate-master', checkpointCache, async (client) => {
    return migrateMasterData(job.overwrite, client);
  });

  const salesSummary = await runImportStage(job, 'migrate-sales', checkpointCache, async (client) => {
    return migrateSales(job.overwrite, client);
  });

  const paymentsCount = await runImportStage(job, 'migrate-customer-payments', checkpointCache, async (client) => {
    return migrateCustomerPayments(client);
  });

  const stockCount = await runImportStage(job, 'migrate-stock', checkpointCache, async (client) => {
    return migrateStockMovements(client);
  });

  const reconciliation = await runImportStage(job, 'reconciliation-report', checkpointCache, async (client) => {
    return createReconciliationReport(
      job.id,
      job.sessionId,
      job.sessionDir,
      masterSummary as Record<string, unknown>,
      salesSummary as SaleSummary,
      Number(paymentsCount ?? 0),
      Number(stockCount ?? 0),
      client
    );
  });

  const overallSummary = {
    stages: IMPORT_STAGE_SEQUENCE,
    staging: stagingSummary,
    master: masterSummary,
    sales: salesSummary,
    customerPayments: Number(paymentsCount ?? 0),
    stockMovements: Number(stockCount ?? 0),
    reconciliation,
  };

  await updateImportStatus(job.id, 'completed', {
    finished_at: new Date().toISOString(),
    current_stage: null,
    last_error_stage: null,
    error_message: null,
    summary: JSON.stringify(overallSummary),
    report_path: (reconciliation as { csvPath: string }).csvPath,
    report_json_path: (reconciliation as { jsonPath: string }).jsonPath,
    reconciliation_version: (reconciliation as { version: string }).version,
    last_heartbeat: new Date().toISOString(),
  });

  await appendLog(job.id, 'info', 'Legacy data import completed successfully');
}

function getQueueConnection(): IORedis {
  if (queueConnection) {
    return queueConnection;
  }

  queueConnection = new IORedis({
    host: env.REDIS_HOST,
    port: env.REDIS_PORT,
    db: env.REDIS_DB,
    password: env.REDIS_PASSWORD,
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
  });
  return queueConnection;
}

async function ensureQueueInfra(): Promise<void> {
  if (importQueue && dlqQueue && importWorker) {
    return;
  }

  const connection = getQueueConnection();
  if (!importQueue) {
    importQueue = new Queue<LegacyImportQueuePayload>(env.LEGACY_IMPORT_QUEUE_NAME, { connection });
  }
  if (!dlqQueue) {
    dlqQueue = new Queue<Record<string, unknown>>(env.LEGACY_IMPORT_DLQ_NAME, { connection });
  }
  if (importWorker) {
    return;
  }

  importWorker = new Worker<LegacyImportQueuePayload>(
    env.LEGACY_IMPORT_QUEUE_NAME,
    async (job) => {
      await processLegacyImportJob(job);
    },
    { connection, concurrency: 1 }
  );
}

async function getJobRecord(importId: string): Promise<LegacyImportJob | null> {
  const { rows } = await runDbQuery<{
    id: string;
    session_id: string;
    session_dir: string;
    overwrite: boolean;
    created_by: string;
  }>(
    `select id, session_id, session_dir, overwrite, created_by
     from system_legacy_import
     where id = $1`,
    [importId]
  );
  const row = rows[0];
  if (!row) {
    return null;
  }
  return {
    id: row.id,
    sessionId: row.session_id,
    sessionDir: row.session_dir,
    overwrite: row.overwrite,
    userId: row.created_by,
  };
}

async function processLegacyImportJob(job: Job<LegacyImportQueuePayload>): Promise<void> {
  const importId = job.data.importId;
  const attemptNumber = job.attemptsMade + 1;
  const importRecord = await getJobRecord(importId);
  if (!importRecord) {
    return;
  }

  await updateImportStatus(importId, 'running', {
    started_at: new Date().toISOString(),
    finished_at: null,
    retry_count: Math.max(0, attemptNumber - 1),
    error_message: null,
    current_stage: null,
    last_heartbeat: new Date().toISOString(),
  });
  await appendLog(importId, 'info', `Processing import attempt ${attemptNumber}`);

  try {
    await runImport(importRecord);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const maxAttempts = Number(job.opts.attempts ?? env.LEGACY_IMPORT_JOB_ATTEMPTS);
    const isLastAttempt = attemptNumber >= maxAttempts;

    if (isLastAttempt) {
      await updateImportStatus(importId, 'failed', {
        finished_at: new Date().toISOString(),
        current_stage: null,
        error_message: message,
        last_heartbeat: new Date().toISOString(),
      });

      await runDbQuery(
        `insert into system_legacy_import_dead_letter (import_id, session_id, attempts, error_message, payload)
         values ($1, $2, $3, $4, $5::jsonb)`,
        [
          importId,
          importRecord.sessionId,
          attemptNumber,
          message,
          JSON.stringify({
            importId,
            sessionId: importRecord.sessionId,
            attemptNumber,
            failedAt: new Date().toISOString(),
          }),
        ]
      );

      if (dlqQueue) {
        await dlqQueue.add(
          'legacy-import-dlq',
          {
            importId,
            sessionId: importRecord.sessionId,
            attempts: attemptNumber,
            error: message,
            failedAt: new Date().toISOString(),
          },
          {
            jobId: importId,
            removeOnComplete: 1000,
            removeOnFail: 5000,
          }
        );
      }
    } else {
      await updateImportStatus(importId, 'retrying', {
        current_stage: null,
        error_message: message,
        last_heartbeat: new Date().toISOString(),
      });
    }

    await appendLog(importId, 'error', `Import attempt ${attemptNumber} failed: ${message}`);
    throw error;
  }
}

async function enqueuePendingImportsFromDatabase(): Promise<void> {
  await runDbQuery(
    `update system_legacy_import
     set status = 'retrying',
         error_message = coalesce(error_message, 'service restarted while import was running'),
         last_heartbeat = now()
     where status = 'running'
       and finished_at is null`
  );

  const { rows } = await runDbQuery<{ id: string }>(
    `select id
     from system_legacy_import
     where status in ('queued', 'retrying')
     order by created_at asc`
  );

  for (const row of rows) {
    await queueLegacyImport({ id: row.id });
  }
}

export async function queueLegacyImport(job: { id: string } & Partial<Omit<LegacyImportJob, 'id'>>): Promise<void> {
  await ensureQueueInfra();
  if (!importQueue) {
    throw new Error('legacy import queue not initialized');
  }

  const existing = await importQueue.getJob(job.id);
  if (existing) {
    return;
  }

  await importQueue.add(
    'legacy-import',
    { importId: job.id },
    {
      jobId: job.id,
      attempts: env.LEGACY_IMPORT_JOB_ATTEMPTS,
      backoff: {
        type: 'fixed',
        delay: env.LEGACY_IMPORT_JOB_BACKOFF_MS,
      },
      removeOnComplete: 1000,
      removeOnFail: 5000,
    }
  );
}

export async function initializeLegacyImportWorker(): Promise<void> {
  if (initialized) return;
  initialized = true;

  await assertLegacyImportSchemaReady();
  await ensureQueueInfra();
  await enqueuePendingImportsFromDatabase();
}

export async function getLegacyImportStatus(sessionId: string): Promise<LegacyImportStatus | null> {
  const { rows } = await runDbQuery<{
    id: string;
    overwrite: boolean;
    status: string;
    created_at: string;
    started_at: string | null;
    finished_at: string | null;
    retry_count: number | null;
    current_stage: string | null;
    last_error_stage: string | null;
    reconciliation_version: string | null;
    summary: unknown;
    error_message: string | null;
    report_path: string | null;
    report_json_path: string | null;
  }>(
    `select id, overwrite, status, created_at, started_at, finished_at, retry_count, current_stage, last_error_stage,
            reconciliation_version, summary, error_message, report_path, report_json_path
     from system_legacy_import where session_id = $1`,
    [sessionId]
  );
  const record = rows[0];
  if (!record) return null;

  const logRows = await runDbQuery<{ level: string; message: string; created_at: string }>(
    `select level, message, created_at from system_legacy_import_log where import_id = $1 order by id`,
    [record.id]
  );
  const checkpointRows = await runDbQuery<{
    stage: string;
    status: LegacyImportCheckpointStatus;
    started_at: string | null;
    finished_at: string | null;
    summary: unknown;
    error_message: string | null;
  }>(
    `select stage, status, started_at, finished_at, summary, error_message
     from system_legacy_import_checkpoint
     where import_id = $1
     order by created_at asc`,
    [record.id]
  );

  let summary: unknown = null;
  if (record.summary != null) {
    if (typeof record.summary === 'string') {
      try {
        summary = JSON.parse(record.summary);
      } catch (error) {
        summary = { raw: record.summary, parseError: (error as Error).message };
      }
    } else {
      summary = record.summary;
    }
  }

  return {
    status: record.status,
    overwrite: record.overwrite,
    createdAt: record.created_at,
    startedAt: record.started_at,
    finishedAt: record.finished_at,
    retryCount: Number(record.retry_count ?? 0),
    currentStage: record.current_stage,
    lastErrorStage: record.last_error_stage,
    reconciliationVersion: record.reconciliation_version,
    summary,
    error: record.error_message,
    reportAvailable: Boolean(record.report_path),
    reportJsonAvailable: Boolean(record.report_json_path),
    checkpoints: checkpointRows.rows.map((checkpoint) => ({
      stage: checkpoint.stage,
      status: checkpoint.status,
      startedAt: checkpoint.started_at,
      finishedAt: checkpoint.finished_at,
      summary: checkpoint.summary,
      error: checkpoint.error_message,
    })),
    logs: logRows.rows.map((log) => ({
      level: log.level,
      message: log.message,
      createdAt: log.created_at,
    })),
  };
}

export async function getLegacyImportReport(sessionId: string): Promise<{ path: string; filename: string } | null> {
  const { rows } = await runDbQuery<{ report_path: string | null }>(`select report_path from system_legacy_import where session_id = $1`, [
    sessionId,
  ]);
  const record = rows[0];
  if (!record || !record.report_path) {
    return null;
  }
  return { path: record.report_path, filename: path.basename(record.report_path) };
}

export async function getLegacyImportReportJson(sessionId: string): Promise<{ path: string; filename: string } | null> {
  const { rows } = await runDbQuery<{ report_json_path: string | null }>(
    `select report_json_path from system_legacy_import where session_id = $1`,
    [sessionId]
  );
  const record = rows[0];
  if (!record || !record.report_json_path) {
    return null;
  }
  return { path: record.report_json_path, filename: path.basename(record.report_json_path) };
}



