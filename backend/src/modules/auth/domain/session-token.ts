import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { unauthorized } from '../../../errors.js';

export const sessionTokenOptions = { algorithms: ['HS256'] as jwt.Algorithm[], issuer: 'pos-api', audience: 'pos-web' };
const payloadSchema = z.object({ sub: z.string().uuid(), jti: z.string().uuid() });

export function verifySessionToken(token: string, secret: string): { sub: string; jti: string } {
  try {
    return payloadSchema.parse(jwt.verify(token, secret, sessionTokenOptions));
  } catch {
    throw unauthorized('invalid token');
  }
}
