export const API_BASE = import.meta.env.VITE_API_BASE || '/api/v1';

let authToken: string | null = null;
const unauthorizedListeners = new Set<() => void>();

export class ApiError extends Error {
  status: number;
  body?: unknown;

  constructor(status: number, message: string, body?: unknown) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

type ApiOptions = RequestInit & {
  query?: Record<string, string | number | boolean | undefined>;
  json?: unknown;
  formData?: FormData;
  responseType?: 'json' | 'blob' | 'text';
};

function buildUrl(path: string, query?: ApiOptions['query']) {
  const params = new URLSearchParams();
  if (query) {
    Object.entries(query).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        params.append(key, String(value));
      }
    });
  }
  const queryString = params.toString();
  return queryString ? `${API_BASE}${path}?${queryString}` : `${API_BASE}${path}`;
}

export async function api<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const { query, json, formData, headers, responseType = 'json', ...rest } = options;
  const url = buildUrl(path, query);
  const init: RequestInit = {
    credentials: 'include',
    ...rest,
  };

  const mergedHeaders: Record<string, string> = {
    ...(headers as Record<string, string> | undefined),
  };

  if (authToken) {
    mergedHeaders.Authorization = `Bearer ${authToken}`;
  }

  if (formData) {
    init.body = formData;
  } else if (json !== undefined) {
    mergedHeaders['Content-Type'] = mergedHeaders['Content-Type'] ?? 'application/json';
    init.body = JSON.stringify(json);
  }

  if (Object.keys(mergedHeaders).length > 0) {
    init.headers = mergedHeaders;
  }

  const response = await fetch(url, init);

  if (!response.ok) {
    let errorBody: unknown = null;
    let message = response.statusText;

    const errorContentType = response.headers.get('content-type');
    if (errorContentType?.includes('application/json')) {
      try {
        errorBody = await response.json();
        message = (errorBody as any)?.message ?? message;
      } catch {
        // ignore parse errors
      }
    } else {
      try {
        errorBody = await response.text();
        if (typeof errorBody === 'string' && errorBody.length > 0) {
          message = errorBody;
        }
      } catch {
        // ignore
      }
    }

    if (response.status === 401) {
      unauthorizedListeners.forEach((listener) => {
        try {
          listener();
        } catch (err) {
          // swallow listener errors
        }
      });
    }

    throw new ApiError(response.status, message, errorBody);
  }

  if (responseType === 'blob') {
    return (await response.blob()) as T;
  }

  if (responseType === 'text') {
    return (await response.text()) as T;
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

export const http = {
  get: <T>(path: string, query?: ApiOptions['query']) => api<T>(path, { method: 'GET', query }),
  post: <T>(path: string, json?: unknown) => api<T>(path, { method: 'POST', json }),
  patch: <T>(path: string, json?: unknown) => api<T>(path, { method: 'PATCH', json }),
  delete: <T>(path: string) => api<T>(path, { method: 'DELETE' }),
  postForm: <T>(path: string, formData: FormData) => api<T>(path, { method: 'POST', formData }),
  getBlob: (path: string, query?: ApiOptions['query']) =>
    api<Blob>(path, { method: 'GET', query, responseType: 'blob' }),
};

export function setAuthToken(token: string | null) {
  authToken = token;
}

export function getAuthToken(): string | null {
  return authToken;
}

export function onUnauthorized(listener: () => void): () => void {
  unauthorizedListeners.add(listener);
  return () => unauthorizedListeners.delete(listener);
}
