import i18n from './lib/i18n';
import { assertSessionGeneration, currentSessionGeneration, trackSessionRequest } from './lib/session-lifecycle';

export const API_BASE = import.meta.env.VITE_API_BASE || '/api/v1';
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

type ApiValidationIssue = {
  code?: unknown;
  received?: unknown;
  minimum?: unknown;
  path?: unknown;
  type?: unknown;
};

const apiValidationFieldKeys: Record<string, string> = {
  amount_paid: 'sales.amountPaid',
  change_amount: 'sales.changeAmount',
  customer_id: 'sales.customer',
  discount: 'sales.discount',
  order_number: 'sales.orderNumber',
  payment_method: 'sales.paymentMethod',
  payment_term_id: 'sales.paymentTerm',
  seller_id: 'sales.seller',
  subtotal: 'sales.subtotal',
  total: 'sales.total',
};

const apiMessageTranslationKeys: Record<string, string> = {
  payment_report_limit_exceeded: 'apiErrors.paymentReportLimitExceeded',
  payment_report_inconsistent: 'apiErrors.paymentReportInconsistent',
  'sale cannot be cancelled because it would create a customer credit. Reverse customer payments or refund amounts first':
    'apiErrors.saleCancellationCreatesCustomerCredit',
};

function getValidationFieldLabel(issue: ApiValidationIssue): string | null {
  if (!Array.isArray(issue.path)) {
    return null;
  }

  for (let index = issue.path.length - 1; index >= 0; index -= 1) {
    const segment = issue.path[index];
    if (typeof segment !== 'string') {
      continue;
    }

    const translationKey = apiValidationFieldKeys[segment];
    if (translationKey) {
      return i18n.t(translationKey);
    }
  }

  return null;
}

function formatValidationIssueMessage(issue: ApiValidationIssue): string {
  const fieldLabel = getValidationFieldLabel(issue);
  if (!fieldLabel) {
    return i18n.t('apiErrors.validationFailed');
  }

  if (
    issue.code === 'invalid_type' &&
    issue.received === 'undefined'
  ) {
    return i18n.t('apiErrors.requiredField', { field: fieldLabel });
  }

  if (
    issue.code === 'too_small' &&
    issue.type === 'string' &&
    issue.minimum === 1
  ) {
    return i18n.t('apiErrors.requiredField', { field: fieldLabel });
  }

  return i18n.t('apiErrors.invalidFieldValue', { field: fieldLabel });
}

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

export function parseApiErrorMessage(statusText: string, body: unknown): string {
  if (body && typeof body === 'object') {
    const { message, issues } = body as { message?: unknown; issues?: unknown };
    if (message === 'validation_failed') {
      if (Array.isArray(issues) && issues.length > 0) {
        return formatValidationIssueMessage(issues[0] as ApiValidationIssue);
      }

      return i18n.t('apiErrors.validationFailed');
    }

    if (typeof message === 'string' && message.trim().length > 0) {
      const translatedKey = apiMessageTranslationKeys[message];
      if (translatedKey) {
        return i18n.t(translatedKey);
      }

      return message;
    }
  }

  if (typeof body === 'string' && body.trim().length > 0) {
    return body;
  }

  return statusText;
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

  if (formData) {
    init.body = formData;
  } else if (json !== undefined) {
    mergedHeaders['Content-Type'] = mergedHeaders['Content-Type'] ?? 'application/json';
    init.body = JSON.stringify(json);
  }

  if (Object.keys(mergedHeaders).length > 0) {
    init.headers = mergedHeaders;
  }

  const generation = currentSessionGeneration();
  const controller = new AbortController();
  const originalSignal = init.signal;
  const abort = () => controller.abort();
  if (originalSignal?.aborted) controller.abort();
  originalSignal?.addEventListener('abort', abort, { once: true });
  init.signal = controller.signal;
  const untrack = trackSessionRequest(controller);
  try {
    const response = await fetch(url, init);
    assertSessionGeneration(generation);

    if (!response.ok) {
      let errorBody: unknown = null;
      let message = response.statusText;

      const errorContentType = response.headers.get('content-type');
      if (errorContentType?.includes('application/json')) {
        try {
          errorBody = await response.json();
          message = parseApiErrorMessage(message, errorBody);
        } catch {
          // ignore parse errors
        }
      } else {
        try {
          errorBody = await response.text();
          message = parseApiErrorMessage(message, errorBody);
        } catch {
          // ignore
        }
      }

      assertSessionGeneration(generation);
      if (response.status === 401) {
        unauthorizedListeners.forEach((listener) => {
          try {
            listener();
          } catch {
            // swallow listener errors
          }
        });
      }

      throw new ApiError(response.status, message, errorBody);
    }

    if (responseType === 'blob') {
      const body = await response.blob();
      assertSessionGeneration(generation);
      return body as T;
    }

    if (responseType === 'text') {
      const body = await response.text();
      assertSessionGeneration(generation);
      return body as T;
    }

    if (response.status === 204) {
      return undefined as T;
    }

    const body = await response.json();
    assertSessionGeneration(generation);
    return body as T;
  } finally {
    untrack();
    originalSignal?.removeEventListener('abort', abort);
  }
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

export function onUnauthorized(listener: () => void): () => void {
  unauthorizedListeners.add(listener);
  return () => unauthorizedListeners.delete(listener);
}
