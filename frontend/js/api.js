// Refactor Summary:
// - Centralized API request handling, token injection, and response parsing
// - Replaced ad-hoc fetch calls with a single shared wrapper to reduce duplication

function buildApiHeaders(baseHeaders = {}, includeJson = false) {
  const headers = { ...baseHeaders };
  if (includeJson && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }
  return headers;
}

async function apiRequest(url, options = {}) {
  const nextOptions = { ...options };
  nextOptions.headers = buildApiHeaders(options.headers || {}, Boolean(options.body));

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
  const token = getAccessToken();
  const headers = getAuthHeaders(options.headers || {});
  return apiRequest(url, {
    ...options,
    headers,
    body: options.body,
  });
}

function authFetch(url, options = {}) {
  return authRequest(url, options);
}
