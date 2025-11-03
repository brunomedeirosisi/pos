import { Router } from 'express';
import { query } from '../db.js';
import { asyncHandler } from '../utils/async-handler.js';

export const router = Router();

router.get(
  '/',
  asyncHandler(async (_req, res) => {
    const now = await query<{ now: string }>('select now()');
    res.json({ status: 'ok', time: now.rows[0].now });
  })
);
