import { z } from 'zod';
import type { AuthenticatedUser } from '../domain/auth-types.js';

export const loginRequestSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export type LoginRequestDto = z.infer<typeof loginRequestSchema>;

export type LoginResponseDto = {
  token: string;
  user: AuthenticatedUser;
};