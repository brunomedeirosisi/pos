import path from 'node:path';

const ZIP_MIME_TYPES = new Set([
  'application/zip',
  'application/x-zip-compressed',
  'application/octet-stream',
]);

const LEGACY_ALLOWED_EXTENSIONS = new Set(['.dbf', '.dbt', '.zip']);
const LEGACY_ALLOWED_MIME_TYPES = new Set([
  'application/octet-stream',
  'application/zip',
  'application/x-zip-compressed',
  'application/dbase',
  'application/x-dbf',
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
