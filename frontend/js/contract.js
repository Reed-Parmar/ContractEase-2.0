// Contract Creation & Signing Handler
// Requires: config.js (API_BASE, showToast)

let currentStep = 1;
let selectedContractType = null;
let isDrawing = false;
let lastX = 0;
let lastY = 0;
let hasSignatureInk = false;
let selectedContractStatus = null;

// Set to true when the page is opened in edit/view mode to prevent draft caching
let isEditOrViewMode = false;

const DRAFT_STORAGE_KEY = 'contract_wizard_draft';

document.addEventListener('DOMContentLoaded', () => {
  // ── Role-Based Route Protection ──────────────────────────────
  const userRole = localStorage.getItem('user_role');
  const currentPath = window.location.pathname;

  if (!userRole) {
    window.location.href = './user-login.html';
    return;
  }

  // Prevent clients from accessing the creator wizard
  if (userRole === 'client' && currentPath.includes('create-contract')) {
    window.location.href = './client-dashboard.html';
    return;
  }

  // Prevent users from accessing the client signing page
  if (userRole === 'user' && currentPath.includes('sign-contract')) {
    window.location.href = './user-dashboard.html';
    return;
  }

  // ── Contract Type Selection ──────────────────────────────────
  const contractTypeOptions = document.querySelectorAll('.contract-type-option');
  contractTypeOptions.forEach((option) => {
    option.addEventListener('click', () => {
      contractTypeOptions.forEach((opt) => opt.classList.remove('selected'));
      option.classList.add('selected');
      selectedContractType = option.dataset.type;
      saveDraft();
    });
  });

  // ── Toggle Switches ──────────────────────────────────────────
  const toggleSwitches = document.querySelectorAll('.toggle-switch');
  toggleSwitches.forEach((toggle) => {
    toggle.addEventListener('change', () => {
      saveDraft();
      if (currentStep === 3) {
        updatePreview();
      }
    });
  });

  // ── Draft persistence — save on every field change ——————————————
  ['contractTitle', 'clientName', 'clientEmail', 'contractAmount', 'dueDate', 'contractDescription'].forEach((fieldId) => {
    const el = document.getElementById(fieldId);
    if (el) {
      el.addEventListener('input', saveDraft);
      el.addEventListener('change', saveDraft);
      // Clear inline error highlight as soon as the user starts correcting the field
      el.addEventListener('input', () => clearFieldError(el));
    }
  });

  // ── Step Navigation (Create Contract) ────────────────────────
  const nextBtn = document.getElementById('nextBtn');
  const prevBtn = document.getElementById('prevBtn');
  const submitBtn = document.getElementById('submitBtn');

  if (nextBtn) {
    nextBtn.addEventListener('click', () => {
      if (currentStep === 1 && !selectedContractType) {
        showToast('Please select a contract type to continue.', 'warning');
        return;
      }
      // Validate Step 2 required fields before advancing to Step 3
      if (currentStep === 2) {
        const titleEl = document.getElementById('contractTitle');
        const emailEl = document.getElementById('clientEmail');
        [titleEl, emailEl].forEach((el) => { if (el) clearFieldError(el); });

        const fieldErrors = [];
        if (titleEl && !titleEl.value.trim()) fieldErrors.push({ el: titleEl, msg: 'Contract title is required.' });
        if (emailEl && !emailEl.value.trim()) fieldErrors.push({ el: emailEl, msg: 'Client email address is required.' });

        if (fieldErrors.length > 0) {
          fieldErrors.forEach(({ el, msg }) => setFieldError(el, msg));
          // Scroll viewport to the first invalid field so the user knows where to look
          fieldErrors[0].el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          return;
        }
      }
      goToStep(currentStep + 1);
    });
  }

  if (prevBtn) {
    prevBtn.addEventListener('click', () => {
      goToStep(currentStep - 1);
    });
  }

  if (submitBtn) {
    submitBtn.addEventListener('click', () => {
      submitContract();
    });
  }
  // ── Cancel Draft ────────────────────────────────────────────────────
  const cancelDraftBtn = document.getElementById('cancelDraftBtn');
  if (cancelDraftBtn) {
    cancelDraftBtn.addEventListener('click', () => {
      // Only wipe the draft when genuinely cancelling a new contract creation
      if (!isEditOrViewMode) clearDraft();
      window.location.href = './user-dashboard.html';
    });
  }
  // ── Signature Canvas (Sign Contract) ─────────────────────────
  const signatureCanvas = document.getElementById('signatureCanvas');
  if (signatureCanvas) {
    const ctx = signatureCanvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;

    const rect = signatureCanvas.getBoundingClientRect();
    signatureCanvas.width = rect.width * dpr;
    signatureCanvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    signatureCanvas.addEventListener('mousedown', (e) => {
      isDrawing = true;
      const rect = signatureCanvas.getBoundingClientRect();
      lastX = e.clientX - rect.left;
      lastY = e.clientY - rect.top;
    });

    signatureCanvas.addEventListener('mousemove', (e) => {
      if (!isDrawing) return;
      const rect = signatureCanvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      hasSignatureInk = true;

      ctx.strokeStyle = '#1f2937';
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      ctx.beginPath();
      ctx.moveTo(lastX, lastY);
      ctx.lineTo(x, y);
      ctx.stroke();

      lastX = x;
      lastY = y;
    });

    signatureCanvas.addEventListener('mouseup', () => { isDrawing = false; });
    signatureCanvas.addEventListener('mouseleave', () => { isDrawing = false; });

    // Touch support
    signatureCanvas.addEventListener('touchstart', (e) => {
      e.preventDefault();
      isDrawing = true;
      const rect = signatureCanvas.getBoundingClientRect();
      const touch = e.touches[0];
      lastX = touch.clientX - rect.left;
      lastY = touch.clientY - rect.top;
    });

    signatureCanvas.addEventListener('touchmove', (e) => {
      e.preventDefault();
      if (!isDrawing) return;
      const rect = signatureCanvas.getBoundingClientRect();
      const touch = e.touches[0];
      const x = touch.clientX - rect.left;
      const y = touch.clientY - rect.top;
      hasSignatureInk = true;

      ctx.strokeStyle = '#1f2937';
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      ctx.beginPath();
      ctx.moveTo(lastX, lastY);
      ctx.lineTo(x, y);
      ctx.stroke();

      lastX = x;
      lastY = y;
    });

    signatureCanvas.addEventListener('touchend', () => { isDrawing = false; });
  }

  // Clear Signature
  const clearSignatureBtn = document.getElementById('clearSignatureBtn');
  if (clearSignatureBtn) {
    clearSignatureBtn.addEventListener('click', () => {
      const signatureCanvas = document.getElementById('signatureCanvas');
      if (signatureCanvas) {
        const ctx = signatureCanvas.getContext('2d');
        ctx.clearRect(0, 0, signatureCanvas.width, signatureCanvas.height);
        hasSignatureInk = false;
      }
    });
  }

  // Toggle Signature Type
  const toggleTypeBtn = document.getElementById('toggleTypedSignatureBtn');
  if (toggleTypeBtn) {
    toggleTypeBtn.addEventListener('click', () => {
      const flag = document.getElementById('signatureTypeFlag');
      const drawWrapper = document.getElementById('drawSignatureWrapper');
      const typeWrapper = document.getElementById('typedSignatureWrapper');
      
      if (flag.value === 'draw') {
        flag.value = 'type';
        drawWrapper.style.display = 'none';
        typeWrapper.style.display = 'block';
        toggleTypeBtn.textContent = 'draw your signature';
      } else {
        flag.value = 'draw';
        drawWrapper.style.display = 'block';
        typeWrapper.style.display = 'none';
        toggleTypeBtn.textContent = 'type your signature';
      }
    });
  }

  // Sign Contract Button
  const signBtn = document.getElementById('signBtn');
  if (signBtn) {
    signBtn.addEventListener('click', signContract);
  }

  // Reject Button
  const rejectBtn = document.getElementById('rejectBtn');
  if (rejectBtn) {
    rejectBtn.addEventListener('click', declineContract);
  }

  // Mobile menu toggle
  const mobileMenuToggle = document.getElementById('mobileMenuToggle');
  const navbarMenu = document.getElementById('navbarMenu');
  if (mobileMenuToggle && navbarMenu) {
    mobileMenuToggle.addEventListener('click', () => {
      navbarMenu.classList.toggle('active');
    });
  }

  // Logout
  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      const role = localStorage.getItem('user_role') || 'user';
      localStorage.clear();
      sessionStorage.clear();
      window.location.href = role === 'client' ? './client-login.html' : './user-login.html';
    });
  }

  // Set today's date for signer
  const signerDate = document.getElementById('signerDate');
  if (signerDate) {
    signerDate.value = new Date().toISOString().split('T')[0];
  }

  const signerName = document.getElementById('signerName');
  if (signerName && !signerName.value) {
    signerName.value = localStorage.getItem('user_name') || '';
  }

  const signerEmail = document.getElementById('signerEmail');
  if (signerEmail && !signerEmail.value) {
    signerEmail.value = localStorage.getItem('user_email') || '';
  }

  // Dynamic avatar initials
  const userInitialsEl = document.getElementById('userInitials');
  if (userInitialsEl) {
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

  // ── If create-contract page, load selected contract for edit/view ──
  loadCreateContractPage();

  // ── If sign-contract page, load contract data ────────────────
  loadSignContractPage();
});

