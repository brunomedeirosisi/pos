import { describe, expect, it } from 'vitest';
import { parseApiErrorMessage } from './api';

describe('parseApiErrorMessage', () => {
  it('prefers message from API payload when available', () => {
    const message = parseApiErrorMessage('Bad Request', { message: 'validation_failed' });
    expect(message).toBe('validation_failed');
  });

  it('falls back to text payload when message field is absent', () => {
    const message = parseApiErrorMessage('Unauthorized', 'missing token');
    expect(message).toBe('missing token');
  });

  it('falls back to status text when payload is not parseable', () => {
    const message = parseApiErrorMessage('Unauthorized', { error: 'missing token' });
    expect(message).toBe('Unauthorized');
  });
});

