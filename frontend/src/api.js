export const API_BASE = import.meta.env.VITE_API_BASE || '/api/v1';
let authToken = null;
const unauthorizedListeners = new Set();
export class ApiError extends Error {
    status;
    body;
    constructor(status, message, body) {
        super(message);
        this.status = status;
        this.body = body;
    }
}
function buildUrl(path, query) {
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
export async function api(path, options = {}) {
    const { query, json, formData, headers, responseType = 'json', ...rest } = options;
    const url = buildUrl(path, query);
    const init = {
        credentials: 'include',
        ...rest,
    };
    const mergedHeaders = {
        ...headers,
    };
    if (authToken) {
        mergedHeaders.Authorization = `Bearer ${authToken}`;
    }
    if (formData) {
        init.body = formData;
    }
    else if (json !== undefined) {
        mergedHeaders['Content-Type'] = mergedHeaders['Content-Type'] ?? 'application/json';
        init.body = JSON.stringify(json);
    }
    if (Object.keys(mergedHeaders).length > 0) {
        init.headers = mergedHeaders;
    }
    const response = await fetch(url, init);
    if (!response.ok) {
        let errorBody = null;
        let message = response.statusText;
        const errorContentType = response.headers.get('content-type');
        if (errorContentType?.includes('application/json')) {
            try {
                errorBody = await response.json();
                message = errorBody?.message ?? message;
            }
            catch {
                // ignore parse errors
            }
        }
        else {
            try {
                errorBody = await response.text();
                if (typeof errorBody === 'string' && errorBody.length > 0) {
                    message = errorBody;
                }
            }
            catch {
                // ignore
            }
        }
        if (response.status === 401) {
            unauthorizedListeners.forEach((listener) => {
                try {
                    listener();
                }
                catch (err) {
                    // swallow listener errors
                }
            });
        }
        throw new ApiError(response.status, message, errorBody);
    }
    if (responseType === 'blob') {
        return (await response.blob());
    }
    if (responseType === 'text') {
        return (await response.text());
    }
    if (response.status === 204) {
        return undefined;
    }
    return (await response.json());
}
export const http = {
    get: (path, query) => api(path, { method: 'GET', query }),
    post: (path, json) => api(path, { method: 'POST', json }),
    patch: (path, json) => api(path, { method: 'PATCH', json }),
    delete: (path) => api(path, { method: 'DELETE' }),
    postForm: (path, formData) => api(path, { method: 'POST', formData }),
    getBlob: (path, query) => api(path, { method: 'GET', query, responseType: 'blob' }),
};
export function setAuthToken(token) {
    authToken = token;
}
export function getAuthToken() {
    return authToken;
}
export function onUnauthorized(listener) {
    unauthorizedListeners.add(listener);
    return () => unauthorizedListeners.delete(listener);
}
