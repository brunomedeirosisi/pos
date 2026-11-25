import { describe, expect, it } from 'vitest';
import { canAdjustStock } from './auth';
import type { AuthUser } from '../types/auth';

describe('exclusive stock-adjustment access', () => {
  it.each([
    ['admin', ['*'], true],
    ['manager', ['catalog:read', 'stock:adjust'], true],
    ['manager', ['catalog:write'], false],
    ['seller', ['stock:adjust'], false],
    ['custom', ['*'], false],
    ['admin', [], false],
  ])('checks role %s and permissions %j', (role, permissions, expected) => {
    expect(canAdjustStock({ role, permissions } as AuthUser)).toBe(expected);
  });
  it('rejects an unauthenticated user', () => expect(canAdjustStock(null)).toBe(false));
});
