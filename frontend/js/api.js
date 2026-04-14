// Refactor Summary:
// - Centralized API request handling, token injection, and response parsing
// - Replaced ad-hoc fetch calls with a single shared wrapper to reduce duplication

function isPlainObject(value) {
  if (!value || typeof value !== 'object') return false;
  return value.constructor === Object;
}

function shouldAttachJsonContentType(body) {
  if (body == null) return false;
  if (typeof FormData !== 'undefined' && body instanceof FormData) return false;
  if (typeof Blob !== 'undefined' && body instanceof Blob) return false;
  if (typeof URLSearchParams !== 'undefined' && body instanceof URLSearchParams) return false;
  return typeof body === 'string' || isPlainObject(body);
}

function buildApiHeaders(baseHeaders = {}, body = undefined) {
  const headers = { ...baseHeaders };
  if (!headers['Content-Type'] && shouldAttachJsonContentType(body)) {
    headers['Content-Type'] = 'application/json';
  }
  return headers;
}

async function apiRequest(url, options = {}) {
  const nextOptions = { ...options };
  nextOptions.headers = buildApiHeaders(options.headers || {}, options.body);

  const response = await fetch(url, nextOptions);
  const contentType = response.headers.get('content-type') || '';
  const isJson = contentType.includes('application/json');
  const payload = isJson ? await response.json().catch(() => null) : await response.text().catch(() => '');

  if (!response.ok) {
    const message = payload?.detail || payload?.message || (typeof payload === 'string' && payload.trim()) || 'Request failed.';
    const error = new Error(message);
    error.response = { status: response.status, data: payload };
    throw error;
  }

  return payload;
}

async function authRequest(url, options = {}) {
  const token = typeof getAccessToken === 'function' ? getAccessToken() : '';
  let headers;
  if (typeof getAuthHeaders === 'function') {
    headers = getAuthHeaders(options.headers || {}, token);
  } else {
    headers = { ...(options.headers || {}) };
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
  }

  return apiRequest(url, {
    ...options,
    headers,
    body: options.body,
  });
}

function authFetch(url, options = {}) {
  const token = typeof getAccessToken === 'function' ? getAccessToken() : '';
  let headers;
  if (typeof getAuthHeaders === 'function') {
    headers = getAuthHeaders(options.headers || {}, token);
  } else {
    headers = { ...(options.headers || {}) };
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
  }

  const requestOptions = {
    ...options,
    headers: buildApiHeaders(headers, options.body),
  };

  return fetch(url, requestOptions);
}
