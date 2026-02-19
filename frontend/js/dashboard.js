// Dashboard Handler — data-driven via backend API

const API = 'http://localhost:8000';

// ── Helpers ──────────────────────────────────────────────────

function capitalizeFirstLetter(string) {
  return string.charAt(0).toUpperCase() + string.slice(1);
}

function formatDate(isoString) {
  if (!isoString) return '—';
  const d = new Date(isoString);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatAmount(amount) {
  if (amount == null) return '—';
  return '$' + Number(amount).toLocaleString('en-US', { minimumFractionDigits: 0 });
}

function daysUntil(isoString) {
  if (!isoString) return null;
  const diff = Math.ceil((new Date(isoString) - new Date()) / 86400000);
  return diff;
}

// ── Card renderers (match original HTML structure exactly) ────

function renderUserDraftCard(c) {
  return `
    <div class="contract-card" data-id="${c._id}">
      <div class="contract-header">
        <div>
          <div class="contract-title">${c.title}</div>
          <div class="contract-date">Created: ${formatDate(c.createdAt)}</div>
        </div>
        <div class="badge badge-primary">Draft</div>
      </div>
      <div class="contract-details">
        <div class="contract-detail-row">
          <span class="contract-detail-label">Client:</span>
          <span class="contract-detail-value">${c.clientName || '—'}</span>
        </div>
        <div class="contract-detail-row">
          <span class="contract-detail-label">Amount:</span>
          <span class="contract-detail-value">${formatAmount(c.amount)}</span>
        </div>
        <div class="contract-detail-row">
          <span class="contract-detail-label">Due:</span>
          <span class="contract-detail-value">${formatDate(c.dueDate)}</span>
        </div>
      </div>
      <div class="contract-actions">
        <button class="btn btn-primary btn-sm edit-contract-btn">Edit</button>
        <button class="btn btn-outline btn-sm view-contract-btn">View</button>
      </div>
    </div>`;
}

function renderUserPendingCard(c) {
  return `
    <div class="contract-card" data-id="${c._id}">
      <div class="contract-header">
        <div>
          <div class="contract-title">${c.title}</div>
          <div class="contract-date">Sent: ${formatDate(c.createdAt)}</div>
        </div>
        <div class="badge badge-warning">Pending</div>
      </div>
      <div class="contract-details">
        <div class="contract-detail-row">
          <span class="contract-detail-label">Client:</span>
          <span class="contract-detail-value">${c.clientName || '—'}</span>
        </div>
        <div class="contract-detail-row">
          <span class="contract-detail-label">Amount:</span>
          <span class="contract-detail-value">${formatAmount(c.amount)}</span>
        </div>
        <div class="contract-detail-row">
          <span class="contract-detail-label">Due:</span>
          <span class="contract-detail-value">${formatDate(c.dueDate)}</span>
        </div>
      </div>
      <div class="contract-actions">
        <button class="btn btn-secondary btn-sm send-reminder-btn">Send Reminder</button>
        <button class="btn btn-outline btn-sm view-contract-btn">View</button>
      </div>
    </div>`;
}

function renderUserSignedCard(c) {
  return `
    <div class="contract-card" data-id="${c._id}">
      <div class="contract-header">
        <div>
          <div class="contract-title">${c.title}</div>
          <div class="contract-date">Signed: ${formatDate(c.signedAt || c.createdAt)}</div>
        </div>
        <div class="badge badge-secondary">Signed</div>
      </div>
      <div class="contract-details">
        <div class="contract-detail-row">
          <span class="contract-detail-label">Client:</span>
          <span class="contract-detail-value">${c.clientName || '—'}</span>
        </div>
        <div class="contract-detail-row">
          <span class="contract-detail-label">Amount:</span>
          <span class="contract-detail-value">${formatAmount(c.amount)}</span>
        </div>
        <div class="contract-detail-row">
          <span class="contract-detail-label">Signed:</span>
          <span class="contract-detail-value">${formatDate(c.signedAt || c.createdAt)}</span>
        </div>
      </div>
      <div class="contract-actions">
        <button class="btn btn-outline btn-sm view-contract-btn">View</button>
      </div>
    </div>`;
}

function renderClientPendingCard(c) {
  const days = daysUntil(c.dueDate);
  const overdue = days !== null && days < 0;
  const badgeClass = overdue ? 'badge-error' : 'badge-warning';
  const badgeText = overdue ? 'Overdue' : 'Action Required';
  const daysText = overdue ? `Overdue by ${Math.abs(days)} day(s)` : days !== null ? `${days} day(s) left` : '—';

  return `
    <div class="contract-card" data-id="${c._id}">
      <div class="contract-header">
        <div>
          <div class="contract-title">${c.title}</div>
          <div class="contract-date">Received: ${formatDate(c.createdAt)}</div>
        </div>
        <div class="badge ${badgeClass}">${badgeText}</div>
      </div>
      <div class="contract-details">
        <div class="contract-detail-row">
          <span class="contract-detail-label">Amount:</span>
          <span class="contract-detail-value">${formatAmount(c.amount)}</span>
        </div>
        <div class="contract-detail-row">
          <span class="contract-detail-label">${overdue ? 'Overdue By:' : 'Days Left:'}</span>
          <span class="contract-detail-value">${daysText}</span>
        </div>
      </div>
      <div class="contract-actions">
        <button class="btn btn-secondary btn-sm review-sign-btn">${overdue ? 'Sign Now' : 'Review & Sign'}</button>
        <button class="btn btn-outline btn-sm view-contract-btn">View</button>
      </div>
    </div>`;
}

function renderClientSignedCard(c) {
  return `
    <div class="contract-card" data-id="${c._id}">
      <div class="contract-header">
        <div>
          <div class="contract-title">${c.title}</div>
          <div class="contract-date">Signed: ${formatDate(c.signedAt || c.createdAt)}</div>
        </div>
        <div class="badge badge-secondary">Completed</div>
      </div>
      <div class="contract-details">
        <div class="contract-detail-row">
          <span class="contract-detail-label">Amount:</span>
          <span class="contract-detail-value">${formatAmount(c.amount)}</span>
        </div>
        <div class="contract-detail-row">
          <span class="contract-detail-label">Signed:</span>
          <span class="contract-detail-value">${formatDate(c.signedAt || c.createdAt)}</span>
        </div>
      </div>
      <div class="contract-actions">
        <button class="btn btn-outline btn-sm view-contract-btn">View</button>
      </div>
    </div>`;
}

function renderEmpty(text) {
  return `<p style="color:var(--text-secondary);padding:var(--space-6);">${text}</p>`;
}

// ── Populate grids ───────────────────────────────────────────

function fillGrid(gridId, cards, emptyMsg) {
  const grid = document.getElementById(gridId);
  if (!grid) return;
  if (cards.length === 0) {
    grid.innerHTML = renderEmpty(emptyMsg);
  } else {
    grid.innerHTML = cards.join('');
  }
}

// ── Bind card buttons (delegated) ────────────────────────────

function bindCardButtons() {
  document.querySelectorAll('.edit-contract-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const id = e.target.closest('.contract-card').dataset.id;
      localStorage.setItem('selected_contract_id', id);
      window.location.href = './create-contract.html';
    });
  });

  document.querySelectorAll('.view-contract-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const card = e.target.closest('.contract-card');
      const id = card.dataset.id;
      localStorage.setItem('selected_contract_id', id);
      // For clients, open the sign page; for users, open create-contract in view mode
      const role = localStorage.getItem('user_role');
      if (role === 'client') {
        window.location.href = './sign-contract.html';
      } else {
        window.location.href = './create-contract.html';
      }
    });
  });

  document.querySelectorAll('.review-sign-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const id = e.target.closest('.contract-card').dataset.id;
      localStorage.setItem('selected_contract_id', id);
      window.location.href = './sign-contract.html';
    });
  });

  document.querySelectorAll('.send-reminder-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const title = e.target.closest('.contract-card').querySelector('.contract-title').textContent;
      alert('Reminder sent for: ' + title);
    });
  });
}

