// Contract Creation & Signing Handler
// Requires: config.js (API_BASE, showToast)

let currentStep = 1;
let selectedContractType = null;
let isDrawing = false;
let lastX = 0;
let lastY = 0;
let hasSignatureInk = false;
let selectedContractStatus = null;

document.addEventListener('DOMContentLoaded', () => {
  // ── Contract Type Selection ──────────────────────────────────
  const contractTypeOptions = document.querySelectorAll('.contract-type-option');
  contractTypeOptions.forEach((option) => {
    option.addEventListener('click', () => {
      contractTypeOptions.forEach((opt) => opt.classList.remove('selected'));
      option.classList.add('selected');
      selectedContractType = option.dataset.type;
    });
  });

  // ── Toggle Switches ──────────────────────────────────────────
  const toggleSwitches = document.querySelectorAll('.toggle-switch');
  toggleSwitches.forEach((toggle) => {
    toggle.addEventListener('click', () => {
      toggle.classList.toggle('active');
      if (currentStep === 3) {
        updatePreview();
      }
    });
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
      // Validate Step 2 fields before advancing to Step 3
      if (currentStep === 2) {
        const title = document.getElementById('contractTitle')?.value?.trim();
        const email = document.getElementById('clientEmail')?.value?.trim();
        if (!title) {
          showToast('Please enter a contract title.', 'warning');
          return;
        }
        if (!email) {
          showToast('Please enter the client email address.', 'warning');
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

// ── Clause toggle → preview section mapping ──────────────────

const CLAUSE_PREVIEW_MAP = {
  payment: 'preview-payment',
  liability: 'preview-liability',
  confidentiality: 'preview-confidentiality',
  termination: 'preview-termination',
};

// ── Update preview ───────────────────────────────────────────

function updatePreview() {
  const contractTitle = document.getElementById('contractTitle');
  const clientName = document.getElementById('clientName');
  const contractAmount = document.getElementById('contractAmount');
  const dueDate = document.getElementById('dueDate');

  if (contractTitle) {
    document.getElementById('previewTitle').textContent = contractTitle.value || 'Service Agreement';
  }
  if (clientName) {
    document.getElementById('previewClient').textContent = clientName.value || 'Client';
  }
  if (contractAmount) {
    const raw = parseFloat(contractAmount.value);
    document.getElementById('previewAmount').textContent = isNaN(raw) ? '$0' : '$' + raw.toLocaleString('en-US', { minimumFractionDigits: 0 });
  }
  if (dueDate) {
    const val = dueDate.value;
    document.getElementById('previewDue').textContent = val
      ? new Date(val).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
      : '—';
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

  // Show / hide clause sections based on toggle state
  document.querySelectorAll('.toggle-switch').forEach((toggle) => {
    const sectionId = CLAUSE_PREVIEW_MAP[toggle.dataset.clause];
    if (sectionId) {
      const section = document.getElementById(sectionId);
      if (section) {
        section.style.display = toggle.classList.contains('active') ? '' : 'none';
      }
    }
  });
}

async function loadCreateContractPage() {
  const contractTitleEl = document.getElementById('contractTitle');
  if (!contractTitleEl) return; // Not on the create-contract page

  const mode = localStorage.getItem('contract_page_mode');
  const contractId = localStorage.getItem('selected_contract_id');

  // Clear immediately — next visit to this page must start fresh (new contract)
  localStorage.removeItem('contract_page_mode');
  localStorage.removeItem('selected_contract_id');

  if (!contractId || !mode || (mode !== 'edit' && mode !== 'view')) return;

  try {
    const res = await fetch(`${API_BASE}/contracts/${contractId}`);
    if (!res.ok) return;

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
      toggle.classList.toggle('active', active);
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
    showToast('Please fill in the contract title and client email.', 'warning');
    return;
  }

  // Read clause toggle states
  const clauses = {
    payment: !!document.querySelector('.toggle-switch[data-clause="payment"]')?.classList.contains('active'),
    liability: !!document.querySelector('.toggle-switch[data-clause="liability"]')?.classList.contains('active'),
    confidentiality: !!document.querySelector('.toggle-switch[data-clause="confidentiality"]')?.classList.contains('active'),
    termination: !!document.querySelector('.toggle-switch[data-clause="termination"]')?.classList.contains('active'),
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
    await fetch(`${API_BASE}/contracts/${created._id}/send`, { method: 'PUT' });

    // Clear stale edit/view state so the next "Create New Contract" starts fresh
    localStorage.removeItem('selected_contract_id');
    localStorage.removeItem('contract_page_mode');

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
      let html = `<h2>${c.title}</h2>`;
      html += `<p>This agreement is entered into as of ${new Date(c.createdAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}.</p>`;
      if (c.description) html += `<h2>Description</h2><p>${c.description}</p>`;

      if (c.clauses?.payment) {
        html += `<h2>Payment Terms</h2><p>The total contract value is <strong>$${Number(c.amount).toLocaleString()}</strong>, due by ${c.dueDate ? new Date(c.dueDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : '—'}.</p>`;
      }
      if (c.clauses?.liability) {
        html += `<h2>Limitation of Liability</h2><p>Neither party shall be liable for any indirect, incidental, or consequential damages arising from this agreement.</p>`;
      }
      if (c.clauses?.confidentiality) {
        html += `<h2>Confidentiality</h2><p>Both parties agree to maintain the confidentiality of any proprietary information shared during the course of this engagement.</p>`;
      }
      if (c.clauses?.termination) {
        html += `<h2>Termination</h2><p>Either party may terminate this agreement with written notice. All outstanding obligations must be fulfilled prior to termination.</p>`;
      }

      html += `<h2>Signature</h2><p>By signing below, each party acknowledges that they have read and agree to all terms and conditions.</p>`;
      previewContent.innerHTML = html;
    }

    // Update contract info section (uses stable id added to the HTML)
    const infoRows = document.querySelectorAll('#contractInfoSection .contract-detail-row');
    if (infoRows.length >= 4) {
      infoRows[0].querySelector('.contract-detail-value').textContent = c._id;
      infoRows[1].querySelector('.contract-detail-value').textContent = c.userName || c.userEmail || '—';
      infoRows[2].querySelector('.contract-detail-value').textContent = new Date(c.createdAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
      infoRows[3].querySelector('.contract-detail-value').textContent = c.dueDate ? new Date(c.dueDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : '—';
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

  if (!signerName || !signerEmail || !agreeTerms) {
    showToast('Please fill in all required fields and agree to the terms.', 'warning');
    return;
  }

  if (!canvasContainsDrawing(signatureCanvas)) {
    showToast('Please draw your signature in the box above.', 'warning');
    return;
  }

  const signatureData = signatureCanvas.toDataURL('image/png');

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
