import os from 'node:os';
import path from 'node:path';
import { promises as fsp } from 'node:fs';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import type { Express } from 'express';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const queryMock = vi.fn();
const withTransactionMock = vi.fn();

const createBackupArchiveMock = vi.fn();
const restoreBackupArchiveMock = vi.fn();
const queueLegacyImportMock = vi.fn();
const initializeLegacyImportWorkerMock = vi.fn();

vi.mock('../../src/db.js', () => ({
  query: queryMock,
  withTransaction: withTransactionMock,
}));

vi.mock('../../src/utils/backup.js', () => ({
  BACKUP_RETENTION_COUNT: 7,
  createBackupArchive: createBackupArchiveMock,
  deleteBackupFile: vi.fn(),
  ensureBackupDirectory: vi.fn(async () => undefined),
  getBackupDirectory: vi.fn(() => path.join(os.tmpdir(), 'pos-backups-tests')),
  sanitizeBackupFilename: vi.fn((filename: string) => filename),
  computeChecksum: vi.fn(async () => 'checksum'),
  restoreBackupArchive: restoreBackupArchiveMock,
}));

vi.mock('../../src/services/legacy-importer.js', () => ({
  getLegacyImportReport: vi.fn(),
  getLegacyImportStatus: vi.fn(),
  initializeLegacyImportWorker: initializeLegacyImportWorkerMock,
  queueLegacyImport: queueLegacyImportMock,
}));

function sqlLike(statement: string): string {
  return statement.toLowerCase().replace(/\s+/g, ' ').trim();
}

function makeAuthUser(overrides?: Partial<Record<string, unknown>>) {
  return {
    id: 'user-1',
    email: 'admin@company.local',
    full_name: 'Admin User',
    status: 'active',
    role_name: 'admin',
    permissions: ['*'],
    discount_limit: '50',
    ...overrides,
  };
}

function withAuth(sql: string, rows: unknown[]) {
  if (sql.includes('from app_user u') && sql.includes('where u.id = $1')) {
    return {
      rows,
      rowCount: rows.length,
    };
  }

  return null;
}

const importRoot = path.join(os.tmpdir(), `pos-legacy-import-test-${Date.now()}`);

let createApp: () => Express;
let app: Express;

beforeAll(async () => {
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = 'test-secret';
  process.env.IMPORT_PATH = importRoot;
  process.env.METRICS_TOKEN = 'metrics-token';

  ({ createApp } = await import('../../src/app.js'));
});

beforeEach(() => {
  withTransactionMock.mockImplementation(async (fn: (client: unknown) => Promise<unknown>) => fn({}));
  queryMock.mockReset();
  withTransactionMock.mockClear();
  createBackupArchiveMock.mockReset();
  restoreBackupArchiveMock.mockReset();
  queueLegacyImportMock.mockReset();
  initializeLegacyImportWorkerMock.mockReset();

  createBackupArchiveMock.mockResolvedValue({
    filename: 'snapshot-2026.zip',
    fullPath: '/tmp/snapshot-2026.zip',
    sizeBytes: 1234,
    checksum: 'sha-256',
    metadata: {
      createdAt: new Date().toISOString(),
      schemaVersion: '1.0.0',
      generatedBy: 'test',
      id: 'meta-1',
    },
  });

  app = createApp();
});

afterEach(async () => {
  await fsp.rm(importRoot, { recursive: true, force: true });
});

afterAll(async () => {
  await fsp.rm(importRoot, { recursive: true, force: true });
});

function bearerToken(userId = 'user-1') {
  return jwt.sign({ sub: userId, role: 'admin' }, process.env.JWT_SECRET!, { expiresIn: '1h' });
}

