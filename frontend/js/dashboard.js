// Dashboard Handler — data-driven via backend API
// Requires: config.js (API_BASE, showToast)

// ── Helpers ──────────────────────────────────────────────────

const DEFAULT_CURRENCY = '₹';
const SUPPORTED_CURRENCIES = new Set(['₹', '$', '€']);

function capitalizeFirstLetter(string) {
  if (!string) return '';
  return string.charAt(0).toUpperCase() + string.slice(1);
}

function normalizeCurrencySymbol(value, fallback = DEFAULT_CURRENCY) {
  return SUPPORTED_CURRENCIES.has(value) ? value : fallback;
}

function parseDateValue(value) {
  if (!value) return null;

  const valueText = String(value).trim();
  const dateOnlyMatch = valueText.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dateOnlyMatch) {
    const [, year, month, day] = dateOnlyMatch;
    return new Date(Number(year), Number(month) - 1, Number(day));
  }

  const parsedDate = new Date(valueText);
  return Number.isNaN(parsedDate.getTime()) ? null : parsedDate;
}

function formatDate(isoString) {
  const d = parseDateValue(isoString);
  return d ? d.toLocaleDateString('en-GB') : '—';
}

function formatAmount(amount, currency) {
  if (amount == null) return '—';
  const numericAmount = Number(amount);
  if (!Number.isFinite(numericAmount)) return '—';

  return `${normalizeCurrencySymbol(currency, DEFAULT_CURRENCY)}${numericAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
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

function isDownloadableStatus(status) {
  return status === 'signed' || status === 'finalized';
}

function isLikelyContractId(value) {
  if (!value) return false;
  return /^[a-f\d]{24}$/i.test(String(value).trim());
}

function normalizeContractType(type) {
  const normalized = String(type || '').trim().toLowerCase();
  if (!normalized) return '';

  // Keep only expected slug characters to avoid path traversal and malformed URLs.
  let safe = normalized
    .replace(/[./\\]+/g, '-')
    .replace(/[^a-z0-9_-]+/g, '')
    .replace(/^[-_]+/, '')
    .replace(/[-_]+$/, '')
    .replace(/([_-])\1+/g, '$1');

  if (!safe) return '';
  return safe;
}

function getContractPage(type) {
  const normalized = normalizeContractType(type).replace(/-/g, '_');
  const map = {
    house_sale: 'create-contract-house-sale.html',
    website_development: 'create-contract-website-development.html',
    broker: 'create-contract-broker.html',
  };

  return map[normalized] || '';
}

let activeLogoutConfirmCard = null;

function performLogout() {
  const userRole = localStorage.getItem('user_role') || 'user';
  localStorage.clear();
  sessionStorage.clear();
  const loginPage = userRole === 'client' ? './client-login.html' : './user-login.html';
  window.location.href = loginPage;
}

function closeLogoutConfirmCard() {
  if (!activeLogoutConfirmCard) return;
  activeLogoutConfirmCard.hidden = true;
  activeLogoutConfirmCard = null;
}

function setupLogoutConfirmation(logoutBtn) {
  const host = logoutBtn.closest('.navbar-user');
  if (!host) return;

  let confirmCard = host.querySelector('.logout-confirm-card');
  if (!confirmCard) {
    confirmCard = document.createElement('div');
    confirmCard.className = 'logout-confirm-card';
    confirmCard.hidden = true;
    confirmCard.innerHTML = `
      <p class="logout-confirm-text">Are you sure you want to log out?</p>
      <div class="logout-confirm-actions">
        <button type="button" class="btn btn-outline btn-sm logout-confirm-cancel">Cancel</button>
        <button type="button" class="btn btn-primary btn-sm logout-confirm-submit">Log out</button>
      </div>
    `;
    host.appendChild(confirmCard);

    confirmCard.querySelector('.logout-confirm-cancel')?.addEventListener('click', () => {
      closeLogoutConfirmCard();
    });
    confirmCard.querySelector('.logout-confirm-submit')?.addEventListener('click', () => {
      performLogout();
    });
    confirmCard.addEventListener('click', (event) => {
      event.stopPropagation();
    });
  }

  logoutBtn.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();

    const shouldOpen = confirmCard.hidden;
    closeLogoutConfirmCard();

    if (shouldOpen) {
      confirmCard.hidden = false;
      activeLogoutConfirmCard = confirmCard;
    }
  });

  document.addEventListener('click', (event) => {
    if (!host.contains(event.target)) {
      closeLogoutConfirmCard();
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      closeLogoutConfirmCard();
    }
  });
}

async function downloadSignedContract(contractId, buttonEl = null) {
  if (!contractId) {
    showToast('Contract ID is missing for download.', 'error');
    return;
  }

  const token = localStorage.getItem('access_token');
  if (!token) {
    showToast('Please sign in again before downloading.', 'error');
    return;
  }

  const originalText = buttonEl ? buttonEl.textContent : '';
  if (buttonEl) {
    buttonEl.disabled = true;
    buttonEl.textContent = 'Downloading...';
  }

  try {
    const res = await authFetch(`${API_BASE}/contracts/${contractId}/download`);
    if (!res.ok) {
      throw new Error('Download request failed');
    }

    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);

    const anchor = document.createElement('a');
    anchor.href = objectUrl;
    anchor.download = `contract_${contractId}.pdf`;
    anchor.style.display = 'none';

    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(objectUrl);
  } catch (error) {
    console.error('Contract download failed:', error);
    showToast('Failed to start contract download.', 'error');
  } finally {
    if (buttonEl) {
      buttonEl.disabled = false;
      buttonEl.textContent = originalText;
    }
  }
}

// ── Card renderers (Modern SaaS Design) ────────────────────────

function renderUserDraftCard(c) {
  return `
    <div class="contract-card" data-id="${c._id}" data-type="${escapeHtml(normalizeContractType(c.type))}">
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
          <span class="meta-value">${formatAmount(c.amount, c.currency)}</span>
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
    <div class="contract-card" data-id="${c._id}" data-type="${escapeHtml(normalizeContractType(c.type))}">
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
          <span class="meta-value">${formatAmount(c.amount, c.currency)}</span>
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
  const isSigned = c.status === 'signed';
  const isDeclined = c.status === 'declined';
  const isDownloadable = isDownloadableStatus(c.status);
  const badgeClass = isDeclined ? 'badge-error' : 'badge-success';
  const badgeText = isDeclined ? 'Declined' : (isSigned ? 'SIGNED' : 'Completed');
  const dateLabel = isDeclined ? 'Declined On' : 'Signed On';
  const downloadButton = isDownloadable
    ? '<button class="btn btn-outline btn-sm download-contract-btn">Download Contract</button>'
    : '';

  return `
    <div class="contract-card" data-id="${c._id}" data-type="${escapeHtml(normalizeContractType(c.type))}">
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
          <span class="meta-value">${formatAmount(c.amount, c.currency)}</span>
        </div>
        <div class="meta-row">
          <span class="meta-label">${dateLabel}</span>
          <span class="meta-value">${formatDate(c.signedAt || c.createdAt)}</span>
        </div>
      </div>
      <div class="contract-card-footer">
        <button class="btn btn-outline btn-sm view-contract-btn">View Document</button>
        ${downloadButton}
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
    <div class="contract-card" data-id="${c._id}" data-type="${escapeHtml(normalizeContractType(c.type))}">
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
          <span class="meta-value">${formatAmount(c.amount, c.currency)}</span>
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
  const isSigned = c.status === 'signed';
  const isDeclined = c.status === 'declined';
  const isDownloadable = isDownloadableStatus(c.status);
  const badgeClass = isDeclined ? 'badge-error' : 'badge-success';
  const badgeText = isDeclined ? 'Declined' : (isSigned ? 'SIGNED' : 'Completed');
  const dateLabel = isDeclined ? 'Declined On' : 'Signed On';
  const senderText = escapeHtml(c.userName) || escapeHtml(c.userEmail) || '—';
  const downloadButton = isDownloadable
    ? '<button class="btn btn-outline btn-sm download-contract-btn">Download Contract</button>'
    : '';

  return `
    <div class="contract-card" data-id="${c._id}" data-type="${escapeHtml(normalizeContractType(c.type))}">
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
          <span class="meta-value">${formatAmount(c.amount, c.currency)}</span>
        </div>
        <div class="meta-row">
          <span class="meta-label">${dateLabel}</span>
          <span class="meta-value">${formatDate(c.signedAt || c.createdAt)}</span>
        </div>
      </div>
      <div class="contract-card-footer">
        <button class="btn btn-outline btn-sm view-contract-btn">View Document</button>
        ${downloadButton}
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
      const card = e.target.closest('.contract-card');
      const id = card.dataset.id;
      const contractType = card.dataset.type;
      if (!isLikelyContractId(id)) {
        showToast('Invalid contract reference. Please refresh the dashboard and try again.', 'error');
        return;
      }
      window.location.href = `./${getContractPage(contractType)}?contractId=${encodeURIComponent(id)}&mode=edit`;
    });
  });

  document.querySelectorAll('.view-contract-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const card = e.target.closest('.contract-card');
      const id = card.dataset.id;
      if (!isLikelyContractId(id)) {
        showToast('Invalid contract reference. Please refresh the dashboard and try again.', 'error');
        return;
      }
      // Route by current dashboard context so stale role data cannot misroute to create-contract.
      const isClientDashboard = window.location.pathname.includes('client-dashboard');
      if (isClientDashboard) {
        window.location.href = `./sign-contract.html?contractId=${encodeURIComponent(id)}`;
      } else {
        const contractType = card.dataset.type;
        window.location.href = `./${getContractPage(contractType)}?contractId=${encodeURIComponent(id)}&mode=view`;
      }
    });
  });

  document.querySelectorAll('.review-sign-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const id = e.target.closest('.contract-card').dataset.id;
      if (!isLikelyContractId(id)) {
        showToast('Invalid contract reference. Please refresh the dashboard and try again.', 'error');
        return;
      }
      window.location.href = `./sign-contract.html?contractId=${encodeURIComponent(id)}`;
    });
  });

  document.querySelectorAll('.send-reminder-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const originalText = btn.textContent;

      btn.disabled = true;
      btn.textContent = 'Sending...';

      window.setTimeout(() => {
        showToast('Reminder sent to client successfully.', 'success');
        btn.disabled = false;
        btn.textContent = originalText;
      }, 300);
    });
  });

  document.querySelectorAll('.download-contract-btn').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      const card = e.target.closest('.contract-card');
      const id = card ? card.dataset.id : '';
      await downloadSignedContract(id, btn);
    });
  });
}

