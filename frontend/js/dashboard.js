// Dashboard Handler — data-driven via backend API
// Requires: config.js (API_BASE, showToast)

// ── Helpers ──────────────────────────────────────────────────

function capitalizeFirstLetter(string) {
  if (!string) return '';
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

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// ── Card renderers (Modern SaaS Design) ────────────────────────

function renderUserDraftCard(c) {
  return `
    <div class="contract-card" data-id="${c._id}">
      <div class="contract-card-header">
        <div class="contract-card-top">
          <div>
            <div class="contract-title">${escapeHtml(c.title)}</div>
            <div class="contract-client">${escapeHtml(c.clientName) || 'No Client Assigned'}</div>
          </div>
          <div class="badge badge-draft">Draft</div>
        </div>
      </div>
      <div class="contract-card-body contract-meta">
        <div class="meta-row">
          <span class="meta-label">Amount</span>
          <span class="meta-value">${formatAmount(c.amount)}</span>
        </div>
        <div class="meta-row">
          <span class="meta-label">Created</span>
          <span class="meta-value">${formatDate(c.createdAt)}</span>
        </div>
      </div>
      <div class="contract-card-footer">
        <button class="btn btn-outline btn-sm view-contract-btn">View</button>
        <button class="btn btn-primary btn-sm edit-contract-btn">Edit</button>
      </div>
    </div>`;
}

function renderUserPendingCard(c) {
  return `
    <div class="contract-card" data-id="${c._id}">
      <div class="contract-card-header">
        <div class="contract-card-top">
          <div>
            <div class="contract-title">${escapeHtml(c.title)}</div>
            <div class="contract-client">${escapeHtml(c.clientName) || 'Unknown Client'}</div>
          </div>
          <div class="badge badge-warning">Pending Action</div>
        </div>
      </div>
      <div class="contract-card-body contract-meta">
        <div class="meta-row">
          <span class="meta-label">Amount</span>
          <span class="meta-value">${formatAmount(c.amount)}</span>
        </div>
        <div class="meta-row">
          <span class="meta-label">Due Date</span>
          <span class="meta-value">${formatDate(c.dueDate)}</span>
        </div>
      </div>
      <div class="contract-card-footer">
        <button class="btn btn-outline btn-sm view-contract-btn">Details</button>
        <button class="btn btn-secondary btn-sm send-reminder-btn">Remind Client</button>
      </div>
    </div>`;
}

function renderUserSignedCard(c) {
  const isDeclined = c.status === 'declined';
  const badgeClass = isDeclined ? 'badge-error' : 'badge-success';
  const badgeText = isDeclined ? 'Declined' : 'Signed';
  const dateLabel = isDeclined ? 'Declined On' : 'Signed On';

  return `
    <div class="contract-card" data-id="${c._id}">
      <div class="contract-card-header">
        <div class="contract-card-top">
          <div>
            <div class="contract-title">${escapeHtml(c.title)}</div>
            <div class="contract-client">${escapeHtml(c.clientName) || 'Unknown'}</div>
          </div>
          <div class="badge ${badgeClass}">${badgeText}</div>
        </div>
      </div>
      <div class="contract-card-body contract-meta">
        <div class="meta-row">
          <span class="meta-label">Amount</span>
          <span class="meta-value">${formatAmount(c.amount)}</span>
        </div>
        <div class="meta-row">
          <span class="meta-label">${dateLabel}</span>
          <span class="meta-value">${formatDate(c.signedAt || c.createdAt)}</span>
        </div>
      </div>
      <div class="contract-card-footer">
        <button class="btn btn-outline btn-sm view-contract-btn">View Document</button>
      </div>
    </div>`;
}

function renderClientPendingCard(c) {
  const days = daysUntil(c.dueDate);
  const overdue = days !== null && days < 0;
  const badgeClass = overdue ? 'badge-error' : 'badge-warning';
  const badgeText = overdue ? 'Overdue' : 'Action Required';
  const daysText = overdue ? `Overdue by ${Math.abs(days)} days` : days !== null ? `${days} days left` : '—';
  const senderText = escapeHtml(c.userName) || escapeHtml(c.userEmail) || 'Unknown Sender';

  return `
    <div class="contract-card" data-id="${c._id}">
      <div class="contract-card-header">
        <div class="contract-card-top">
          <div>
            <div class="contract-title">${escapeHtml(c.title)}</div>
            <div class="contract-client">From: ${senderText}</div>
          </div>
          <div class="badge ${badgeClass}">${badgeText}</div>
        </div>
      </div>
      <div class="contract-card-body contract-meta">
        <div class="meta-row">
          <span class="meta-label">Amount</span>
          <span class="meta-value">${formatAmount(c.amount)}</span>
        </div>
        <div class="meta-row">
          <span class="meta-label">${overdue ? 'Status' : 'Time Remaining'}</span>
          <span class="meta-value" style="${overdue ? 'color: var(--danger);' : ''}">${daysText}</span>
        </div>
      </div>
      <div class="contract-card-footer">
        <button class="btn btn-outline btn-sm view-contract-btn">View Details</button>
        <button class="btn btn-secondary btn-sm review-sign-btn">${overdue ? 'Sign Now' : 'Review & Sign'}</button>
      </div>
    </div>`;
}

function renderClientSignedCard(c) {
  const isDeclined = c.status === 'declined';
  const badgeClass = isDeclined ? 'badge-error' : 'badge-success';
  const badgeText = isDeclined ? 'Declined' : 'Completed';
  const dateLabel = isDeclined ? 'Declined On' : 'Signed On';
  const senderText = escapeHtml(c.userName) || escapeHtml(c.userEmail) || '—';

  return `
    <div class="contract-card" data-id="${c._id}">
      <div class="contract-card-header">
        <div class="contract-card-top">
          <div>
            <div class="contract-title">${escapeHtml(c.title)}</div>
            <div class="contract-client">From: ${senderText}</div>
          </div>
          <div class="badge ${badgeClass}">${badgeText}</div>
        </div>
      </div>
      <div class="contract-card-body contract-meta">
        <div class="meta-row">
          <span class="meta-label">Amount</span>
          <span class="meta-value">${formatAmount(c.amount)}</span>
        </div>
        <div class="meta-row">
          <span class="meta-label">${dateLabel}</span>
          <span class="meta-value">${formatDate(c.signedAt || c.createdAt)}</span>
        </div>
      </div>
      <div class="contract-card-footer">
        <button class="btn btn-outline btn-sm view-contract-btn">View Document</button>
      </div>
    </div>`;
}

function renderEmpty(title, text, icon = '📄') {
  return `
    <div class="empty-state">
      <div class="empty-state-icon">${icon}</div>
      <h3>${title}</h3>
      <p>${text}</p>
    </div>`;
}

// ── Populate grids ───────────────────────────────────────────

function fillGrid(gridId, cards, emptyTitle, emptyMsg, emptyIcon) {
  const grid = document.getElementById(gridId);
  if (!grid) return;
  if (cards.length === 0) {
    grid.innerHTML = renderEmpty(emptyTitle, emptyMsg, emptyIcon);
  } else {
    grid.innerHTML = cards.join('');
  }
}

// Update counters
function updateCount(id, count) {
  const el = document.getElementById(id);
  if (el) {
    el.textContent = count;
  }
}

// ── Bind card buttons (delegated) ────────────────────────────

function bindCardButtons() {
  document.querySelectorAll('.edit-contract-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const id = e.target.closest('.contract-card').dataset.id;
      localStorage.setItem('selected_contract_id', id);
      localStorage.setItem('contract_page_mode', 'edit');
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
        localStorage.setItem('contract_page_mode', 'view');
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
    btn.addEventListener('click', async (e) => {
      const card = e.target.closest('.contract-card');
      const id = card.dataset.id;
      const title = card.querySelector('.contract-title').textContent;
      const originalText = btn.textContent;
      
      btn.disabled = true;
      btn.textContent = 'Sending...';
      
      try {
        const res = await fetch(`${API_BASE}/reminders/send`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contract_id: id })
        });
        if (res.ok) {
          showToast('Reminder sent to client for: ' + title, 'success');
        } else {
          showToast('Failed to send reminder', 'error');
        }
      } catch (err) {
        showToast('Failed to send reminder', 'error');
      } finally {
        btn.disabled = false;
        btn.textContent = originalText;
      }
    });
  });
}

