// Authentication Handler

document.addEventListener('DOMContentLoaded', () => {
  const userLoginForm = document.getElementById('userLoginForm');
  const clientLoginForm = document.getElementById('clientLoginForm');

  // User Login
  if (userLoginForm) {
    userLoginForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const email = document.getElementById('email').value;
      const password = document.getElementById('password').value;
      const rememberMe = document.getElementById('rememberMe').checked;

      // Simulate authentication
      console.log('User Login:', { email, rememberMe });

      // Store user session
      localStorage.setItem('user_email', email);
      localStorage.setItem('user_role', 'user');
      localStorage.setItem('user_name', email.split('@')[0]);

      // Redirect to dashboard
      window.location.href = './user-dashboard.html';
    });
  }

  // Client Login
  if (clientLoginForm) {
    clientLoginForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const email = document.getElementById('email').value;
      const password = document.getElementById('password').value;
      const contractCode = document.getElementById('contractCode').value;

      // Simulate authentication
      console.log('Client Login:', { email, contractCode });

      // Store client session
      localStorage.setItem('user_email', email);
      localStorage.setItem('user_role', 'client');
      localStorage.setItem('user_name', email.split('@')[0]);

      // Redirect to dashboard
      window.location.href = './client-dashboard.html';
    });
  }

  // Logout functionality
  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      // Clear session
      localStorage.removeItem('user_email');
      localStorage.removeItem('user_role');
      localStorage.removeItem('user_name');

      // Redirect to login
      const userRole = localStorage.getItem('user_role');
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

// API Helper
const api = {
  login: async (email, password, role) => {
    try {
      // Simulate API call
      console.log(`[API] ${role} login:`, { email });
      return { success: true, message: 'Login successful' };
    } catch (error) {
      console.error('Login error:', error);
      return { success: false, message: 'Login failed' };
    }
  },

  logout: async () => {
    try {
      // Simulate API call
      console.log('[API] User logout');
      localStorage.clear();
      return { success: true };
    } catch (error) {
      console.error('Logout error:', error);
      return { success: false };
    }
  },
};

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { api };
}
