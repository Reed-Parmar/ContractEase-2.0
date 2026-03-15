/**
 * ContractEase — API Helper Module
 * Requires: config.js (API_BASE, showToast)
 *
 * This module provides a structured, centralized wrapper around every
 * backend endpoint. It is not used directly by auth.js / dashboard.js /
 * contract.js today (they call fetch() directly) but is kept here for
 * future refactoring. All endpoint paths reflect the actual FastAPI routes.
 */

// ---- Core fetch wrapper -------------------------------------

async function apiCall(method, endpoint, data = null) {
  const options = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };

  if (data && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
    options.body = JSON.stringify(data);
  }

  const response = await fetch(`${API_BASE}${endpoint}`, options);
  const contentType = (response.headers.get('content-type') || '').toLowerCase();
  const contentLength = response.headers.get('content-length');
  const hasNoBody = response.status === 204 || contentLength === '0';
  const rawText = hasNoBody ? '' : await response.text();

  let responseData = null;
  if (rawText) {
    if (contentType.includes('application/json')) {
      try {
        responseData = JSON.parse(rawText);
      } catch (error) {
        throw new Error(`Invalid JSON response from ${endpoint}: ${rawText}`);
      }
    } else {
      responseData = rawText;
    }
  }

  if (!response.ok) {
    const message = typeof responseData === 'object' && responseData !== null
      ? responseData.detail || responseData.message || `Request failed with status ${response.status}`
      : responseData || `Request failed with status ${response.status}`;
    throw new Error(message);
  }

  return responseData;
}

// ---- Auth ---------------------------------------------------
const apiAuth = {
  loginUser: (email, password) =>
    apiCall('POST', '/login/user', { email, password }),

  loginClient: (email, password) =>
    apiCall('POST', '/login/client', { email, password }),

  registerUser: (name, email, password) =>
    apiCall('POST', '/register/user', { name, email, password }),

  registerClient: (name, email, password) =>
    apiCall('POST', '/register/client', { name, email, password }),
};

// ---- Contracts ----------------------------------------------
const apiContracts = {
  create: (payload) =>
    apiCall('POST', '/contracts/', payload),

  getByUser: (userId) =>
    apiCall('GET', `/contracts/user/${userId}`),

  getByClient: (clientId) =>
    apiCall('GET', `/contracts/client/${clientId}`),

  getById: (contractId) =>
    apiCall('GET', `/contracts/${contractId}`),

  send: (contractId) =>
    apiCall('PUT', `/contracts/${contractId}/send`),

  updateStatus: (contractId, status) =>
    apiCall('PATCH', `/contracts/${contractId}/status`, { status }),

  sign: (contractId, signerName, signerEmail, signatureImage) =>
    apiCall('POST', `/contracts/${contractId}/sign`, { signerName, signerEmail, signatureImage }),
};

// ---- Clients ------------------------------------------------
const apiClients = {
  getByEmail: (email) =>
    apiCall('GET', `/clients/by-email?email=${encodeURIComponent(email)}`),
};

// ---- Health -------------------------------------------------
async function apiHealthCheck() {
  try {
    const res = await fetch(`${API_BASE}/`);
    return res.ok;
  } catch {
    return false;
  }
}

// Export for use in other scripts (Node.js / bundler environments)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { apiAuth, apiContracts, apiClients, apiHealthCheck };
}