// ── Data fetching ────────────────────────────────────────────

async function loadUserDashboard(userId) {
  try {
    const res = await fetch(`${API_BASE}/contracts/user/${userId}`);
    if (!res.ok) throw new Error('Failed to load contracts');
    const contracts = await res.json();

    const drafts = contracts.filter((c) => c.status === 'draft');
    const pending = contracts.filter((c) => c.status === 'sent' || c.status === 'pending');
    const signed = contracts.filter((c) => c.status === 'signed');
    const declined = contracts.filter((c) => c.status === 'declined');

    // Update Counts
    updateCount('countDraft', drafts.length);
    updateCount('countPending', pending.length);
    updateCount('countSigned', signed.length);
    updateCount('countDeclined', declined.length);

    fillGrid('draftContractsGrid', drafts.map(renderUserDraftCard), 'No Drafts', 'You do not have any draft contracts. Click "New Contract" to start.', '📄');
    fillGrid('pendingContractsGrid', pending.map(renderUserPendingCard), 'All Caught Up', 'No contracts are currently awaiting client signatures.', '⏳');
    fillGrid('signedContractsGrid', signed.map(renderUserSignedCard), 'No Signed Documents', 'You have not completed any contracts yet.', '✅');
    fillGrid('declinedContractsGrid', declined.map(renderUserSignedCard), 'No Declined Documents', 'None of your contracts have been declined.', '❌');

    bindCardButtons();
  } catch (err) {
    console.error('Dashboard load error:', err);
    showToast('Failed to load dashboard data.', 'error');
  }
}

