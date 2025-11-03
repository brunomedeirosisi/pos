import type { NextFunction, Request, RequestHandler, Response } from 'express';
import jwt from 'jsonwebtoken';
import { query } from '../db.js';
import { forbidden, unauthorized } from '../errors.js';

type JwtPayload = {
  sub: string;
  exp: number;
};

export type AuthenticatedUser = {
  id: string;
  email: string;
  fullName: string;
  role: string;
  permissions: string[];
  discountLimit: number;
};

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

async function getUserById(userId: string): Promise<AuthenticatedUser | null> {
  const { rows } = await query<{
    id: string;
    email: string;
    full_name: string;
    role_name: string;
    permissions: string[];
    discount_limit: string | null;
    status: string;
  }>(
    `select
       u.id,
       u.email,
       u.full_name,
       u.status,
       r.name as role_name,
       coalesce(r.permissions, '[]'::jsonb) as permissions,
       r.discount_limit
     from app_user u
     join app_role r on r.id = u.role_id
     where u.id = $1`,
    [userId]
  );

  const record = rows[0];
  if (!record || record.status !== 'active') {
    return null;
  }

  const permissionsArray = Array.isArray(record.permissions) ? (record.permissions as unknown as string[]) : [];

  return {
    id: record.id,
    email: record.email,
    fullName: record.full_name,
    role: record.role_name,
    permissions: permissionsArray,
    discountLimit: record.discount_limit ? Number(record.discount_limit) : 0,
  };
}

export const requireAuth: RequestHandler = async (req, _res, next) => {
  try {
    const authHeader = req.headers.authorization ?? '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!token) {
      throw unauthorized();
    }

    const secret = process.env.JWT_SECRET;
    if (!secret) {
      throw unauthorized('server misconfiguration');
    }

    let payload: JwtPayload;
    try {
      payload = jwt.verify(token, secret) as JwtPayload;
    } catch (error) {
      throw unauthorized('invalid token');
    }

    const user = await getUserById(payload.sub);
    if (!user) {
      throw unauthorized();
    }

    req.user = user;
    next();
  } catch (error) {
    next(error);
  }
};

export function requirePermission(...required: string[]): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(unauthorized());
    }

    const userPermissions = req.user.permissions ?? [];
    if (userPermissions.includes('*')) {
      return next();
    }

    const hasPermission = required.some((permission) => userPermissions.includes(permission));
    if (!hasPermission) {
      return next(forbidden());
    }

    return next();
  };
}
