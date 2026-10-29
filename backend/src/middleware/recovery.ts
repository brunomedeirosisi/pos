import type { RequestHandler } from 'express';
import { acquireRecoveryLease, recoveryQuery } from '../services/recovery-control.js';

/** Keep the lease through response completion, including streaming and auth writes. */
export const recoveryMiddleware: RequestHandler = (req, res, next) => {
  void (async () => {
    if (req.path === '/admin/restore' && req.method === 'POST') {
      // The restore service acquires exclusive ownership after authentication,
      // password and payload validation; a shared lease here would deadlock it.
      const state = await recoveryQuery('select operation_id from pos_recovery.state where singleton');
      if (state.rows[0]?.operation_id) {
        res.setHeader('Retry-After', '5'); res.status(503).json({ message: 'database_restore_in_progress' }); return;
      }
      next(); return;
    }
    const lease = await acquireRecoveryLease();
    const release = () => { void lease.release(); };
    res.once('finish', release); res.once('close', release);
    lease.signal.addEventListener('abort', () => res.destroy(), { once: true });
    next();
  })().catch((error: unknown) => { res.setHeader('Retry-After', '5'); next(error); });
};
