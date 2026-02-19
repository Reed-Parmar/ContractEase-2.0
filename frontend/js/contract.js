// Contract Creation & Signing Handler

const CONTRACT_API = 'http://localhost:8000';

let currentStep = 1;
let selectedContractType = null;
let isDrawing = false;
let lastX = 0;
let lastY = 0;

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
        alert('Please select a contract type');
        return;
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
      if (confirm('Are you sure you want to sign out?')) {
        const role = localStorage.getItem('user_role') || 'user';
        localStorage.clear();
        window.location.href = role === 'client' ? './client-login.html' : './user-login.html';
      }
    });
  }

  // Set today's date for signer
  const signerDate = document.getElementById('signerDate');
  if (signerDate) {
    signerDate.value = new Date().toISOString().split('T')[0];
  }

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
    document.getElementById('previewAmount').textContent = contractAmount.value || '$0';
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

// ── Submit contract (create in backend) ──────────────────────

async function submitContract() {
  const contractTitle = document.getElementById('contractTitle')?.value?.trim();
  const clientEmail = document.getElementById('clientEmail')?.value?.trim();
  const clientName = document.getElementById('clientName')?.value?.trim();
  const contractAmount = document.getElementById('contractAmount')?.value?.trim();
  const dueDate = document.getElementById('dueDate')?.value;
  const contractDescription = document.getElementById('contractDescription')?.value?.trim();

  if (!contractTitle || !clientEmail) {
    alert('Please fill in the contract title and client email.');
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
    alert('You must be logged in to create a contract.');
    window.location.href = './user-login.html';
    return;
  }

  // Look up client by email
  let clientId = null;
  try {
    const lookupRes = await fetch(`${CONTRACT_API}/clients/by-email?email=${encodeURIComponent(clientEmail)}`);
    if (lookupRes.ok) {
      const lookupData = await lookupRes.json();
      clientId = lookupData.user_id;
    }
  } catch (_) { /* ignore */ }

  // If client not found, auto-register them
  if (!clientId) {
    try {
      const regRes = await fetch(`${CONTRACT_API}/register/client`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: clientName || clientEmail.split('@')[0], email: clientEmail, password: 'default123' }),
      });
      if (regRes.ok) {
        const lookupRes2 = await fetch(`${CONTRACT_API}/clients/by-email?email=${encodeURIComponent(clientEmail)}`);
        if (lookupRes2.ok) {
          const lookupData2 = await lookupRes2.json();
          clientId = lookupData2.user_id;
        }
      }
    } catch (_) { /* ignore */ }
  }

  if (!clientId) {
    alert('Could not find or register the client. Please ensure the client has an account.');
    return;
  }

  // Parse amount — strip $ / commas
  const parsedAmount = parseFloat((contractAmount || '0').replace(/[$,]/g, '')) || 0;

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
    const res = await fetch(`${CONTRACT_API}/contracts/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const err = await res.json();
      alert(err.detail || 'Failed to create contract.');
      return;
    }

    const created = await res.json();

    // Also mark it as sent immediately (since the button says "Send to Client")
    await fetch(`${CONTRACT_API}/contracts/${created._id}/send`, { method: 'PUT' });

    alert('Contract sent successfully to ' + clientEmail);
    window.location.href = './user-dashboard.html';
  } catch (err) {
    console.error(err);
    alert('Could not reach the server.');
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
    const res = await fetch(`${CONTRACT_API}/contracts/${contractId}`);
    if (!res.ok) return;
    const c = await res.json();

    // Update page title
    if (editorTitle) editorTitle.textContent = c.title;

    // Update signing status
    const statusContent = document.querySelector('.signing-status-content');
    if (statusContent) {
      const dueStr = c.dueDate ? new Date(c.dueDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : '—';
      statusContent.innerHTML = `<h3>Action Required</h3><p>Please review and sign this contract by ${dueStr}</p>`;
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

    // Update contract info section
    const infoRows = document.querySelectorAll('.form-section:last-of-type .contract-detail-row');
    if (infoRows.length >= 4) {
      infoRows[0].querySelector('.contract-detail-value').textContent = c._id;
      infoRows[1].querySelector('.contract-detail-value').textContent = '—';
      infoRows[2].querySelector('.contract-detail-value').textContent = new Date(c.createdAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
      infoRows[3].querySelector('.contract-detail-value').textContent = c.dueDate ? new Date(c.dueDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : '—';
    }
  } catch (err) {
    console.error('Failed to load contract for signing:', err);
  }
}

// ── Sign contract ────────────────────────────────────────────

async function signContract() {
  const signerName = document.getElementById('signerName')?.value?.trim();
  const signerEmail = document.getElementById('signerEmail')?.value?.trim();
  const agreeTerms = document.getElementById('agreeTerms')?.checked;
  const signatureCanvas = document.getElementById('signatureCanvas');

  if (!signerName || !signerEmail || !agreeTerms) {
    alert('Please fill in all required fields and agree to the terms');
    return;
  }

  if (signatureCanvas) {
    const signatureData = signatureCanvas.toDataURL();
    if (signatureData === 'data:,') {
      alert('Please draw your signature');
      return;
    }
  }

  const contractId = localStorage.getItem('selected_contract_id');
  if (!contractId) {
    alert('No contract selected.');
    return;
  }

  try {
    const res = await fetch(`${CONTRACT_API}/contracts/${contractId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'signed' }),
    });

    if (!res.ok) {
      const err = await res.json();
      alert(err.detail || 'Failed to sign contract.');
      return;
    }

    alert('Contract signed successfully! You will receive a confirmation email shortly.');
    localStorage.removeItem('selected_contract_id');
    window.location.href = './client-dashboard.html';
  } catch (err) {
    console.error(err);
    alert('Could not reach the server.');
  }
}

// ── Decline contract ─────────────────────────────────────────

async function declineContract() {
  if (!confirm('Are you sure you want to decline this contract?')) return;

  const contractId = localStorage.getItem('selected_contract_id');
  if (!contractId) {
    alert('No contract selected.');
    return;
  }

  try {
    const res = await fetch(`${CONTRACT_API}/contracts/${contractId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'declined' }),
    });

    if (!res.ok) {
      const err = await res.json();
      alert(err.detail || 'Failed to decline contract.');
      return;
    }

    alert('Contract declined. The other party has been notified.');
    localStorage.removeItem('selected_contract_id');
    window.location.href = './client-dashboard.html';
  } catch (err) {
    console.error(err);
    alert('Could not reach the server.');
  }
}