async function loadClientDashboard(clientId) {
  try {
    const res = await fetch(`${API_BASE}/contracts/client/${clientId}`);
    if (!res.ok) throw new Error('Failed to load contracts');
    const contracts = await res.json();

    const pending = contracts.filter((c) => c.status === 'sent' || c.status === 'pending');
    const signed = contracts.filter((c) => c.status === 'signed');
    const declined = contracts.filter((c) => c.status === 'declined');

    fillGrid('pendingSignatureGrid', pending.map(renderClientPendingCard), 'You are all caught up', 'No contracts are currently awaiting your signature.', '🤝');
    fillGrid('signedContractsGrid', signed.map(renderClientSignedCard), 'No Signed Contracts', 'You have not signed any contracts on the platform yet.', '✅');
    fillGrid('declinedContractsGrid', declined.map(renderClientSignedCard), 'No Declined Documents', 'You have not declined any contracts.', '❌');

    bindCardButtons();
  } catch (err) {
    console.error('Dashboard load error:', err);
    showToast('Failed to load dashboard data.', 'error');
  }
}

// ── Main ─────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  // Logout handler
  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      if (confirm('Are you sure you want to sign out?')) {
        const userRole = localStorage.getItem('user_role') || 'user';
        localStorage.clear();
        sessionStorage.clear();
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

  // Role crossover protection — a client must never land on the user dashboard
  // and a user/freelancer must never land on the client portal.
  const currentPath = window.location.pathname;
  if (userRole === 'client' && currentPath.includes('user-dashboard')) {
    window.location.href = './client-dashboard.html';
    return;
  }
  if (userRole !== 'client' && currentPath.includes('client-dashboard')) {
    window.location.href = './user-dashboard.html';
    return;
  }

  // Header Info
  const userName = localStorage.getItem('user_name') || 'User';
  
  // Set Display Name in Hero
  const nameDisplay = document.getElementById('userNameDisplay');
  if (nameDisplay) {
    nameDisplay.textContent = capitalizeFirstLetter(userName);
  }

  // Dynamic avatar initials
  const userAvatar = document.getElementById('userAvatar');
  if (userAvatar) {
    const initials = userName
      .split(' ')
      .filter(Boolean)
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
    userAvatar.textContent = initials || 'U';
  }

  // Load data from backend
  if (userRole === 'client') {
    loadClientDashboard(userId);
  } else {
    loadUserDashboard(userId);
  }
});
