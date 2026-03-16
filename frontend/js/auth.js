// Authentication Handler
// Requires: config.js (API_BASE, showToast)

document.addEventListener('DOMContentLoaded', () => {
  const userLoginForm = document.getElementById('userLoginForm');
  const clientLoginForm = document.getElementById('clientLoginForm');

  // ── User Login ───────────────────────────────────────────────
  if (userLoginForm) {
    userLoginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('email').value.trim();
      const password = document.getElementById('password').value;

      try {
        const res = await fetch(`${API_BASE}/login/user`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password }),
        });
        const data = await res.json();

        if (!res.ok) {
          showToast(data.detail || 'Login failed. Please check your credentials.', 'error');
          return;
        }

        _storeSession(data, 'user');
        window.location.href = './user-dashboard.html';
      } catch (err) {
        console.error(err);
        showToast('Could not reach the server. Is the backend running?', 'error');
      }
    });
  }

  // ── Client Login ─────────────────────────────────────────────
  if (clientLoginForm) {
    clientLoginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('email').value.trim();
      const password = document.getElementById('password').value;

      try {
        const res = await fetch(`${API_BASE}/login/client`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password }),
        });
        const data = await res.json();

        if (!res.ok) {
          showToast(data.detail || 'Login failed. Please check your credentials.', 'error');
          return;
        }

        _storeSession(data, 'client');
        window.location.href = './client-dashboard.html';
      } catch (err) {
        console.error(err);
        showToast('Could not reach the server. Is the backend running?', 'error');
      }
    });
  }

  // ── Logout ───────────────────────────────────────────────────
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

  // ── Dynamic avatar initials ──────────────────────────────────
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
