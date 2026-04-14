// Refactor Summary:
// - Consolidated login and registration flows into shared handlers
// - Replaced direct fetch usage with the shared API wrapper for consistent headers and errors

// Authentication Handler
// Requires: config.js (API_BASE, showToast) and api.js (apiRequest/authRequest)

async function submitAuthPayload(url, payload) {
  return apiRequest(url, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

function getAuthErrorMessage(err) {
  if (typeof err === 'string') return err;
  const detail = err?.response?.data?.detail ?? err?.detail;
  if (Array.isArray(detail)) {
    return detail
      .map((item) => {
        if (typeof item === 'string') return item;
        if (item?.msg) return item.msg;
        if (item?.detail) return item.detail;
        return JSON.stringify(item);
      })
      .filter(Boolean)
      .join(' ');
  }
  if (detail) {
    if (typeof detail === 'string') return detail;
    if (detail?.msg) return detail.msg;
    if (detail?.detail) return detail.detail;
    return JSON.stringify(detail);
  }
  if (err?.message) return err.message;
  return 'Something went wrong. Please try again.';
}

document.addEventListener('DOMContentLoaded', () => {
  const userLoginForm = document.getElementById('userLoginForm');
  const clientLoginForm = document.getElementById('clientLoginForm');
  const userRegisterForm = document.getElementById('registerForm');
  const clientRegisterForm = document.getElementById('clientRegisterForm');

  if (userLoginForm) {
    userLoginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('email').value.trim();
      const password = document.getElementById('password').value;

      try {
        const data = await submitAuthPayload(`${API_BASE}/login/user`, { email, password });
        if (!data?.success) {
          showToast('Login failed. Please check your credentials.', 'error');
          return;
        }

        _storeSession(data, 'user');
        window.location.href = './user-dashboard.html';
      } catch (err) {
        console.error(err);
        showToast(getAuthErrorMessage(err), 'error');
      }
    });
  }

  if (clientLoginForm) {
    clientLoginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('email').value.trim();
      const password = document.getElementById('password').value;

      try {
        const data = await submitAuthPayload(`${API_BASE}/login/client`, { email, password });
        if (!data?.success) {
          showToast('Login failed. Please check your credentials.', 'error');
          return;
        }

        _storeSession(data, 'client');
        window.location.href = './client-dashboard.html';
      } catch (err) {
        console.error(err);
        showToast(getAuthErrorMessage(err), 'error');
      }
    });
  }

  if (userRegisterForm) {
    userRegisterForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const name = document.getElementById('fullName').value.trim();
      const email = document.getElementById('email').value.trim();
      const password = document.getElementById('password').value;
      const confirmPassword = document.getElementById('confirmPassword').value;

      if (password !== confirmPassword) {
        showToast('Passwords do not match. Please try again.', 'error');
        return;
      }

      try {
        const data = await submitAuthPayload(`${API_BASE}/register/user`, { name, email, password });
        if (!data?.success || !data.user_id || !data.email || !data.name) {
          showToast('Incomplete server response', 'error');
          return;
        }
        _storeSession(data, 'user');
        showToast('Account created! Welcome to ContractEase.', 'success');
        setTimeout(() => { window.location.href = 'user-dashboard.html'; }, 800);
      } catch (err) {
        console.error(err);
        showToast(getAuthErrorMessage(err), 'error');
      }
    });
  }

  if (clientRegisterForm) {
    clientRegisterForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const name = document.getElementById('companyName').value.trim();
      const email = document.getElementById('email').value.trim();
      const password = document.getElementById('password').value;
      const confirmPassword = document.getElementById('confirmPassword').value;

      if (password !== confirmPassword) {
        showToast('Passwords do not match. Please try again.', 'error');
        return;
      }

      try {
        const data = await submitAuthPayload(`${API_BASE}/register/client`, { name, email, password });
        if (!data?.success) {
          showToast('Registration failed.', 'error');
          return;
        }

        _storeSession(data, 'client');
        showToast('Account created! Welcome to ContractEase.', 'success');
        setTimeout(() => { window.location.href = 'client-dashboard.html'; }, 800);
      } catch (err) {
        console.error(err);
        showToast(getAuthErrorMessage(err), 'error');
      }
    });
  }

  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      const userRole = localStorage.getItem('user_role') || 'user';
      localStorage.clear();
      sessionStorage.clear();
      const loginPage = userRole === 'client' ? './client-login.html' : './user-login.html';
      window.location.href = loginPage;
    });
  }

  _setUserInitials();
});

// ── Session helpers (also used by registration pages) ────────

/**
 * Store session data in localStorage.
 * @param {Object} data - Response data containing user_id, name, email
 * @param {'user'|'client'} role
 */
function _storeSession(data, role) {
  localStorage.setItem('user_id', data.user_id);
  localStorage.setItem('user_email', data.email);
  localStorage.setItem('user_role', role);
  localStorage.setItem('user_name', data.name);
  if (data.access_token) {
    localStorage.setItem('access_token', data.access_token);
  }
}

/**
 * Derive initials from stored user_name and update avatar element.
 * Looks for id="userInitials" on the page.
 */
function _setUserInitials() {
  const userInitialsEl = document.getElementById('userInitials');
  if (!userInitialsEl) return;
  const userName = localStorage.getItem('user_name') || '?';
  const initials = userName
    .split(' ')
    .filter(Boolean)
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
  userInitialsEl.textContent = initials;
}