// ── Step navigation ──────────────────────────────────────────

function goToStep(step) {
  document.querySelectorAll('[id^="step-"]').forEach((el) => {
    el.classList.add('hidden');
  });

  const stepElement = document.getElementById(`step-${step}`);
  if (stepElement) stepElement.classList.remove('hidden');

  document.querySelectorAll('.progress-step').forEach((el) => {
    const stepNum = parseInt(el.dataset.step);
    el.classList.remove('active', 'completed');
    if (stepNum === step) el.classList.add('active');
    else if (stepNum < step) el.classList.add('completed');
  });

  const prevBtn = document.getElementById('prevBtn');
  const nextBtn = document.getElementById('nextBtn');
  const submitBtn = document.getElementById('submitBtn');

  if (prevBtn) prevBtn.style.display = step > 1 ? 'inline-flex' : 'none';
  if (nextBtn) nextBtn.style.display = step < 3 ? 'inline-flex' : 'none';
  if (submitBtn) submitBtn.style.display = step === 3 ? 'inline-flex' : 'none';

  currentStep = step;

  if (step === 3) updatePreview();
}

// ── Draft persistence helpers ─────────────────────────────────

/**
 * Serialise current wizard state to localStorage so users don't lose
 * data when navigating back or accidentally refreshing the page.
 * Skipped when the page is in edit/view mode for an existing contract.
 */
