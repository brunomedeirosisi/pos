import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, onUnauthorized } from '../api';
import { advanceSessionGeneration, SessionChangedError } from './session-lifecycle';
afterEach(() => { vi.unstubAllGlobals(); advanceSessionGeneration(); });
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>((done) => { resolve = done; }); return { promise, resolve }; }
describe('responses crossing an operator change', () => {
  it('aborts outstanding transport and refuses even a transport that ignores cancellation', async () => {
    const response = deferred<Response>(); let signal: AbortSignal | undefined;
    vi.stubGlobal('fetch', vi.fn((_url, options) => { signal = options.signal; return response.promise; }));
    const request = api('/private'); const rejected = expect(request).rejects.toBeInstanceOf(SessionChangedError);
    advanceSessionGeneration(); expect(signal?.aborted).toBe(true);
    response.resolve(new Response(JSON.stringify({ private: true }), { headers: { 'content-type': 'application/json' } })); await rejected;
  });
  it('refuses a body that finishes decoding after an identity change', async () => {
    const body = deferred<unknown>(); const started = deferred<void>();
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: () => { started.resolve(); return body.promise; } })));
    const request = api('/private'); const rejected = expect(request).rejects.toBeInstanceOf(SessionChangedError);
    await started.promise; advanceSessionGeneration(); body.resolve({ private: true }); await rejected;
  });
  it('does not let an old 401 log out the next operator', async () => {
    const response = deferred<Response>(); const unauthorized = vi.fn(); const remove = onUnauthorized(unauthorized);
    vi.stubGlobal('fetch', vi.fn(() => response.promise));
    const request = api('/private'); const rejected = expect(request).rejects.toBeInstanceOf(SessionChangedError);
    advanceSessionGeneration(); response.resolve(new Response('{}', { status: 401, headers: { 'content-type': 'application/json' } }));
    await rejected; expect(unauthorized).not.toHaveBeenCalled(); remove();
  });
});
