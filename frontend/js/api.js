// API Helper Module
// This module provides centralized API communication

const API_BASE_URL = 'http://localhost:3000/api'; // Change to your backend URL

const api = {
  // ===== Authentication =====
  auth: {
    login: async (email, password, role) => {
      return apiCall('POST', '/auth/login', { email, password, role });
    },

    logout: async () => {
      return apiCall('POST', '/auth/logout');
    },

    register: async (userData) => {
      return apiCall('POST', '/auth/register', userData);
    },

    resetPassword: async (email) => {
      return apiCall('POST', '/auth/reset-password', { email });
    },
  },

  // ===== Contracts =====
  contracts: {
    create: async (contractData) => {
      return apiCall('POST', '/contracts', contractData);
    },

    getAll: async (filters = {}) => {
      const query = new URLSearchParams(filters).toString();
      return apiCall('GET', `/contracts${query ? '?' + query : ''}`);
    },

    getById: async (contractId) => {
      return apiCall('GET', `/contracts/${contractId}`);
    },

    update: async (contractId, data) => {
      return apiCall('PUT', `/contracts/${contractId}`, data);
    },

    delete: async (contractId) => {
      return apiCall('DELETE', `/contracts/${contractId}`);
    },

    send: async (contractId, clientEmail) => {
      return apiCall('POST', `/contracts/${contractId}/send`, { clientEmail });
    },

    sign: async (contractId, signatureData) => {
      return apiCall('POST', `/contracts/${contractId}/sign`, { signatureData });
    },

    download: async (contractId) => {
      return apiCall('GET', `/contracts/${contractId}/download`);
    },
  },

  // ===== Users =====
  users: {
    getProfile: async () => {
      return apiCall('GET', '/users/profile');
    },

    updateProfile: async (data) => {
      return apiCall('PUT', '/users/profile', data);
    },

    getClients: async () => {
      return apiCall('GET', '/users/clients');
    },
  },

  // ===== Invitations =====
  invitations: {
    send: async (email, contractId) => {
      return apiCall('POST', '/invitations/send', { email, contractId });
    },

    accept: async (invitationId) => {
      return apiCall('POST', `/invitations/${invitationId}/accept`);
    },

    decline: async (invitationId) => {
      return apiCall('POST', `/invitations/${invitationId}/decline`);
    },
  },

  // ===== Templates =====
  templates: {
    getAll: async () => {
      return apiCall('GET', '/templates');
    },

    getById: async (templateId) => {
      return apiCall('GET', `/templates/${templateId}`);
    },

    create: async (templateData) => {
      return apiCall('POST', '/templates', templateData);
    },
  },
};

// Core API Call Function
async function apiCall(method, endpoint, data = null) {
  try {
    const options = {
      method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${getAuthToken()}`,
      },
    };

    if (data && (method === 'POST' || method === 'PUT')) {
      options.body = JSON.stringify(data);
    }

    console.log(`[API] ${method} ${endpoint}`, data);

    const response = await fetch(`${API_BASE_URL}${endpoint}`, options);
    const responseData = await response.json();

    if (!response.ok) {
      throw new Error(responseData.message || `API Error: ${response.status}`);
    }

    console.log(`[API] Response:`, responseData);
    return responseData;
  } catch (error) {
    console.error(`[API Error] ${method} ${endpoint}:`, error.message);
    handleApiError(error);
    throw error;
  }
}

// Get Auth Token from Storage
function getAuthToken() {
  return localStorage.getItem('auth_token') || '';
}

// Set Auth Token
function setAuthToken(token) {
  localStorage.setItem('auth_token', token);
}

// Clear Auth Token
function clearAuthToken() {
  localStorage.removeItem('auth_token');
}

// Handle API Errors
function handleApiError(error) {
  if (error.message.includes('401') || error.message.includes('Unauthorized')) {
    // Clear session and redirect to login
    clearAuthToken();
    localStorage.clear();
    window.location.href = './user-login.html';
  } else if (error.message.includes('403') || error.message.includes('Forbidden')) {
    alert('You do not have permission to access this resource');
  } else if (error.message.includes('404') || error.message.includes('Not Found')) {
    alert('The requested resource was not found');
  } else if (error.message.includes('500')) {
    alert('Server error. Please try again later');
  } else {
    console.error('API Error:', error.message);
  }
}

// Check API Health
async function checkApiHealth() {
  try {
    const response = await fetch(`${API_BASE_URL}/health`);
    return response.ok;
  } catch (error) {
    console.warn('API health check failed:', error.message);
    return false;
  }
}

// Utility: Retry API Call
async function apiCallWithRetry(method, endpoint, data = null, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await apiCall(method, endpoint, data);
    } catch (error) {
      if (i < maxRetries - 1) {
        console.log(`[API] Retrying ${method} ${endpoint} (attempt ${i + 1}/${maxRetries})`);
        await new Promise((resolve) => setTimeout(resolve, 1000 * (i + 1))); // Exponential backoff
      } else {
        throw error;
      }
    }
  }
}

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { api, getAuthToken, setAuthToken, clearAuthToken, checkApiHealth, apiCallWithRetry };
}
