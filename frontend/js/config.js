/**
 * ContractEase — Global Configuration & Shared Utilities
 *
 * This file must be loaded BEFORE all other JS scripts on every page.
 * It provides:
 *   - API_BASE: the single source of truth for the backend URL
 *   - showToast(): a reusable notification utility replacing alert()
 */

// ── API base URL ─────────────────────────────────────────────
// Change this one constant when the backend URL changes.
const API_BASE = 'http://localhost:8000';

// ── Toast notification system ────────────────────────────────
// Usage: showToast('Something went wrong', 'error')
//        showToast('Contract sent!', 'success')
//        showToast('Please fill all fields', 'warning')

function showToast(message, type = 'error') {
  // Remove any existing toast so messages don't stack
  const existing = document.getElementById('ce-toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.id = 'ce-toast';
  toast.className = `ce-toast ce-toast--${type}`;
  toast.textContent = message;

  document.body.appendChild(toast);

  // Trigger entrance animation on next frame
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      toast.classList.add('ce-toast--visible');
    });
  });

  // Auto-dismiss after 4 seconds
  const timer = setTimeout(() => {
    toast.classList.remove('ce-toast--visible');
    toast.addEventListener('transitionend', () => toast.remove(), { once: true });
  }, 4000);

  // Allow manual dismiss on click
  toast.addEventListener('click', () => {
    clearTimeout(timer);
    toast.classList.remove('ce-toast--visible');
    toast.addEventListener('transitionend', () => toast.remove(), { once: true });
  });
}
