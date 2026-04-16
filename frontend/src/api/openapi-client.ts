import createClient from 'openapi-fetch';
import type { paths } from '../generated/openapi';
import { API_BASE, ApiError, emitUnauthorized, getAuthToken } from '../api';

type OpenApiResponse<T> = {
  data?: T;
  error?: unknown;
  response: Response;
};

async function authenticatedFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const headers = new Headers(init?.headers ?? {});
  const token = getAuthToken();

  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const response = await fetch(input, {
    ...init,
    headers,
    credentials: 'include',
  });

  if (response.status === 401) {
    emitUnauthorized();
  }

  return response;
}

export function parseApiErrorMessage(statusText: string, payload: unknown): string {
  if (payload && typeof payload === 'object' && 'message' in payload) {
    const message = (payload as Record<string, unknown>).message;
    if (typeof message === 'string' && message.trim().length > 0) {
      return message;
    }
  }

  return statusText || 'Request failed';
}

export const typedClient = createClient<paths>({
  baseUrl: API_BASE,
  fetch: authenticatedFetch,
});

export async function unwrapOpenApiResponse<T>(promise: Promise<OpenApiResponse<T>>): Promise<T> {
  const { data, error, response } = await promise;

  if (response.status === 204) {
    return undefined as T;
  }

  if (error || !response.ok) {
    const body = error ?? null;
    const message = parseApiErrorMessage(response.statusText, body);
    throw new ApiError(response.status, message, body);
  }

  return data as T;
}

