import path from 'node:path';
import yauzl from 'yauzl';
import { badRequest } from '../errors.js';
import { assertArjArchive, isArjArchive } from './safe-arj.js';
import type { ArchivePolicy } from './safe-archive.js';

const ZIP_MIME_TYPES = new Set([
  'application/zip',
  'application/x-zip-compressed',
  'application/octet-stream',
]);

const LEGACY_ALLOWED_EXTENSIONS = new Set(['.dbf', '.dbt', '.zip', '.arj']);
const LEGACY_ALLOWED_MIME_TYPES = new Set([
  'application/octet-stream',
  'application/zip',
  'application/x-zip-compressed',
  'application/dbase',
  'application/x-dbf',
  'application/x-arj',
  'application/arj',
  'application/x-compressed',
  'text/plain',
]);

type UploadLike = Pick<Express.Multer.File, 'originalname' | 'mimetype'>;

export function isAllowedBackupUpload(file: UploadLike): boolean {
  const extension = path.extname(file.originalname).toLowerCase();
  return extension === '.zip' && ZIP_MIME_TYPES.has(file.mimetype);
}

export function isAllowedLegacyUpload(file: UploadLike): boolean {
  const ext = path.extname(file.originalname).toLowerCase();
  if (!LEGACY_ALLOWED_EXTENSIONS.has(ext)) {
    return false;
  }

  return LEGACY_ALLOWED_MIME_TYPES.has(file.mimetype);
}

/** Read the ZIP directory before queueing; extension and MIME alone do not establish its format. */
export function assertLegacyZipFormat(source: string): Promise<void> {
  return new Promise((resolve, reject) => {
    yauzl.open(source, { lazyEntries: true, strictFileNames: true }, (error, zip) => {
      if (error || !zip) {
        reject(badRequest('invalid_legacy_zip'));
        return;
      }
      zip.close();
      resolve();
    });
  });
}

export async function assertLegacyArchiveFormat(source: string, policy?: ArchivePolicy): Promise<void> {
  if (await isArjArchive(source)) await assertArjArchive(source, policy);
  else await assertLegacyZipFormat(source);
}
