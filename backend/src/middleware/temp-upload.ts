import multer from 'multer';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { mkdirSync, promises as fsp } from 'node:fs';

type TempUploadOptions = {
  folder: string;
  fileSize: number;
  files?: number;
};

const tempRoot = path.join(os.tmpdir(), 'pos-api-uploads');
mkdirSync(tempRoot, { recursive: true });

export function createTempDiskUpload({ folder, fileSize, files = 1 }: TempUploadOptions): multer.Multer {
  const destination = path.join(tempRoot, folder);
  mkdirSync(destination, { recursive: true });

  return multer({
    storage: multer.diskStorage({
      destination: (_req, _file, callback) => callback(null, destination),
      filename: (_req, file, callback) => {
        const ext = path.extname(file.originalname).toLowerCase();
        callback(null, `${Date.now()}-${randomUUID()}${ext}`);
      },
    }),
    limits: {
      fileSize,
      files,
    },
  });
}

export async function cleanupUploadedFile(file?: Express.Multer.File | null): Promise<void> {
  if (!file?.path) {
    return;
  }
  await fsp.rm(file.path, { force: true }).catch(() => {});
}

export async function cleanupUploadedFiles(files?: Express.Multer.File[] | null): Promise<void> {
  if (!files?.length) {
    return;
  }
  await Promise.all(files.map((file) => cleanupUploadedFile(file)));
}