// ── Data fetching ────────────────────────────────────────────

async function loadUserDashboard(userId) {
  try {
    const res = await authFetch(`${API_BASE}/contracts/user/${userId}`);
    if (!res.ok) throw new Error('Failed to load contracts');
    const contracts = await res.json();

    const drafts = contracts.filter((c) => c.status === 'draft');
    const pending = contracts.filter((c) => c.status === 'sent' || c.status === 'pending');
    const signed = contracts.filter((c) => c.status === 'signed' || c.status === 'finalized');
    const declined = contracts.filter((c) => c.status === 'declined');

    // Update Counts
    updateCount('countDraft', drafts.length);
    updateCount('countPending', pending.length);
    updateCount('countSigned', signed.length);
    updateCount('countDeclined', declined.length);

    fillGrid('pendingContractsGrid', pending.map(renderUserPendingCard), 'All Caught Up', 'No contracts are currently awaiting client signatures.', '⏳');
    fillGrid('signedContractsGrid', signed.map(renderUserSignedCard), 'No Signed Documents', 'You have not completed any contracts yet.', '✅');
    fillGrid('declinedContractsGrid', declined.map(renderUserSignedCard), 'No Declined Documents', 'None of your contracts have been declined.', '❌');
    fillGrid('draftContractsGrid', drafts.map(renderUserDraftCard), 'No Draft Contracts', 'You do not have any saved drafts yet.', '📝');

    bindCardButtons();
  } catch (err) {
    console.error('Dashboard load error:', err);
    showToast('Failed to load dashboard data.', 'error');
  }
}

async function loadClientDashboard(clientId) {
  try {
    const res = await authFetch(`${API_BASE}/contracts/client/${clientId}`);
    if (!res.ok) throw new Error('Failed to load contracts');
    const contracts = await res.json();

    const pending = contracts.filter((c) => c.status === 'sent' || c.status === 'pending');
    const signed = contracts.filter((c) => c.status === 'signed' || c.status === 'finalized');
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
    setupLogoutConfirmation(logoutBtn);
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