describe('critical backend flows', () => {
  it('login: authenticates and returns bearer token', async () => {
    const passwordHash = await bcrypt.hash('super-secret', 10);

    queryMock.mockImplementation(async (statement: string) => {
      const sql = sqlLike(statement);

      if (sql.includes('where lower(u.email) = $1')) {
        return {
          rows: [
            {
              id: 'user-1',
              email: 'admin@company.local',
              password_hash: passwordHash,
              full_name: 'Admin User',
              status: 'active',
              role_name: 'admin',
              permissions: ['*'],
              discount_limit: '50',
            },
          ],
          rowCount: 1,
        };
      }

      if (sql.startsWith('update app_user set last_login_at = now(), updated_at = now() where id = $1')) {
        return { rows: [], rowCount: 1 };
      }

      throw new Error(`Unexpected SQL for login test: ${sql}`);
    });

    const response = await request(app).post('/api/v1/auth/login').send({
      email: 'admin@company.local',
      password: 'super-secret',
    });

    expect(response.status).toBe(200);
    expect(response.body.user.email).toBe('admin@company.local');
    expect(typeof response.body.token).toBe('string');
  });

  it('checkout: creates sale with items', async () => {
    queryMock.mockImplementation(async (statement: string) => {
      const sql = sqlLike(statement);
      const authResult = withAuth(sql, [makeAuthUser({ permissions: ['*', 'pos:checkout'], discount_limit: '20' })]);
      if (authResult) {
        return authResult;
      }

      if (sql.startsWith('insert into sale (')) {
        return {
          rows: [
            {
              id: 'sale-1',
              emission_date: '2026-04-14',
              order_number: null,
              seller_id: null,
              customer_id: null,
              payment_term_id: null,
              subtotal: '10.00',
              discount: '0.00',
              total: '10.00',
              status: 'completed',
              source: null,
              source_key: null,
              cancelled_at: null,
              cancellation_reason: null,
            },
          ],
          rowCount: 1,
        };
      }

      if (sql.startsWith('insert into sale_item (sale_id, product_id, quantity, unit_price, total)')) {
        return {
          rows: [
            {
              id: 'item-1',
              product_id: 'prod-1',
              quantity: '1',
              unit_price: '10.00',
              total: '10.00',
            },
          ],
          rowCount: 1,
        };
      }

      throw new Error(`Unexpected SQL for checkout test: ${sql}`);
    });

    const response = await request(app)
      .post('/api/v1/sales')
      .set('Authorization', `Bearer ${bearerToken()}`)
      .send({
        items: [{ product_id: 'prod-1', quantity: 1, unit_price: 10 }],
      });

    expect(response.status).toBe(201);
    expect(response.body.status).toBe('completed');
    expect(response.body.total).toBe(10);
    expect(response.body.items).toHaveLength(1);
  });

  it('payments: registers manual customer payment and returns updated summary', async () => {
    queryMock.mockImplementation(async (statement: string) => {
      const sql = sqlLike(statement);
      const authResult = withAuth(sql, [makeAuthUser({ permissions: ['*', 'catalog:write'] })]);
      if (authResult) {
        return authResult;
      }

      if (sql.startsWith('select id from customer where id = $1 for update')) {
        return { rows: [{ id: 'customer-1' }], rowCount: 1 };
      }

      if (sql.includes('from sale') && sql.includes('where customer_id = $1 and status =')) {
        return { rows: [{ total: '300.00' }], rowCount: 1 };
      }

      if (sql.includes('from customer_payment') && sql.includes('where customer_id = $1')) {
        return { rows: [{ total: '50.00' }], rowCount: 1 };
      }

      if (sql.startsWith('insert into customer_payment (')) {
        return {
          rows: [
            {
              id: 'payment-1',
              amount: '100.00',
              payment_date: '2026-04-14',
              method: 'cash',
              reference: null,
              notes: null,
              received_by: 'user-1',
              created_at: '2026-04-14T12:00:00.000Z',
            },
          ],
          rowCount: 1,
        };
      }

      throw new Error(`Unexpected SQL for payments test: ${sql}`);
    });

    const response = await request(app)
      .post('/api/v1/customers/customer-1/payments')
      .set('Authorization', `Bearer ${bearerToken()}`)
      .send({
        amount: 100,
        method: 'cash',
      });

    expect(response.status).toBe(201);
    expect(response.body.payment.amount).toBe(100);
    expect(response.body.summary.new_balance).toBe(150);
  });

  it('backup/restore: runs restore and keeps snapshot/rollback point', async () => {
    const passwordHash = await bcrypt.hash('admin-pass', 10);

    queryMock.mockImplementation(async (statement: string) => {
      const sql = sqlLike(statement);
      const authResult = withAuth(sql, [makeAuthUser({ permissions: ['*', 'system:backup:restore'] })]);
      if (authResult) {
        return authResult;
      }

      if (sql.startsWith('select password_hash from app_user where id = $1')) {
        return { rows: [{ password_hash: passwordHash }], rowCount: 1 };
      }

      if (sql.startsWith('select filename from system_backup where filename = $1')) {
        return { rows: [{ filename: 'backup-1.zip' }], rowCount: 1 };
      }

      if (sql.startsWith('insert into system_backup (filename, size_bytes, created_by, checksum, metadata)')) {
        return { rows: [{ id: 'snapshot-1' }], rowCount: 1 };
      }

      if (sql.startsWith('select id, filename from system_backup order by created_at desc offset $1')) {
        return { rows: [], rowCount: 0 };
      }

      if (sql.startsWith('insert into audit_log (user_id, action, details, ip_address)')) {
        return { rows: [], rowCount: 1 };
      }

      throw new Error(`Unexpected SQL for restore test: ${sql}`);
    });

    const response = await request(app)
      .post('/api/v1/admin/restore')
      .set('Authorization', `Bearer ${bearerToken()}`)
      .send({
        file: 'backup-1.zip',
        confirm: true,
        password: 'admin-pass',
      });

    expect(response.status).toBe(200);
    expect(response.body.restored).toBe(true);
    expect(restoreBackupArchiveMock).toHaveBeenCalledWith({ filename: 'backup-1.zip' });
  });

  it('legacy-import: accepts upload, persists session and queues async worker', async () => {
    const passwordHash = await bcrypt.hash('admin-pass', 10);

    queryMock.mockImplementation(async (statement: string) => {
      const sql = sqlLike(statement);
      const authResult = withAuth(sql, [makeAuthUser({ permissions: ['*', 'system:import:legacy'] })]);
      if (authResult) {
        return authResult;
      }

      if (sql.startsWith('select password_hash from app_user where id = $1')) {
        return { rows: [{ password_hash: passwordHash }], rowCount: 1 };
      }

      if (sql.startsWith('insert into system_legacy_import (session_id, session_dir, overwrite, status, created_by)')) {
        return { rows: [{ id: 'import-1' }], rowCount: 1 };
      }

      if (sql.startsWith('insert into audit_log (user_id, action, details, ip_address)')) {
        return { rows: [], rowCount: 1 };
      }

      throw new Error(`Unexpected SQL for legacy import test: ${sql}`);
    });

    const response = await request(app)
      .post('/api/v1/admin/import/legacy')
      .set('Authorization', `Bearer ${bearerToken()}`)
      .field('overwrite', 'true')
      .field('confirmation', 'IMPORT LEGACY DATA NOW')
      .field('password', 'admin-pass')
      .attach('files', Buffer.from('x'), 'PRODUTO.DBF')
      .attach('files', Buffer.from('x'), 'GRUPO.DBF')
      .attach('files', Buffer.from('x'), 'CLIENTES.DBF')
      .attach('files', Buffer.from('x'), 'VENDEDOR.DBF')
      .attach('files', Buffer.from('x'), 'VENDAS.DBF');

    expect(response.status).toBe(202);
    expect(response.body.status).toBe('queued');
    expect(queueLegacyImportMock).toHaveBeenCalledTimes(1);
  });
});

