// Authentication Handler

const AUTH_API = 'http://localhost:8000';

document.addEventListener('DOMContentLoaded', () => {
  const userLoginForm = document.getElementById('userLoginForm');
  const clientLoginForm = document.getElementById('clientLoginForm');

  // User Login
  if (userLoginForm) {
    userLoginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('email').value.trim();
      const password = document.getElementById('password').value;

      try {
        const res = await fetch(`${AUTH_API}/login/user`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password }),
        });
        const data = await res.json();

        if (!res.ok) {
          alert(data.detail || 'Login failed');
          return;
        }

        // Store session
        localStorage.setItem('user_id', data.user_id);
        localStorage.setItem('user_email', data.email);
        localStorage.setItem('user_role', 'user');
        localStorage.setItem('user_name', data.name);

        window.location.href = './user-dashboard.html';
      } catch (err) {
        console.error(err);
        alert('Could not reach the server. Is the backend running?');
      }
    });
  }

  // Client Login
  if (clientLoginForm) {
    clientLoginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('email').value.trim();
      const password = document.getElementById('password').value;

      try {
        const res = await fetch(`${AUTH_API}/login/client`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password }),
        });
        const data = await res.json();

        if (!res.ok) {
          alert(data.detail || 'Login failed');
          return;
        }

        // Store session
        localStorage.setItem('user_id', data.user_id);
        localStorage.setItem('user_email', data.email);
        localStorage.setItem('user_role', 'client');
        localStorage.setItem('user_name', data.name);

        window.location.href = './client-dashboard.html';
      } catch (err) {
        console.error(err);
        alert('Could not reach the server. Is the backend running?');
      }
    });
  }

  // Logout functionality
  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      const userRole = localStorage.getItem('user_role') || 'user';
      localStorage.clear();
      const loginPage = userRole === 'client' ? './client-login.html' : './user-login.html';
      window.location.href = loginPage;
    });
  }

  // Set user initials in avatar
  const userInitials = document.getElementById('userInitials');
  if (userInitials) {
    const userName = localStorage.getItem('user_name') || 'JD';
    const initials = userName
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
    userInitials.textContent = initials;
  }
});