// ── Data fetching ────────────────────────────────────────────

async function loadUserDashboard(userId) {
  try {
    const res = await fetch(`${API}/contracts/user/${userId}`);
    if (!res.ok) throw new Error('Failed to load contracts');
    const contracts = await res.json();

    const drafts = contracts.filter((c) => c.status === 'draft');
    const pending = contracts.filter((c) => c.status === 'sent' || c.status === 'pending');
    const signed = contracts.filter((c) => c.status === 'signed');

    fillGrid('draftContractsGrid', drafts.map(renderUserDraftCard), 'No draft contracts yet. Click "Create New Contract" to get started.');
    fillGrid('pendingContractsGrid', pending.map(renderUserPendingCard), 'No contracts pending signature.');
    fillGrid('signedContractsGrid', signed.map(renderUserSignedCard), 'No signed contracts yet.');

    bindCardButtons();
  } catch (err) {
    console.error('Dashboard load error:', err);
  }
}

async function loadClientDashboard(clientId) {
  try {
    const res = await fetch(`${API}/contracts/client/${clientId}`);
    if (!res.ok) throw new Error('Failed to load contracts');
    const contracts = await res.json();

    const pending = contracts.filter((c) => c.status === 'sent' || c.status === 'pending');
    const signed = contracts.filter((c) => c.status === 'signed');

    fillGrid('pendingSignatureGrid', pending.map(renderClientPendingCard), 'No contracts awaiting your signature.');
    fillGrid('signedContractsGrid', signed.map(renderClientSignedCard), 'No signed contracts yet.');

    bindCardButtons();
  } catch (err) {
    console.error('Dashboard load error:', err);
  }
}

// ── Main ─────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  // Mobile menu toggle
  const mobileMenuToggle = document.getElementById('mobileMenuToggle');
  const navbarMenu = document.getElementById('navbarMenu');

  if (mobileMenuToggle && navbarMenu) {
    mobileMenuToggle.addEventListener('click', () => {
      navbarMenu.classList.toggle('active');
    });
    document.querySelectorAll('.navbar-menu .navbar-link').forEach((link) => {
      link.addEventListener('click', () => {
        navbarMenu.classList.remove('active');
      });
    });
  }

  // Logout — read role BEFORE clearing
  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      if (confirm('Are you sure you want to sign out?')) {
        const userRole = localStorage.getItem('user_role') || 'user';
        localStorage.clear();
        const loginPage = userRole === 'client' ? './client-login.html' : './user-login.html';
        window.location.href = loginPage;
      }
    });
  }

  // Auth guard
  const userId = localStorage.getItem('user_id');
  const userRole = localStorage.getItem('user_role') || 'user';

  if (!userId) {
    const loginPage = userRole === 'client' ? './client-login.html' : './user-login.html';
    window.location.href = loginPage;
    return;
  }

  // Welcome message
  const userName = localStorage.getItem('user_name') || 'User';
  const welcomeMessage = document.querySelector('.welcome-message');
  if (welcomeMessage) {
    welcomeMessage.textContent = `Welcome back, ${capitalizeFirstLetter(userName)}!`;
  }

  // Load data from backend
  if (userRole === 'client') {
    loadClientDashboard(userId);
  } else {
    loadUserDashboard(userId);
  }
});
