/**
 * ContractEase — Global Configuration & Shared Utilities
 *
 * This file must be loaded BEFORE all other JS scripts on every page.
 * It provides:
 *   - API_BASE: the single source of truth for the backend URL
 *   - showToast(): a reusable notification utility replacing alert()
 */

// ── API base URL ─────────────────────────────────────────────
// Environment-aware configuration: use localhost for dev, production URL for deployed environment
const API_BASE =
  window.location.hostname === "localhost"
    ? "http://localhost:8000"
    : "https://contractease-2-0.onrender.com";
    
console.log('API_BASE:', API_BASE);

function getAccessToken() {
  return localStorage.getItem('access_token') || '';
}

function getAuthHeaders(baseHeaders = {}) {
  const token = getAccessToken();
  const headers = { ...baseHeaders };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

// ── Toast notification system ────────────────────────────────
// Usage: showToast('Something went wrong', 'error')
//        showToast('Contract sent!', 'success')
//        showToast('Please fill all fields', 'warning')

let toastTimer = null;
let toastRemovalFallbackTimer = null;

function dismissToastElement(toast) {
  if (!toast || !toast.isConnected) return;

  toast.classList.remove('ce-toast--visible');

  let cleanedUp = false;
  const handleTransitionEnd = (event) => {
    if (event.target === toast) {
      cleanup();
    }
  };

  const cleanup = () => {
    if (cleanedUp) return;
    cleanedUp = true;
    toast.removeEventListener('transitionend', handleTransitionEnd);
    if (toastRemovalFallbackTimer) {
      clearTimeout(toastRemovalFallbackTimer);
      toastRemovalFallbackTimer = null;
    }
    if (toast.isConnected) {
      toast.remove();
    }
  };

  toast.addEventListener('transitionend', handleTransitionEnd);
  toastRemovalFallbackTimer = setTimeout(cleanup, 400);
}

function showToast(message, type = 'error') {
  // Remove any existing toast so messages don't stack
  const existing = document.getElementById('ce-toast');
  if (toastTimer) {
    clearTimeout(toastTimer);
    toastTimer = null;
  }
  if (toastRemovalFallbackTimer) {
    clearTimeout(toastRemovalFallbackTimer);
    toastRemovalFallbackTimer = null;
  }
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.id = 'ce-toast';
  toast.className = `ce-toast ce-toast--${type}`;
  toast.textContent = message;
  toast.tabIndex = 0;
  toast.setAttribute('role', type === 'error' ? 'alert' : 'status');
  toast.setAttribute('aria-live', type === 'error' ? 'assertive' : 'polite');

  document.body.appendChild(toast);

  const dismissCurrentToast = () => {
    if (toastTimer) {
      clearTimeout(toastTimer);
      toastTimer = null;
    }
    dismissToastElement(toast);
  };

  // Trigger entrance animation on next frame
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      toast.classList.add('ce-toast--visible');
    });
  });

  // Auto-dismiss after 4 seconds
  toastTimer = setTimeout(() => {
    toastTimer = null;
    dismissToastElement(toast);
  }, 4000);

  // Allow manual dismiss on click
  toast.addEventListener('click', dismissCurrentToast);
  toast.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ' || event.key === 'Escape') {
      event.preventDefault();
      dismissCurrentToast();
    }
  });
}
