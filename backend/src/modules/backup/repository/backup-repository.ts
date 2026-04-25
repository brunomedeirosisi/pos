import { query } from '../../../db.js';

type BackupRow = {
  id: string;
  filename: string;
  size_bytes: number | null;
  created_at: string;
  checksum: string | null;
  metadata: unknown;
  created_by_id: string | null;
  created_by_full_name: string | null;
};

export interface BackupRepository {
  listBackups(pagination: { limit: number; offset: number }): Promise<BackupRow[]>;
  findByFilename(filename: string): Promise<BackupRow | null>;
  insertBackupRecord(input: {
    filename: string;
    sizeBytes: number;
    createdBy: string;
    checksum: string | null;
    metadata: unknown;
  }): Promise<BackupRow>;
  deleteByFilename(filename: string): Promise<boolean>;
  getUserPasswordHash(userId: string): Promise<string | null>;
}

export class PgBackupRepository implements BackupRepository {
  async listBackups(pagination: { limit: number; offset: number }): Promise<BackupRow[]> {
    const { rows } = await query<BackupRow>(
      `select
         b.id,
         b.filename,
         b.size_bytes,
         b.created_at,
         b.checksum,
         b.metadata,
         u.id as created_by_id,
         u.full_name as created_by_full_name
       from system_backup b
       left join app_user u on u.id = b.created_by
       order by b.created_at desc
       limit $1
       offset $2`,
      [pagination.limit, pagination.offset]
    );

    return rows;
  }

  async findByFilename(filename: string): Promise<BackupRow | null> {
    const { rows } = await query<BackupRow>(
      `select
         b.id,
         b.filename,
         b.size_bytes,
         b.created_at,
         b.checksum,
         b.metadata,
         u.id as created_by_id,
         u.full_name as created_by_full_name
       from system_backup b
       left join app_user u on u.id = b.created_by
       where b.filename = $1`,
      [filename]
    );

    return rows[0] ?? null;
  }

  async insertBackupRecord(input: {
    filename: string;
    sizeBytes: number;
    createdBy: string;
    checksum: string | null;
    metadata: unknown;
  }): Promise<BackupRow> {
    const { rows } = await query<BackupRow>(
      `insert into system_backup (filename, size_bytes, created_by, checksum, metadata)
       values ($1, $2, $3, $4, $5::jsonb)
       returning id, filename, size_bytes, created_at, checksum, metadata, $3::uuid as created_by_id, null::text as created_by_full_name`,
      [input.filename, input.sizeBytes, input.createdBy, input.checksum, JSON.stringify(input.metadata)]
    );

    return rows[0];
  }

  async deleteByFilename(filename: string): Promise<boolean> {
    const { rowCount } = await query(
      `delete from system_backup
       where filename = $1`,
      [filename]
    );

    return (rowCount ?? 0) > 0;
  }

  async getUserPasswordHash(userId: string): Promise<string | null> {
    const { rows } = await query<{ password_hash: string }>('select password_hash from app_user where id = $1', [userId]);
    return rows[0]?.password_hash ?? null;
  }
}

export type { BackupRow };
