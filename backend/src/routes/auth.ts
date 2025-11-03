import { Router } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import type { SignOptions } from 'jsonwebtoken';
import { query } from '../db.js';
import { badRequest, unauthorized } from '../errors.js';
import { asyncHandler } from '../utils/async-handler.js';
import { requireAuth } from '../middleware/auth.js';

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

type UserRow = {
  id: string;
  email: string;
  password_hash: string;
  full_name: string;
  status: string;
  role_name: string;
  permissions: string[];
  discount_limit: string | null;
};

export const router = Router();

router.post(
  '/login',
  asyncHandler(async (req, res) => {
    const { email, password } = loginSchema.parse(req.body);

    const { rows } = await query<UserRow>(
      `select
         u.id,
         u.email,
         u.password_hash,
         u.full_name,
         u.status,
         r.name as role_name,
         coalesce(r.permissions, '[]'::jsonb) as permissions,
         r.discount_limit
       from app_user u
       join app_role r on r.id = u.role_id
       where lower(u.email) = $1`,
      [email.toLowerCase()]
    );

    const user = rows[0];
    if (!user) {
      throw unauthorized('invalid credentials');
    }

    if (user.status !== 'active') {
      throw unauthorized('user disabled');
    }

    const passwordMatches = await bcrypt.compare(password, user.password_hash);
    if (!passwordMatches) {
      throw unauthorized('invalid credentials');
    }

    await query('update app_user set last_login_at = now(), updated_at = now() where id = $1', [user.id]);

    const secret = process.env.JWT_SECRET;
    if (!secret) {
      throw badRequest('server misconfiguration');
    }

    const payload = {
      sub: user.id,
      role: user.role_name,
    };

    const rawExpiresIn = process.env.JWT_TTL ?? '12h';
    const expiresIn = rawExpiresIn as unknown as SignOptions['expiresIn'];

    const token = jwt.sign(payload, secret, {
      expiresIn,
    });

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.full_name,
        role: user.role_name,
        permissions: Array.isArray(user.permissions) ? (user.permissions as unknown as string[]) : [],
        discountLimit: user.discount_limit ? Number(user.discount_limit) : 0,
      },
    });
  })
);

router.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    if (!req.user) {
      throw unauthorized();
    }

    res.json({ user: req.user });
  })
);
