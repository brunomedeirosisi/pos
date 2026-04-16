import { describe, expect, it } from 'vitest';
import { parseApiErrorMessage } from '../../src/api/openapi-client';

describe('parseApiErrorMessage', () => {
  it('prefers message from API payload when available', () => {
    const message = parseApiErrorMessage('Bad Request', { message: 'validation_failed' });
    expect(message).toBe('validation_failed');
  });

  it('falls back to status text when payload has no message', () => {
    const message = parseApiErrorMessage('Unauthorized', { error: 'missing token' });
    expect(message).toBe('Unauthorized');
  });
});

