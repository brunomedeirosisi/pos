import type { AppEnv } from '../../../config/env.js';
import { durationSeconds } from '../../../utils/duration.js';

export function parseCookies(headerValue: string | undefined): Record<string, string> {
  if (!headerValue) {
    return {};
  }

  return headerValue
    .split(';')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
    .reduce<Record<string, string>>((cookies, entry) => {
      const separatorIndex = entry.indexOf('=');
      if (separatorIndex <= 0) {
        return cookies;
      }

      const key = entry.slice(0, separatorIndex).trim();
      const value = entry.slice(separatorIndex + 1).trim();
      try {
        cookies[key] = decodeURIComponent(value);
      } catch {
        cookies[key] = value;
      }
      return cookies;
    }, {});
}

export function extractAuthCookie(headerValue: string | undefined, cookieName: string): string | null {
  const cookies = parseCookies(headerValue);
  const value = cookies[cookieName];
  return value && value.length > 0 ? value : null;
}

export function buildAuthCookie(token: string, env: AppEnv): string {
  const segments = [
    `${env.AUTH_COOKIE_NAME}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${Math.min(env.AUTH_COOKIE_MAX_AGE_SECONDS, durationSeconds(env.JWT_TTL) ?? 0)}`,
  ];

  if (env.NODE_ENV === 'production') {
    segments.push('Secure');
  }

  return segments.join('; ');
}

export function buildClearedAuthCookie(env: AppEnv): string {
  const segments = [
    `${env.AUTH_COOKIE_NAME}=`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    'Max-Age=0',
    'Expires=Thu, 01 Jan 1970 00:00:00 GMT',
  ];

  if (env.NODE_ENV === 'production') {
    segments.push('Secure');
  }

  return segments.join('; ');
}