function saveDraft() {
  if (isEditOrViewMode) return;
  const draft = {
    contractType: selectedContractType,
    contractTitle: document.getElementById('contractTitle')?.value || '',
    clientName: document.getElementById('clientName')?.value || '',
    clientEmail: document.getElementById('clientEmail')?.value || '',
    contractAmount: document.getElementById('contractAmount')?.value || '',
    dueDate: document.getElementById('dueDate')?.value || '',
    contractDescription: document.getElementById('contractDescription')?.value || '',
    clauses: {},
  };
  document.querySelectorAll('.toggle-switch[data-clause]').forEach((toggle) => {
    draft.clauses[toggle.dataset.clause] = toggle.checked;
  });
  localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draft));
}

/** Re-populate all wizard fields from a previously saved draft. */
function restoreDraft() {
  const raw = localStorage.getItem(DRAFT_STORAGE_KEY);
  if (!raw) return;
  try {
    const draft = JSON.parse(raw);
    if (draft.contractType) {
      selectedContractType = draft.contractType;
      document.querySelectorAll('.contract-type-option').forEach((opt) => {
        opt.classList.toggle('selected', opt.dataset.type === draft.contractType);
      });
    }
    ['contractTitle', 'clientName', 'clientEmail', 'contractAmount', 'dueDate', 'contractDescription'].forEach((id) => {
      const el = document.getElementById(id);
      if (el && draft[id]) el.value = draft[id];
    });
    if (draft.clauses) {
      document.querySelectorAll('.toggle-switch[data-clause]').forEach((toggle) => {
        if (draft.clauses[toggle.dataset.clause] !== undefined) {
          toggle.checked = draft.clauses[toggle.dataset.clause];
        }
      });
    }
  } catch (err) {
    console.warn('Could not restore wizard draft:', err);
  }
}

/** Remove the cached draft — called on successful send or intentional cancel. */
function clearDraft() {
  localStorage.removeItem(DRAFT_STORAGE_KEY);
}

// ── Field-level validation helpers ───────────────────────────

/**
 * Mark a form field as invalid and attach an inline error message below it.
 * @param {HTMLElement} field
 * @param {string} message
 */
