import path from 'node:path';
import os from 'node:os';
import { promises as fsp } from 'node:fs';
import extract from 'extract-zip';
import { DBFFile } from 'dbffile';
import { query, withTransaction } from '../db.js';

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
  summary: unknown;
  error: string | null;
  reportAvailable: boolean;
  logs: LegacyImportStatusLog[];
};

const jobQueue: LegacyImportJob[] = [];
let processing = false;
let initialized = false;

const REQUIRED_FILES = ['PRODUTO.DBF', 'GRUPO.DBF', 'CLIENTES.DBF', 'VENDEDOR.DBF', 'VENDAS.DBF', 'PAGAMENT.DBF'];

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
      { name: 'nome', field: 'NOME' },
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
      { name: 'esto_min', field: 'ESTO_MIN' },
      { name: 'avista', field: 'AVISTA' },
      { name: 'preco_base', field: 'PRECO_BASE' },
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
      { name: 'status', field: 'STATUS' },
      { name: 'obs', field: 'OBS' },
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

async function appendLog(importId: string, level: 'info' | 'warn' | 'error', message: string): Promise<void> {
  await query(
    `insert into system_legacy_import_log (import_id, level, message) values ($1, $2, $3)`,
    [importId, level, message]
  );
}

async function updateImportStatus(
  importId: string,
  status: string,
  fields: Record<string, unknown> = {}
): Promise<void> {
  const keys = Object.keys(fields);
  const sets = ['status = $2'];
  const values: unknown[] = [importId, status];
  keys.forEach((key, index) => {
    sets.push(`${key} = $${index + 3}`);
    values.push(fields[key]);
  });
  await query(`update system_legacy_import set ${sets.join(', ')} where id = $1`, values);
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

async function ensureStagingTable(config: StagingConfig): Promise<void> {
  const columns = config.columns
    .map((column) => `${column.name} text`)
    .join(', ');
  await query(`create table if not exists ${config.table} (${columns})`);
  await query(`truncate ${config.table}`);
}

async function loadDbfIntoStaging(
  importId: string,
  config: StagingConfig,
  files: Map<string, string>
): Promise<number> {
  const filePath = files.get(config.file);
  if (!filePath) {
    await appendLog(importId, 'warn', `Optional file ${config.file} not provided; skipping.`);
    return 0;
  }

  await ensureStagingTable(config);

  const dbf = await DBFFile.open(filePath, { encoding: 'latin1' });
  let total = 0;

  while (true) {
    const records = await dbf.readRecords(500);
    if (!records.length) break;
    for (const record of records) {
      const values = config.columns.map((column) => {
        const value = record[column.field];
        if (value instanceof Date) {
          return value.toISOString();
        }
        if (value === null || value === undefined) return null;
        return String(value).trim();
      });
      const placeholders = values.map((_, index) => `$${index + 1}`).join(', ');
      await query(`insert into ${config.table} (${config.columns.map((c) => c.name).join(', ')}) values (${placeholders})`, values);
      total += 1;
    }
  }

  return total;
}

async function truncateCoreTables(): Promise<void> {
  await query('truncate sale_item cascade');
  await query('truncate sale cascade');
  await query('truncate customer_payment cascade');
  await query('truncate stock_movement cascade');
  await query('truncate product cascade');
  await query('truncate product_group cascade');
  await query('truncate customer cascade');
  await query('truncate seller cascade');
  await query('truncate payment_term cascade');
}

async function truncateStagingTables(): Promise<void> {
  for (const config of STAGING_CONFIG) {
    await query(`truncate ${config.table}`);
  }
}

async function waitForDatabaseReady(retries = 20, delayMs = 1500): Promise<void> {
  for (let attempt = 0; attempt < retries; attempt += 1) {
    try {
      await query('select 1');
      return;
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (code !== '57P03' && code !== 'ECONNREFUSED') {
        throw error;
      }
      if (attempt === retries - 1) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}

async function buildLegacyMap(table: string): Promise<Map<string, string>> {
  const { rows } = await query(`select legacy_code, id from ${table} where legacy_code is not null`);
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

async function buildCustomerLegacyMap(): Promise<Map<string, string>> {
  const { rows } = await query(`select legacy_code, id from customer where legacy_code is not null`);
  const map = new Map<string, string>();
  for (const row of rows) {
    if (!row.legacy_code) continue;
    const variants = buildLegacyVariants(String(row.legacy_code));
    variants.forEach((variant) => map.set(variant, row.id));
  }
  return map;
}

async function buildProductLegacyMap(): Promise<Map<string, string>> {
  const { rows } = await query(`select legacy_code, id from product where legacy_code is not null`);
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

async function migrateMasterData(overwrite: boolean): Promise<Record<string, number>> {
  const summary: Record<string, number> = {};

  await query(`
    insert into product_group (legacy_code, name)
    select trim(cod_grup),
           coalesce(nullif(trim(nome), ''), trim(cod_grup)) as name
    from stg_grupo
    where cod_grup is not null
    on conflict (legacy_code) do update
      set name = excluded.name
  `);
  summary.productGroups = Number((await query('select count(*) from stg_grupo')).rows[0].count);

  await query(`
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
  `);
  summary.products = Number((await query('select count(*) from stg_produto')).rows[0].count);

  await query(`
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
      case when trim(s.status) = '' or s.status is null then 'active' else lower(trim(s.status)) end,
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
  `);
  summary.customers = Number((await query('select count(*) from stg_clientes')).rows[0].count);

  await query(`
    insert into seller (legacy_code, name)
    select trim(codigo), nome
    from stg_vendedor
    where codigo is not null
    on conflict (legacy_code) do update set name = excluded.name
  `);
  summary.sellers = Number((await query('select count(*) from stg_vendedor')).rows[0].count);

  await query(`
    insert into payment_term (legacy_code, name)
    select trim(cod_fpg), forma
    from stg_forma_pg
    where cod_fpg is not null
    on conflict (legacy_code) do update set name = excluded.name
  `);
  summary.paymentTerms = Number((await query('select count(*) from stg_forma_pg')).rows[0].count);

  return summary;
}

async function migrateCustomerPayments(): Promise<number> {
  const { rows } = await query('select * from stg_pagament');
  const customerMap = await buildCustomerLegacyMap();
  let count = 0;
  for (const row of rows) {
    if (!row.cod_cli) continue;
    const customerId = resolveCustomerId(customerMap, row.cod_cli);
    if (!customerId) continue;
    const paid = normalizeNumber(row.vlr_pago);
    const documentValue = normalizeNumber(row.valor_doc);
    const remaining = normalizeNumber(row.restante);
    const amount = paid ?? documentValue;
    if (!amount || amount <= 0) continue;
    await query(
      `insert into customer_payment (
         customer_id,
         amount,
         payment_date,
         method,
         reference,
         notes,
         received_by,
         source,
         legacy_document_value,
         legacy_remaining
       )
       values ($1, $2, $3, 'legacy', null, null, null, 'legacy', $4, $5)`,
      [customerId, amount, normalizeDate(row.pagamento) ?? new Date(), documentValue, remaining]
    );
    count += 1;
  }
  return count;
}

async function migrateStockMovements(): Promise<number> {
  const { rows } = await query('select * from stg_mov_est');
  let count = 0;
  const productMap = await buildProductLegacyMap();
  for (const row of rows) {
    if (!row.cod_prod) continue;
    const productId = resolveProductId(productMap, row.cod_prod);
    if (!productId) continue;
    await query(
      `insert into stock_movement (product_id, date, type, quantity, unit_value, total, note_number)
       values ($1, $2, $3, $4, $5, $6, $7)`,
      [
        productId,
        normalizeDate(row.data),
        normalizeString(row.tip_mov),
        normalizeNumber(row.qtde),
        normalizeNumber(row.valor),
        normalizeNumber(row.total),
        normalizeString(row.nf),
      ]
    );
    count += 1;
  }
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

async function migrateSales(overwrite: boolean): Promise<SaleSummary> {
  const summary: SaleSummary = {
    sales: 0,
    saleItems: 0,
    orders: 0,
    orderItems: 0,
    mismatches: [],
  };

  if (overwrite) {
    await query(`delete from sale where source in ('VENDAS', 'PEDIDOS')`);
  }

  const sellerMap = await buildLegacyMap('seller');
  const customerMap = await buildCustomerLegacyMap();
  const paymentTermMap = await buildLegacyMap('payment_term');
  const productMap = await buildProductLegacyMap();

  const sales = await query('select * from stg_vendas');
  for (const row of sales.rows) {
    const sourceKey = row.pedido ? String(row.pedido).trim() : null;
    if (!sourceKey) continue;

    const emission = normalizeDate(row.emissao);
    const sellerId = row.cod_vend ? sellerMap.get(String(row.cod_vend).trim()) : null;
    const customerId = row.cod_cli ? resolveCustomerId(customerMap, row.cod_cli) : null;
    const paymentTermId = row.cod_fpg ? paymentTermMap.get(String(row.cod_fpg).trim()) : null;

    const saleResult = await query(
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
        sourceKey,
        sellerId ?? null,
        customerId ?? null,
        paymentTermId ?? null,
        normalizeNumber(row.sub_total),
        normalizeNumber(row.desconto),
        normalizeNumber(row.total_gera),
        sourceKey,
      ]
    );

    const saleId = saleResult.rows[0].id;
    await query('delete from sale_item where sale_id = $1', [saleId]);

    const items = extractSaleItems(row);
    for (const item of items) {
      const productId = resolveProductId(productMap, item.cod);
      if (!productId) {
        summary.mismatches.push(`Sale ${sourceKey}: product ${item.cod} not found`);
        continue;
      }
      await query(
        `insert into sale_item (sale_id, product_id, quantity, unit_price, total)
         values ($1, $2, $3, $4, $5)`,
        [saleId, productId, item.quantity, item.price, item.total]
      );
      summary.saleItems += 1;
    }
    summary.sales += 1;
  }

  const orders = await query('select * from stg_pedidos');
  for (const row of orders.rows) {
    const sourceKey = row.pedido ? String(row.pedido).trim() : null;
    if (!sourceKey) continue;

    const emission = normalizeDate(row.emissao);
    const sellerId = row.cod_vend ? sellerMap.get(String(row.cod_vend).trim()) : null;
    const customerId = row.cod_cli ? resolveCustomerId(customerMap, row.cod_cli) : null;
    const paymentTermId = row.cod_fpg ? paymentTermMap.get(String(row.cod_fpg).trim()) : null;

    const saleResult = await query(
      `insert into sale (emission_date, order_number, seller_id, customer_id, payment_term_id, subtotal, discount, total, source, source_key, status)
        values ($1, $2, $3, $4, $5, $6, $7, $8, 'PEDIDOS', $9, 'draft')
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
        sourceKey,
        sellerId ?? null,
        customerId ?? null,
        paymentTermId ?? null,
        normalizeNumber(row.sub_total),
        normalizeNumber(row.desconto),
        normalizeNumber(row.total_gera),
        sourceKey,
      ]
    );

    const saleId = saleResult.rows[0].id;
    await query('delete from sale_item where sale_id = $1', [saleId]);

    const items = extractSaleItems(row);
    for (const item of items) {
      const productId = resolveProductId(productMap, item.cod);
      if (!productId) {
        summary.mismatches.push(`Order ${sourceKey}: product ${item.cod} not found`);
        continue;
      }
      await query(
        `insert into sale_item (sale_id, product_id, quantity, unit_price, total)
         values ($1, $2, $3, $4, $5)`,
        [saleId, productId, item.quantity, item.price, item.total]
      );
      summary.orderItems += 1;
    }
    summary.orders += 1;
  }

  return summary;
}

async function createReconciliationReport(
  sessionDir: string,
  summary: Record<string, unknown>,
  saleSummary: SaleSummary,
  payments: number,
  stocks: number
): Promise<string> {
  const reportPath = path.join(sessionDir, `reconciliation_${Date.now()}.csv`);
  const lines: string[] = [];
  lines.push('metric,legacy_value,imported_value,notes');
  const productLegacy = summary.productGroups ?? 0;
  const productsLegacy = summary.products ?? 0;
  const customerLegacy = summary.customers ?? 0;
  const paymentLegacy = payments;
  const stockLegacy = stocks;

  const targetProducts = (await query('select count(*) from product')).rows[0].count;
  const targetCustomers = (await query('select count(*) from customer')).rows[0].count;
  const targetSales = (await query("select count(*) from sale where source = 'VENDAS'")).rows[0].count;
  const targetSaleItems = (await query("select count(*) from sale_item si join sale s on s.id = si.sale_id where s.source = 'VENDAS'")).rows[0].count;
  const targetOrders = (await query("select count(*) from sale where source = 'PEDIDOS'")).rows[0].count;
  const targetOrderItems = (await query("select count(*) from sale_item si join sale s on s.id = si.sale_id where s.source = 'PEDIDOS'")).rows[0].count;

  lines.push(`product_groups,${productLegacy},,`);
  lines.push(`products,${productsLegacy},${targetProducts},`);
  lines.push(`customers,${customerLegacy},${targetCustomers},`);
  lines.push(`sales,${saleSummary.sales},${targetSales},`);
  lines.push(`sale_items,${saleSummary.saleItems},${targetSaleItems},`);
  lines.push(`orders,${saleSummary.orders},${targetOrders},`);
  lines.push(`order_items,${saleSummary.orderItems},${targetOrderItems},`);
  lines.push(`customer_payments,${paymentLegacy},${(await query('select count(*) from customer_payment')).rows[0].count},`);
  lines.push(`stock_movements,${stockLegacy},${(await query('select count(*) from stock_movement')).rows[0].count},`);

  if (saleSummary.mismatches.length) {
    saleSummary.mismatches.forEach((mismatch) => {
      lines.push(`mismatch,,,"${mismatch.replace(/"/g, '""')}"`);
    });
  }

  await fsp.writeFile(reportPath, lines.join(os.EOL), 'utf8');
  return reportPath;
}

async function runImport(job: LegacyImportJob): Promise<void> {
  await updateImportStatus(job.id, 'running', { started_at: new Date().toISOString() });
  await appendLog(job.id, 'info', 'Preparing legacy files for import');

  const filesMap = await prepareLegacyFiles(job.sessionDir);

  for (const required of REQUIRED_FILES) {
    if (!filesMap.has(required)) {
      throw new Error(`Required legacy file ${required} missing after extraction`);
    }
  }

  await ensureSchema();

  if (job.overwrite) {
    await appendLog(job.id, 'info', 'Clearing existing data before import');
    await truncateCoreTables();
  }
  await truncateStagingTables();

  const stagingSummary: Record<string, number> = {};
  for (const config of STAGING_CONFIG) {
    await appendLog(job.id, 'info', `Loading ${config.file} into staging table ${config.table}`);
    const count = await loadDbfIntoStaging(job.id, config, filesMap);
    stagingSummary[config.table] = count;
  }

  await appendLog(job.id, 'info', 'Migrating master data (products, customers, sellers, payment terms)');
  const masterSummary = await migrateMasterData(job.overwrite);

  await appendLog(job.id, 'info', 'Migrating sales and sale items');
  const salesSummary = await migrateSales(job.overwrite);

  await appendLog(job.id, 'info', 'Migrating customer payments');
  const paymentsCount = await migrateCustomerPayments();

  await appendLog(job.id, 'info', 'Migrating stock movements');
  const stockCount = await migrateStockMovements();

  await appendLog(job.id, 'info', 'Generating reconciliation report');
  const reportPath = await createReconciliationReport(job.sessionDir, masterSummary, salesSummary, paymentsCount, stockCount);

  const overallSummary = {
    staging: stagingSummary,
    master: masterSummary,
    sales: salesSummary,
    customerPayments: paymentsCount,
    stockMovements: stockCount,
    reportPath,
  };

  await updateImportStatus(job.id, 'completed', {
    finished_at: new Date().toISOString(),
    summary: JSON.stringify(overallSummary),
    report_path: reportPath,
    error_message: null,
  });

  await appendLog(job.id, 'info', 'Legacy data import completed successfully');
}

async function processQueue(): Promise<void> {
  if (processing) return;
  processing = true;
  while (jobQueue.length) {
    const job = jobQueue.shift();
    if (!job) continue;
    try {
      await runImport(job);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await appendLog(job.id, 'error', message);
      await updateImportStatus(job.id, 'failed', {
        finished_at: new Date().toISOString(),
        error_message: message,
      });
    }
  }
  processing = false;
}

async function ensureStagingTables(): Promise<void> {
  for (const config of STAGING_CONFIG) {
    const createColumns = config.columns.map((column) => `${column.name} text`).join(', ');
    await query(`create table if not exists ${config.table} (${createColumns})`);
    for (const column of config.columns) {
      await query(`alter table ${config.table} add column if not exists ${column.name} text`);
    }
  }
}

async function ensureCustomerPaymentSchema(): Promise<void> {
  const { rows } = await query<{ column_name: string }>(
    `select column_name
     from information_schema.columns
     where table_schema = 'public' and table_name = 'customer_payment'`
  );
  const existingColumns = new Set(rows.map((row) => row.column_name));

  const columnStatements = [
    `alter table customer_payment add column if not exists amount numeric(14,2)`,
    `alter table customer_payment add column if not exists method text`,
    `alter table customer_payment add column if not exists reference text`,
    `alter table customer_payment add column if not exists notes text`,
    `alter table customer_payment add column if not exists received_by uuid`,
    `alter table customer_payment add column if not exists source text`,
    `alter table customer_payment add column if not exists created_at timestamptz`,
    `alter table customer_payment add column if not exists legacy_document_value numeric(14,2)`,
    `alter table customer_payment add column if not exists legacy_remaining numeric(14,2)`,
  ];

  for (const statement of columnStatements) {
    await query(statement);
  }

  if (existingColumns.has('paid_value')) {
    await query(
      `update customer_payment
       set amount = paid_value
       where amount is null and paid_value is not null`
    );
  }

  if (existingColumns.has('document_value')) {
    await query(
      `update customer_payment
       set amount = document_value
       where amount is null and document_value is not null`
    );
    await query(
      `update customer_payment
       set legacy_document_value = document_value
       where legacy_document_value is null and document_value is not null`
    );
  }

  if (existingColumns.has('remaining')) {
    await query(
      `update customer_payment
       set legacy_remaining = remaining
       where legacy_remaining is null and remaining is not null`
    );
  }

  await query(`update customer_payment set amount = 0 where amount is null`);
  await query(`update customer_payment set method = 'legacy' where method is null or method = ''`);
  await query(`update customer_payment set source = 'legacy' where source is null or source = ''`);
  await query(
    `update customer_payment
     set created_at = coalesce(created_at, payment_date::timestamptz, now())
     where created_at is null`
  );
  await query(
    `update customer_payment
     set legacy_document_value = coalesce(legacy_document_value, amount)
     where legacy_document_value is null`
  );
  await query(
    `update customer_payment
     set legacy_remaining = coalesce(legacy_remaining, 0)
     where legacy_remaining is null`
  );
  await query(
    `update customer_payment
     set payment_date = current_date
     where payment_date is null`
  );

  await query(`alter table customer_payment alter column amount set not null`);
  await query(`alter table customer_payment alter column method set not null`);
  await query(`alter table customer_payment alter column source set not null`);
  await query(`alter table customer_payment alter column created_at set not null`);
  await query(`alter table customer_payment alter column payment_date set default now()`);
  await query(`alter table customer_payment alter column method set default 'cash'`);
  await query(`alter table customer_payment alter column source set default 'manual'`);
  await query(`alter table customer_payment alter column created_at set default now()`);

  await query(`
    do $$
    begin
      alter table customer_payment
        add constraint customer_payment_method_check
        check (method in ('cash','card','bank','other','legacy'));
    exception
      when duplicate_object then null;
    end $$;
  `);

  await query(`
    do $$
    begin
      alter table customer_payment
        add constraint customer_payment_source_check
        check (source in ('manual','legacy'));
    exception
      when duplicate_object then null;
    end $$;
  `);

  await query(`
    do $$
    begin
      alter table customer_payment
        add constraint customer_payment_amount_check
        check (amount >= 0);
    exception
      when duplicate_object then null;
    end $$;
  `);
}

async function ensureCoreTables(): Promise<void> {
  await query(`
    create table if not exists product_group (
      id uuid primary key default gen_random_uuid(),
      legacy_code text unique,
      name text not null
    )
  `);

  await query(`
    create table if not exists product (
      id uuid primary key default gen_random_uuid(),
      legacy_code text unique,
      name text not null,
      barcode text,
      group_id uuid references product_group(id),
      reference text,
      min_stock numeric(14,3),
      price_cash numeric(14,2),
      price_base numeric(14,2)
    )
  `);

  await query(`
    create table if not exists customer (
      id uuid primary key default gen_random_uuid(),
      legacy_code text unique,
      name text not null,
      cpf text,
      address text,
      city text,
      uf text,
      cep text,
      phone text,
      status text not null default 'active',
      credit_limit numeric(14,2),
      notes text
    )
  `);

  await query(`
    create table if not exists seller (
      id uuid primary key default gen_random_uuid(),
      legacy_code text unique,
      name text not null
    )
  `);

  await query(`
    create table if not exists payment_term (
      id uuid primary key default gen_random_uuid(),
      legacy_code text unique,
      name text not null
    )
  `);

  await query(`
    create table if not exists app_role (
      id uuid primary key default gen_random_uuid(),
      name text not null unique,
      description text,
      permissions jsonb not null default '[]'::jsonb,
      discount_limit numeric(14,2) default 0
    )
  `);

  await query(`
    create table if not exists app_user (
      id uuid primary key default gen_random_uuid(),
      email text not null unique,
      password_hash text not null,
      full_name text not null,
      role_id uuid references app_role(id),
      status text not null default 'active',
      last_login_at timestamptz,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )
  `);

  await query(`
    create table if not exists sale (
      id uuid primary key default gen_random_uuid(),
      emission_date date not null,
      order_number text,
      seller_id uuid references seller(id),
      customer_id uuid references customer(id),
      payment_term_id uuid references payment_term(id),
      subtotal numeric(14,2),
      discount numeric(14,2),
      total numeric(14,2),
      status text not null default 'completed' check (status in ('draft','completed','cancelled')),
      cancelled_at timestamptz,
      cancellation_reason text,
      source text,
      source_key text,
      unique (source, source_key)
    )
  `);

  await query(`
    create table if not exists sale_item (
      id uuid primary key default gen_random_uuid(),
      sale_id uuid references sale(id) on delete cascade,
      product_id uuid references product(id),
      quantity numeric(14,3) not null,
      unit_price numeric(14,2),
      total numeric(14,2)
    )
  `);

  await query(`
    create table if not exists customer_payment (
      id uuid primary key default gen_random_uuid(),
      customer_id uuid not null references customer(id) on delete cascade,
      amount numeric(14,2) not null check (amount > 0),
      payment_date date not null default now(),
      method text not null default 'cash' check (method in ('cash', 'card', 'bank', 'other', 'legacy')),
      reference text,
      notes text,
      received_by uuid references app_user(id),
      source text not null default 'manual' check (source in ('manual', 'legacy')),
      created_at timestamptz not null default now(),
      legacy_document_value numeric(14,2),
      legacy_remaining numeric(14,2)
    )
  `);
  await ensureCustomerPaymentSchema();
  await query(`create index if not exists idx_customer_payment_customer on customer_payment(customer_id)`);
  await query(
    `create index if not exists idx_customer_payment_customer_date on customer_payment(customer_id, payment_date desc, created_at desc)`
  );

  await query(`
    create table if not exists stock_movement (
      id uuid primary key default gen_random_uuid(),
      date date not null,
      type char(1) not null check (type in ('E','S')),
      product_id uuid references product(id),
      quantity numeric(14,3) not null,
      unit_value numeric(14,2),
      total numeric(14,2),
      note_number text
    )
  `);
}

async function ensureLegacyImportTables(): Promise<void> {
  await query(`
    create table if not exists system_legacy_import (
      id uuid primary key default gen_random_uuid(),
      session_id text not null unique,
      session_dir text not null,
      overwrite boolean not null default false,
      status text not null default 'queued',
      created_at timestamptz not null default now(),
      started_at timestamptz,
      finished_at timestamptz,
      created_by uuid references app_user(id),
      report_path text,
      summary jsonb,
      error_message text
    )
  `);

  await query(`
    create table if not exists system_legacy_import_log (
      id bigserial primary key,
      import_id uuid not null references system_legacy_import(id) on delete cascade,
      level text not null default 'info',
      message text not null,
      created_at timestamptz not null default now()
    )
  `);

  await query(`create index if not exists idx_system_legacy_import_status on system_legacy_import(status)`);
  await query(
    `create index if not exists idx_system_legacy_import_log_import on system_legacy_import_log(import_id, created_at)`
  );
}

async function ensureSchema(): Promise<void> {
  await waitForDatabaseReady();
  await query(`create extension if not exists pgcrypto`);
  await ensureCoreTables();
  await ensureLegacyImportTables();
  await ensureStagingTables();
}

export async function queueLegacyImport(job: LegacyImportJob): Promise<void> {
  jobQueue.push(job);
  void processQueue();
}

export async function initializeLegacyImportWorker(): Promise<void> {
  if (initialized) return;
  initialized = true;
  await ensureSchema();
  await query(`update system_legacy_import set status = 'queued', started_at = null where status = 'running'`);
  const { rows } = await query(
    `select id, session_id, session_dir, overwrite, created_by from system_legacy_import where status = 'queued' order by created_at`
  );
  for (const row of rows) {
    jobQueue.push({
      id: row.id,
      sessionId: row.session_id,
      sessionDir: row.session_dir,
      overwrite: row.overwrite,
      userId: row.created_by,
    });
  }
  if (jobQueue.length) {
    void processQueue();
  }
}

export async function getLegacyImportStatus(sessionId: string): Promise<LegacyImportStatus | null> {
  const { rows } = await query(
    `select id, overwrite, status, created_at, started_at, finished_at, summary, error_message, report_path
     from system_legacy_import where session_id = $1`,
    [sessionId]
  );
  const record = rows[0];
  if (!record) return null;

  const logRows = await query(
    `select level, message, created_at from system_legacy_import_log where import_id = $1 order by id`,
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
    summary,
    error: record.error_message,
    reportAvailable: Boolean(record.report_path),
    logs: logRows.rows.map((log) => ({
      level: log.level,
      message: log.message,
      createdAt: log.created_at,
    })),
  };
}

export async function getLegacyImportReport(sessionId: string): Promise<{ path: string; filename: string } | null> {
  const { rows } = await query(`select report_path from system_legacy_import where session_id = $1`, [sessionId]);
  const record = rows[0];
  if (!record || !record.report_path) {
    return null;
  }
  return { path: record.report_path, filename: path.basename(record.report_path) };
}


