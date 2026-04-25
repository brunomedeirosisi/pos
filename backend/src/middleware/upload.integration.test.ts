import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { badRequest } from '../errors.js';
import { errorHandler } from './error-handler.js';
import { cleanupUploadedFile, createTempDiskUpload } from './temp-upload.js';
import { isAllowedBackupUpload } from '../utils/upload-validation.js';

describe('upload hardening integration', () => {
  it('rejects invalid extension/mime uploads', async () => {
    const upload = createTempDiskUpload({
      folder: 'test-upload',
      fileSize: 2 * 1024 * 1024,
      files: 1,
    });

    const app = express();
    app.post('/upload', upload.single('file'), async (req, res, next) => {
      const file = req.file;
      try {
        if (!file) {
          throw badRequest('file is required');
        }
        if (!isAllowedBackupUpload(file)) {
          throw badRequest('invalid file type');
        }
        res.status(201).json({ ok: true });
      } catch (error) {
        next(error);
      } finally {
        await cleanupUploadedFile(file);
      }
    });
    app.use(errorHandler);

    const response = await request(app)
      .post('/upload')
      .attach('file', Buffer.from('not-a-zip'), { filename: 'not-valid.txt', contentType: 'text/plain' });

    expect(response.status).toBe(400);
    expect(response.body.message).toBe('invalid file type');
  });

  it('accepts zip upload with valid mime', async () => {
    const upload = createTempDiskUpload({
      folder: 'test-upload',
      fileSize: 2 * 1024 * 1024,
      files: 1,
    });

    const app = express();
    app.post('/upload', upload.single('file'), async (req, res, next) => {
      const file = req.file;
      try {
        if (!file) {
          throw badRequest('file is required');
        }
        if (!isAllowedBackupUpload(file)) {
          throw badRequest('invalid file type');
        }
        res.status(201).json({ ok: true });
      } catch (error) {
        next(error);
      } finally {
        await cleanupUploadedFile(file);
      }
    });
    app.use(errorHandler);

    const response = await request(app)
      .post('/upload')
      .attach('file', Buffer.from('PK\x03\x04dummy-zip-content'), {
        filename: 'backup.zip',
        contentType: 'application/zip',
      });

    expect(response.status).toBe(201);
    expect(response.body.ok).toBe(true);
  });
});