function setFieldError(field, message) {
  field.classList.add('input-error');
  // Avoid appending a duplicate message on repeated validation attempts
  if (!field.parentElement.querySelector('.form-error-msg')) {
    const msg = document.createElement('span');
    msg.className = 'form-error-msg';
    msg.textContent = message;
    field.parentElement.appendChild(msg);
  }
}

/**
 * Remove the invalid state and inline error message from a form field.
 * @param {HTMLElement} field
 */
function clearFieldError(field) {
  field.classList.remove('input-error');
  const errMsg = field.parentElement?.querySelector('.form-error-msg');
  if (errMsg) errMsg.remove();
}

function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatContractAmount(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return '$0';
  return '$' + numeric.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

function formatContractDate(value) {
  if (!value) return '—';
  const dateValue = new Date(value);
  if (Number.isNaN(dateValue.getTime())) return '—';
  return dateValue.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function buildContractSectionCopy(details) {
  const title = String(details.title || 'this agreement').trim() || 'this agreement';
  const description = String(details.description || '').trim();
  const clauses = details.clauses || {};
  const amountText = formatContractAmount(details.amount);
  const dueText = formatContractDate(details.dueDate);

  return {
    services: description || 'The provider will deliver the agreed services in a professional and timely manner.',
    paymentHtml: clauses.payment === false
      ? `Commercial terms for this agreement total <strong>${escapeHtml(amountText)}</strong>, with the active date set for <strong>${escapeHtml(dueText)}</strong>.`
      : `In consideration for the services provided, the Client agrees to pay the total amount of <strong>${escapeHtml(amountText)}</strong>. Payment shall be due no later than <strong>${escapeHtml(dueText)}</strong>.`,
    deliverables: `The provider will deliver the agreed work product, revisions, and final materials required for ${title}.${clauses.liability ? ' All approved deliverables remain subject to the agreed limitation of liability.' : ''}`,
    confidentiality: clauses.confidentiality === false
      ? 'No additional confidentiality clause was selected for this agreement.'
      : 'Both parties agree to maintain the confidentiality of proprietary information shared during the course of this engagement.',
    termination: clauses.termination === false
      ? 'This agreement remains active until the contracted work is completed or the parties otherwise agree in writing.'
      : 'Either party may terminate this agreement with written notice. All outstanding obligations must be fulfilled prior to termination.',
    signatures: 'By electronically signing below, the parties acknowledge that they have read, understood, and agreed to be bound by all terms and conditions set forth within this document.',
  };
}

// ── Update preview ───────────────────────────────────────────

function updatePreview() {
  const contractTitle = document.getElementById('contractTitle');
  const clientName = document.getElementById('clientName');
  const contractAmount = document.getElementById('contractAmount');
  const dueDate = document.getElementById('dueDate');
  const contractDescription = document.getElementById('contractDescription');

  const clauses = {
    payment: !!document.querySelector('.toggle-switch[data-clause="payment"]')?.checked,
    liability: !!document.querySelector('.toggle-switch[data-clause="liability"]')?.checked,
    confidentiality: !!document.querySelector('.toggle-switch[data-clause="confidentiality"]')?.checked,
    termination: !!document.querySelector('.toggle-switch[data-clause="termination"]')?.checked,
  };

  const sectionCopy = buildContractSectionCopy({
    title: contractTitle?.value,
    description: contractDescription?.value,
    amount: contractAmount?.value,
    dueDate: dueDate?.value,
    clauses,
  });

  if (contractTitle) {
    document.getElementById('previewTitle').textContent = contractTitle.value || 'Service Agreement';
  }
  if (clientName) {
    document.getElementById('previewClient').textContent = clientName.value || 'Client';
  }

  const today = new Date();
  const previewDate = document.getElementById('previewDate');
  if (previewDate) {
    previewDate.textContent = today.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  }

  const servicesText = document.getElementById('previewServicesText');
  if (servicesText) servicesText.textContent = sectionCopy.services;

  const paymentText = document.getElementById('previewPaymentText');
  if (paymentText) paymentText.innerHTML = sectionCopy.paymentHtml;

  const deliverablesText = document.getElementById('previewDeliverablesText');
  if (deliverablesText) deliverablesText.textContent = sectionCopy.deliverables;

  const confidentialityText = document.getElementById('previewConfidentialityText');
  if (confidentialityText) confidentialityText.textContent = sectionCopy.confidentiality;

  const terminationText = document.getElementById('previewTerminationText');
  if (terminationText) terminationText.textContent = sectionCopy.termination;

  const signatureText = document.getElementById('previewSignatureText');
  if (signatureText) signatureText.textContent = sectionCopy.signatures;
}

async function loadCreateContractPage() {
  const contractTitleEl = document.getElementById('contractTitle');
  if (!contractTitleEl) return; // Not on the create-contract page

  const mode = localStorage.getItem('contract_page_mode');
  const contractId = localStorage.getItem('selected_contract_id');

  // Detect edit/view mode BEFORE clearing localStorage items so the flag is set first
  if (contractId && mode && (mode === 'edit' || mode === 'view')) {
    isEditOrViewMode = true;
  }

  // Clear immediately — next visit to this page must start fresh (new contract)
  localStorage.removeItem('contract_page_mode');
  localStorage.removeItem('selected_contract_id');

  if (!isEditOrViewMode) {
    // New contract — restore any unsaved wizard draft from a previous session
    restoreDraft();
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/contracts/${contractId}`);
    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(
        `Failed to load contract (${res.status} ${res.statusText})${errorText ? `: ${errorText}` : ''}`,
      );
    }

    const c = await res.json();

    contractTitleEl.value = c.title || '';

    const clientNameEl = document.getElementById('clientName');
    if (clientNameEl) clientNameEl.value = c.clientName || '';

    const clientEmailEl = document.getElementById('clientEmail');
    if (clientEmailEl) clientEmailEl.value = c.clientEmail || '';

    const contractAmountEl = document.getElementById('contractAmount');
    if (contractAmountEl) contractAmountEl.value = c.amount != null ? String(c.amount) : '';

    const dueDateEl = document.getElementById('dueDate');
    if (dueDateEl && c.dueDate) {
      dueDateEl.value = new Date(c.dueDate).toISOString().split('T')[0];
    }

    const contractDescriptionEl = document.getElementById('contractDescription');
    if (contractDescriptionEl) contractDescriptionEl.value = c.description || '';

    if (c.type) {
      selectedContractType = c.type;
      document.querySelectorAll('.contract-type-option').forEach((opt) => {
        opt.classList.toggle('selected', opt.dataset.type === c.type);
      });
    }

    document.querySelectorAll('.toggle-switch').forEach((toggle) => {
      const clauseKey = toggle.dataset.clause;
      const active = !!c.clauses?.[clauseKey];
      toggle.checked = active;
    });

    if (mode === 'view') {
      // View mode: jump to Step 3 (preview), hide all navigation so form is read-only
      updatePreview();
      goToStep(3);
      const prevBtn = document.getElementById('prevBtn');
      const nextBtn = document.getElementById('nextBtn');
      const submitBtn = document.getElementById('submitBtn');
      if (prevBtn) prevBtn.style.display = 'none';
      if (nextBtn) nextBtn.style.display = 'none';
      if (submitBtn) submitBtn.style.display = 'none';

      // Update page title to reflect view mode
      const editorTitle = document.querySelector('.editor-title');
      if (editorTitle) editorTitle.textContent = c.title || 'View Contract';
    } else {
      // Edit mode: jump to Step 2 which shows clause toggles
      goToStep(2);

      const editorTitle = document.querySelector('.editor-title');
      if (editorTitle) editorTitle.textContent = 'Edit: ' + (c.title || 'Contract');
    }
  } catch (err) {
    console.error('Failed to load contract for edit/view:', err);
    showToast('Could not load the selected contract. Please try again from the dashboard.', 'error');
  }
}

// ── Submit contract (create in backend) ──────────────────────

async function submitContract() {
  const contractTitle = document.getElementById('contractTitle')?.value?.trim();
  const clientEmail = document.getElementById('clientEmail')?.value?.trim();
  const contractAmount = document.getElementById('contractAmount')?.value?.trim();
  const dueDate = document.getElementById('dueDate')?.value;
  const contractDescription = document.getElementById('contractDescription')?.value?.trim();

  if (!contractTitle || !clientEmail) {
    // Highlight the specific fields that are missing so the user knows exactly what to fix
    const titleEl = document.getElementById('contractTitle');
    const emailEl = document.getElementById('clientEmail');
    if (titleEl) clearFieldError(titleEl);
    if (emailEl) clearFieldError(emailEl);
    if (!contractTitle && titleEl) setFieldError(titleEl, 'Contract title is required.');
    if (!clientEmail && emailEl) setFieldError(emailEl, 'Client email address is required.');
    showToast('Please fill in all required fields.', 'warning');
    return;
  }

  // Read clause toggle states
  const clauses = {
    payment: !!document.querySelector('.toggle-switch[data-clause="payment"]')?.checked,
    liability: !!document.querySelector('.toggle-switch[data-clause="liability"]')?.checked,
    confidentiality: !!document.querySelector('.toggle-switch[data-clause="confidentiality"]')?.checked,
    termination: !!document.querySelector('.toggle-switch[data-clause="termination"]')?.checked,
  };

  const userId = localStorage.getItem('user_id');
  if (!userId) {
    showToast('You must be logged in to create a contract.', 'error');
    window.location.href = './user-login.html';
    return;
  }

  // Look up client by email
  let clientId = null;
  try {
    const lookupRes = await fetch(`${API_BASE}/clients/by-email?email=${encodeURIComponent(clientEmail)}`);
    if (lookupRes.ok) {
      const lookupData = await lookupRes.json();
      clientId = lookupData.user_id;
    }
  } catch (_) { /* ignore */ }

  // If client not found, auto-create their account so the contract can be sent
  if (!clientId) {
    try {
      // Derive a display name from the email prefix (e.g. "jane.doe" → "Jane Doe")
      const namePart = clientEmail.split('@')[0].replace(/[._\-]+/g, ' ');
      const derivedName = namePart.replace(/\b\w/g, (ch) => ch.toUpperCase());
      const autoRes = await fetch(`${API_BASE}/register/client`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: derivedName, email: clientEmail, password: 'client123' }),
      });
      if (autoRes.ok) {
        const autoData = await autoRes.json();
        clientId = autoData.user_id;
        showToast(`Client account created. They can sign in with password: client123`, 'info');
      } else {
        const autoErr = await autoRes.json();
        showToast(autoErr.detail || 'Could not create client account.', 'error');
        return;
      }
    } catch (_) {
      showToast('Could not reach the server to create the client account.', 'error');
      return;
    }
  }

  // Parse amount — input is type="number" so value is already numeric
  const parsedAmount = parseFloat(contractAmount || '0') || 0;

  const payload = {
    title: contractTitle,
    type: selectedContractType || 'custom',
    description: contractDescription || '',
    amount: parsedAmount,
    dueDate: dueDate ? new Date(dueDate).toISOString() : new Date().toISOString(),
    clauses: clauses,
    userId: userId,
    clientId: clientId,
  };

  try {
    const res = await fetch(`${API_BASE}/contracts/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const err = await res.json();
      showToast(err.detail || 'Failed to create contract.', 'error');
      return;
    }

    const created = await res.json();

    // Also mark it as sent immediately (since the button says "Send to Client")
    const sendRes = await fetch(`${API_BASE}/contracts/${created._id}/send`, { method: 'PUT' });
    if (!sendRes.ok) {
      const sendErrorText = await sendRes.text();
      let sendMessage = `Failed to send contract (${sendRes.status} ${sendRes.statusText})`;

      if (sendErrorText) {
        try {
          const sendErrorJson = JSON.parse(sendErrorText);
          sendMessage = sendErrorJson.detail || sendErrorJson.message || sendMessage;
        } catch {
          sendMessage = sendErrorText;
        }
      }

      console.error('Failed to send contract:', sendMessage);
      showToast(sendMessage, 'error');
      return;
    }

    // Clear stale edit/view state so the next "Create New Contract" starts fresh
    localStorage.removeItem('selected_contract_id');
    localStorage.removeItem('contract_page_mode');

    clearDraft();
    showToast('Contract sent to ' + clientEmail, 'success');
    setTimeout(() => { window.location.href = './user-dashboard.html'; }, 1200);
  } catch (err) {
    console.error(err);
    showToast('Could not reach the server.', 'error');
  }
}

// ── Load sign-contract page with real data ───────────────────

async function loadSignContractPage() {
  const contractId = localStorage.getItem('selected_contract_id');
  // Only run on the sign-contract page (check for signBtn OR editor-title with sign breadcrumb)
  const signBtn = document.getElementById('signBtn');
  const editorTitle = document.querySelector('.editor-title');
  if (!signBtn && !editorTitle) return; // not on sign page
  if (!document.getElementById('signatureCanvas') && !document.getElementById('signBtn')) return;

  if (!contractId) return;

  try {
    const res = await fetch(`${API_BASE}/contracts/${contractId}`);
    if (!res.ok) return;
    const c = await res.json();
    selectedContractStatus = c.status;
    const isSignable = c.status === 'sent' || c.status === 'pending';

    // Update page title
    if (editorTitle) editorTitle.textContent = c.title;

    // Update signing status
    const statusContent = document.querySelector('.signing-status-content');
    if (statusContent) {
      const dueStr = c.dueDate ? new Date(c.dueDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : '—';
      if (isSignable) {
        statusContent.innerHTML = `<h3>Action Required</h3><p>Please review and sign this contract by ${dueStr}</p>`;
      } else if (c.status === 'signed') {
        const signedStr = c.signedAt
          ? new Date(c.signedAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
          : '—';
        statusContent.innerHTML = `<h3>Already Signed</h3><p>This contract was signed on ${signedStr}.</p>`;
      } else if (c.status === 'declined') {
        statusContent.innerHTML = '<h3>Contract Declined</h3><p>This contract has already been declined and can no longer be signed.</p>';
      } else {
        statusContent.innerHTML = `<h3>Status: ${c.status}</h3><p>This contract is not currently available for signing.</p>`;
      }
    }

    // Update contract preview content
    const previewContent = document.querySelector('.preview-content');
    if (previewContent) {
      const sectionCopy = buildContractSectionCopy({
        title: c.title,
        description: c.description,
        amount: c.amount,
        dueDate: c.dueDate,
        clauses: c.clauses || {},
      });

      let html = `<h2>${escapeHtml(c.title || 'Service Agreement')}</h2>`;
      html += `<p>This agreement is entered into as of ${escapeHtml(formatContractDate(c.createdAt))}.</p>`;
      html += `<section class="preview-section"><h2>Services & Scope</h2><p>${escapeHtml(sectionCopy.services)}</p></section>`;
      html += `<section class="preview-section"><h2>Compensation & Payment</h2><p>${sectionCopy.paymentHtml}</p></section>`;
      html += `<section class="preview-section"><h2>Deliverables</h2><p>${escapeHtml(sectionCopy.deliverables)}</p></section>`;
      html += `<section class="preview-section"><h2>Confidentiality</h2><p>${escapeHtml(sectionCopy.confidentiality)}</p></section>`;
      html += `<section class="preview-section"><h2>Term & Termination</h2><p>${escapeHtml(sectionCopy.termination)}</p></section>`;
      html += `<section class="preview-section"><h2>Signatures</h2><p>${escapeHtml(sectionCopy.signatures)}</p></section>`;
      previewContent.innerHTML = html;
    }

    // Update contract info section using stable element IDs
    const contractIdValueEl = document.getElementById('contractId');
    const sentByValueEl = document.getElementById('sentBy');
    const receivedAtValueEl = document.getElementById('receivedAt');
    const signatureDeadlineValueEl = document.getElementById('signatureDeadline');

    if (contractIdValueEl) contractIdValueEl.textContent = c._id;
    if (sentByValueEl) sentByValueEl.textContent = c.userName || c.userEmail || '—';
    if (receivedAtValueEl) {
      receivedAtValueEl.textContent = new Date(c.createdAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    }
    if (signatureDeadlineValueEl) {
      signatureDeadlineValueEl.textContent = c.dueDate ? new Date(c.dueDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : '—';
    }

    if (!isSignable) {
      // Hide the signature form and action buttons entirely
      const signatureSectionEl = document.getElementById('signatureSection');
      const formActionsEl = document.querySelector('.form-actions');
      if (signatureSectionEl) signatureSectionEl.style.display = 'none';
      if (formActionsEl) formActionsEl.style.display = 'none';

      // For signed contracts, fetch and display the stored signature
      if (c.status === 'signed') {
        try {
          const sigRes = await fetch(`${API_BASE}/contracts/${contractId}/signature`);
          if (sigRes.ok) {
            const sig = await sigRes.json();
            const el = (id) => document.getElementById(id);
            if (el('signedByName')) el('signedByName').textContent = sig.signerName || '—';
            if (el('signedByEmail')) el('signedByEmail').textContent = sig.signerEmail || '—';
            if (el('signedByDate')) {
              el('signedByDate').textContent = sig.signedAt
                ? new Date(sig.signedAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
                : '—';
            }
            if (el('signatureImageDisplay') && sig.signatureImage) {
              el('signatureImageDisplay').src = sig.signatureImage;
            }
            const signedDetailsEl = document.getElementById('signedDetailsSection');
            if (signedDetailsEl) signedDetailsEl.style.display = 'block';
          }
        } catch (_) { /* signature display is best-effort */ }
      }
    }
  } catch (err) {
    console.error('Failed to load contract for signing:', err);
  }
}

function canvasContainsDrawing(canvas) {
  if (!canvas) return false;

  if (hasSignatureInk) return true;

  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return false;

  const pixelData = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  for (let i = 3; i < pixelData.length; i += 4) {
    if (pixelData[i] !== 0) return true;
  }

  return false;
}

// ── Sign contract ────────────────────────────────────────────

async function signContract() {
  if (selectedContractStatus && selectedContractStatus !== 'sent' && selectedContractStatus !== 'pending') {
    showToast('This contract can no longer be signed.', 'error');
    return;
  }

  const signerName = document.getElementById('signerName')?.value?.trim();
  const signerEmail = document.getElementById('signerEmail')?.value?.trim();
  const agreeTerms = document.getElementById('agreeTerms')?.checked;
  const signatureCanvas = document.getElementById('signatureCanvas');
  const signatureType = document.getElementById('signatureTypeFlag')?.value;
  const typedSignature = document.getElementById('typedSignatureInput')?.value?.trim();

  if (!signerName || !signerEmail || !agreeTerms) {
    showToast('Please fill in all required fields and agree to the terms.', 'warning');
    return;
  }

  if (signatureType === 'draw' && !canvasContainsDrawing(signatureCanvas)) {
    showToast('Please draw your signature in the box above.', 'warning');
    return;
  }
  
  if (signatureType === 'type' && !typedSignature) {
    showToast('Please type your legal name as your signature.', 'warning');
    return;
  }

  let signatureData;
  if (signatureType === 'draw') {
    signatureData = signatureCanvas.toDataURL('image/png');
  } else {
    // Generate simple canvas for typed signature
    const textCanvas = document.createElement('canvas');
    textCanvas.width = 400;
    textCanvas.height = 150;
    const tCtx = textCanvas.getContext('2d');
    tCtx.fillStyle = '#ffffff';
    tCtx.fillRect(0, 0, textCanvas.width, textCanvas.height);
    tCtx.font = 'italic 48px serif';
    tCtx.fillStyle = '#1f2937';
    tCtx.textAlign = 'center';
    tCtx.textBaseline = 'middle';
    tCtx.fillText(typedSignature, 200, 75);
    signatureData = textCanvas.toDataURL('image/png');
  }

  const contractId = localStorage.getItem('selected_contract_id');
  if (!contractId) {
    showToast('No contract selected.', 'error');
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/contracts/${contractId}/sign`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        signerName,
        signerEmail,
        signatureImage: signatureData,
      }),
    });

    if (!res.ok) {
      const err = await res.json();
      showToast(err.detail || 'Failed to sign contract.', 'error');
      return;
    }

    showToast('Contract signed successfully!', 'success');
    localStorage.removeItem('selected_contract_id');
    setTimeout(() => { window.location.href = './client-dashboard.html'; }, 1200);
  } catch (err) {
    console.error(err);
    showToast('Could not reach the server.', 'error');
  }
}

// ── Decline contract ─────────────────────────────────────────

async function declineContract() {
  if (!confirm('Are you sure you want to decline this contract?')) return;

  const contractId = localStorage.getItem('selected_contract_id');
  if (!contractId) {
    showToast('No contract selected.', 'error');
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/contracts/${contractId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'declined' }),
    });

    if (!res.ok) {
      const err = await res.json();
      showToast(err.detail || 'Failed to decline contract.', 'error');
      return;
    }

    showToast('Contract declined.', 'info');
    localStorage.removeItem('selected_contract_id');
    setTimeout(() => { window.location.href = './client-dashboard.html'; }, 1200);
  } catch (err) {
    console.error(err);
    showToast('Could not reach the server.', 'error');
  }
}
