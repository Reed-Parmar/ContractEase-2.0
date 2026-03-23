// Contract Creation & Signing Handler
// Requires: config.js (API_BASE, showToast)

let currentStep = 1;
let selectedContractType = null;
let selectedContractStatus = null;
let creatorSignaturePad = null;
let clientSignaturePad = null;
let creatorSignatureData = '';
let uploadedSignatureBase64 = '';
let creatorUploadedSignatureBase64 = '';
let selectedMode = 'draw';
let creatorSelectedMode = 'draw';

const DEFAULT_CURRENCY = '₹';
const SUPPORTED_CURRENCIES = new Set(['₹', '$', '€']);

// Set to true when the page is opened in edit/view mode to prevent draft caching
let isEditOrViewMode = false;
let currentCreatePageMode = '';
let loadedContractViewState = null;

const DRAFT_STORAGE_KEY = 'contract_wizard_draft';

function el(id) {
  return document.getElementById(id);
}

function isLikelyContractId(value) {
  if (!value) return false;
  return /^[a-f\d]{24}$/i.test(String(value).trim());
}

function getContractIdFromContext() {
  const urlId = new URLSearchParams(window.location.search).get('contractId');
  const storageId = localStorage.getItem('selected_contract_id');
  const resolved = isLikelyContractId(urlId) ? urlId : (isLikelyContractId(storageId) ? storageId : '');
  if (!resolved) return '';

  // Keep legacy localStorage flow working while preferring URL-driven routing.
  localStorage.setItem('selected_contract_id', resolved);
  return resolved;
}

function getContractPageModeFromContext() {
  const modeFromUrl = new URLSearchParams(window.location.search).get('mode');
  if (modeFromUrl === 'edit' || modeFromUrl === 'view') return modeFromUrl;

  const modeFromStorage = localStorage.getItem('contract_page_mode');
  if (modeFromStorage === 'edit' || modeFromStorage === 'view') return modeFromStorage;
  return '';
}

function normalizeContractStatus(status) {
  return String(status || '').trim().toLowerCase();
}

function renderCreateViewStatusBadge(status) {
  const breadcrumb = document.querySelector('.editor-breadcrumb');
  if (!breadcrumb) return;

  const normalizedStatus = normalizeContractStatus(status);
  const knownStatuses = new Set(['draft', 'sent', 'pending', 'signed', 'declined']);
  const displayStatus = knownStatuses.has(normalizedStatus) ? normalizedStatus : 'draft';

  let badge = document.getElementById('contractViewStatusBadge');
  if (!badge) {
    badge = document.createElement('span');
    badge.id = 'contractViewStatusBadge';
    badge.className = 'badge';
    badge.style.marginLeft = 'var(--space-3)';
    badge.style.alignSelf = 'center';
    breadcrumb.appendChild(badge);
  }

  const statusClassMap = {
    draft: 'badge-draft',
    sent: 'badge-warning',
    pending: 'badge-warning',
    signed: 'badge-success',
    declined: 'badge-error',
  };

  badge.className = `badge ${statusClassMap[displayStatus] || 'badge-draft'}`;
  badge.textContent = displayStatus.toUpperCase();
}

async function downloadSignedContract(contractId, buttonEl = null) {
  if (!contractId) {
    showToast('Contract ID is missing for download.', 'error');
    return;
  }

  const userId = localStorage.getItem('user_id');
  if (!userId) {
    showToast('Please sign in again before downloading.', 'error');
    return;
  }

  const originalText = buttonEl ? buttonEl.textContent : '';
  if (buttonEl) {
    buttonEl.disabled = true;
    buttonEl.textContent = 'Downloading...';
  }

  try {
    const anchor = document.createElement('a');
    anchor.href = `${API_BASE}/contracts/${contractId}/download?user_id=${encodeURIComponent(userId)}`;
    anchor.download = `contract_${contractId}.pdf`;
    anchor.style.display = 'none';

    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
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
  ['contractTitle', 'clientName', 'clientEmail', 'contractAmount', 'currency', 'dueDate', 'contractDescription'].forEach((fieldId) => {
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
  const saveDraftBtn = document.getElementById('saveDraftBtn');
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
        const amountEl = document.getElementById('contractAmount');
        const dueDateEl = document.getElementById('dueDate');
        [titleEl, emailEl, amountEl, dueDateEl].forEach((el) => { if (el) clearFieldError(el); });

        const fieldErrors = [];
        if (titleEl && !titleEl.value.trim()) fieldErrors.push({ el: titleEl, msg: 'Contract title is required.' });
        if (emailEl && !emailEl.value.trim()) fieldErrors.push({ el: emailEl, msg: 'Client email address is required.' });
        if (amountEl && !amountEl.value.trim()) fieldErrors.push({ el: amountEl, msg: 'Contract amount is required.' });
        if (dueDateEl && !dueDateEl.value.trim()) fieldErrors.push({ el: dueDateEl, msg: 'Due date is required.' });

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
      submitContract(true);
    });
  }

  if (saveDraftBtn) {
    saveDraftBtn.addEventListener('click', () => {
      submitContract(false);
    });
  }
  // ── Cancel Draft ────────────────────────────────────────────────────
  const cancelDraftBtn = document.getElementById('cancelDraftBtn');
  if (cancelDraftBtn) {
    cancelDraftBtn.addEventListener('click', () => {
      if (cancelDraftBtn.dataset.action === 'download') {
        const contractId = getContractIdFromContext();
        downloadSignedContract(contractId, cancelDraftBtn);
        return;
      }
      // Only wipe the draft when genuinely cancelling a new contract creation
      if (!isEditOrViewMode) clearDraft();
      window.location.href = './user-dashboard.html';
    });
  }
  clientSignaturePad = setupSignaturePad('signatureCanvas');

  // Clear Signature
  const clearCreatorSignatureBtn = document.getElementById('clearCreatorSignatureBtn');
  if (clearCreatorSignatureBtn) {
    clearCreatorSignatureBtn.addEventListener('click', () => {
      const creatorPad = ensureCreatorSignaturePad();
      if (creatorPad) {
        creatorPad.clear();
      }
      creatorSignatureData = '';
      updatePreview();
    });
  }

  const clearSignatureBtn = document.getElementById('clearSignatureBtn');
  if (clearSignatureBtn) {
    clearSignatureBtn.addEventListener('click', () => {
      if (clientSignaturePad) {
        clientSignaturePad.clear();
      }
    });
  }

  // Setup signature UI modes (draw/upload/type)
  setupSignatureInput();
  setupCreatorSignatureInput();

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
  const mobileMenuToggle = document.getElementById('mobileMenuBtn');
  const navbarMenu = document.getElementById('navbarMenu');
  if (mobileMenuToggle && navbarMenu) {
    mobileMenuToggle.addEventListener('click', () => {
      navbarMenu.classList.toggle('active');
      const isActive = navbarMenu.classList.contains('active');
      mobileMenuToggle.setAttribute('aria-expanded', isActive ? 'true' : 'false');
      navbarMenu.setAttribute('aria-hidden', isActive ? 'false' : 'true');
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
  const saveDraftBtn = document.getElementById('saveDraftBtn');
  const submitBtn = document.getElementById('submitBtn');

  if (prevBtn) prevBtn.style.display = step > 1 ? 'inline-flex' : 'none';
  if (nextBtn) nextBtn.style.display = step < 3 ? 'inline-flex' : 'none';
  if (saveDraftBtn) saveDraftBtn.style.display = step === 2 ? 'inline-flex' : 'none';
  if (submitBtn) submitBtn.style.display = step === 3 ? 'inline-flex' : 'none';

  currentStep = step;

  if (step === 3) {
    ensureCreatorSignaturePad();
    updatePreview();
  }
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
    currency: document.getElementById('currency')?.value || DEFAULT_CURRENCY,
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
    ['contractTitle', 'clientName', 'clientEmail', 'contractAmount', 'currency', 'dueDate', 'contractDescription'].forEach((id) => {
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

function setupSignaturePad(canvasId, onChange = null) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return null;

  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  const cssWidth = rect.width || canvas.offsetWidth || 600;
  const cssHeight = rect.height || canvas.offsetHeight || 250;

  canvas.width = cssWidth * dpr;
  canvas.height = cssHeight * dpr;
  ctx.scale(dpr, dpr);

  let isDrawingLocal = false;
  let lastXLocal = 0;
  let lastYLocal = 0;
  let hasInkLocal = false;

  const notifyChange = () => {
    if (typeof onChange === 'function') {
      onChange();
    }
  };

  const drawLine = (x, y) => {
    hasInkLocal = true;
    ctx.strokeStyle = '#1f2937';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(lastXLocal, lastYLocal);
    ctx.lineTo(x, y);
    ctx.stroke();
    lastXLocal = x;
    lastYLocal = y;
  };

  const startDrawing = (x, y) => {
    isDrawingLocal = true;
    lastXLocal = x;
    lastYLocal = y;
  };

  const stopDrawing = () => {
    if (!isDrawingLocal) return;
    isDrawingLocal = false;
    notifyChange();
  };

  canvas.addEventListener('mousedown', (event) => {
    const canvasRect = canvas.getBoundingClientRect();
    startDrawing(event.clientX - canvasRect.left, event.clientY - canvasRect.top);
  });

  canvas.addEventListener('mousemove', (event) => {
    if (!isDrawingLocal) return;
    const canvasRect = canvas.getBoundingClientRect();
    drawLine(event.clientX - canvasRect.left, event.clientY - canvasRect.top);
  });

  canvas.addEventListener('mouseup', stopDrawing);
  canvas.addEventListener('mouseleave', stopDrawing);

  canvas.addEventListener('touchstart', (event) => {
    event.preventDefault();
    const canvasRect = canvas.getBoundingClientRect();
    const touch = event.touches[0];
    startDrawing(touch.clientX - canvasRect.left, touch.clientY - canvasRect.top);
  });

  canvas.addEventListener('touchmove', (event) => {
    event.preventDefault();
    if (!isDrawingLocal) return;
    const canvasRect = canvas.getBoundingClientRect();
    const touch = event.touches[0];
    drawLine(touch.clientX - canvasRect.left, touch.clientY - canvasRect.top);
  });

  canvas.addEventListener('touchend', stopDrawing);

  return {
    canvas,
    clear() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      hasInkLocal = false;
      notifyChange();
    },
    hasDrawing() {
      if (hasInkLocal) return true;

      const pixelData = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      for (let index = 3; index < pixelData.length; index += 4) {
        if (pixelData[index] !== 0) {
          return true;
        }
      }

      return false;
    },
    toDataURL() {
      return canvas.toDataURL('image/png');
    },
  };
}

// ────────────────────────────────────────────────────────────────────
// Signature Upload Handler (NEW)
// ────────────────────────────────────────────────────────────────────
const TRANSPARENT_PIXEL_DATA_URI = 'data:image/gif;base64,R0lGODlhAQABAAAAACwAAAAAAQABAAA=';

/**
 * Validate file is PNG or JPG and under 2MB
 */
function validateSignatureFile(file) {
  const validTypes = ['image/png', 'image/jpeg'];
  if (!validTypes.includes(file.type)) {
    return { valid: false, error: 'Please upload PNG or JPG image' };
  }
  
  const maxSizeMB = 2;
  const maxSizeBytes = maxSizeMB * 1024 * 1024;
  if (file.size > maxSizeBytes) {
    return { valid: false, error: `Image too large (max ${maxSizeMB}MB, your file is ${(file.size / 1024 / 1024).toFixed(1)}MB)` };
  }
  
  return { valid: true };
}

/**
 * Handle file upload and convert to Base64
 */
function handleSignatureFileUpload(file) {
  const validation = validateSignatureFile(file);
  if (!validation.valid) {
    showSignatureUploadError(validation.error);
    clearSignatureUpload();
    return;
  }

  const reader = new FileReader();
  
  reader.onerror = () => {
    showSignatureUploadError('Failed to read image file. Please try again.');
    clearSignatureUpload();
  };
  
  reader.onload = (event) => {
    const base64String = event.target.result;
    
    // Validate base64 string
    if (!base64String || base64String.length < 50) {
      showSignatureUploadError('Failed to process image. The file may be corrupted.');
      clearSignatureUpload();
      return;
    }
    
    uploadedSignatureBase64 = base64String;
    displaySignaturePreview(base64String);
    hideSignatureUploadError();
  };
  
  reader.readAsDataURL(file);
}

/**
 * Display uploaded image preview
 */
function displaySignaturePreview(base64String) {
  const previewContainer = el('signaturePreviewContainer');
  const previewImage = el('signaturePreviewImage');
  
  if (previewContainer && previewImage) {
    previewImage.src = base64String || TRANSPARENT_PIXEL_DATA_URI;
    previewContainer.style.display = 'block';
  }
}

/**
 * Clear uploaded signature and hide preview
 */
function clearSignatureUpload() {
  uploadedSignatureBase64 = '';
  
  const previewContainer = el('signaturePreviewContainer');
  const previewImage = el('signaturePreviewImage');
  const fileInput = el('signatureFileInput');
  const fileChooseBtn = el('signatureFileChooseBtn');
  
  if (previewContainer) {
    previewContainer.style.display = 'none';
  }

  if (previewImage) {
    previewImage.src = TRANSPARENT_PIXEL_DATA_URI;
  }
  
  if (fileInput) {
    fileInput.value = '';
  }
  
  if (fileChooseBtn) {
    fileChooseBtn.textContent = 'Click or drag image to upload';
  }
  
  hideSignatureUploadError();
}

/**
 * Show upload error message
 */
function showSignatureUploadError(message) {
  const errorEl = el('signatureUploadError');
  if (errorEl) {
    errorEl.textContent = message;
    errorEl.style.display = 'block';
  }
}

/**
 * Hide upload error message
 */
function hideSignatureUploadError() {
  const errorEl = el('signatureUploadError');
  if (errorEl) {
    errorEl.style.display = 'none';
  }
}

/**
 * Setup signature method toggle and file upload handlers
 */
function applySignatureModeUI({ cards, sectionsByMode, hiddenField }, mode) {
  if (hiddenField) hiddenField.value = mode;

  cards.forEach((card) => {
    const cardMode = card.dataset.mode;
    if (cardMode === mode) {
      card.classList.add('signature-card-active');
    } else {
      card.classList.remove('signature-card-active');
    }
  });

  Object.entries(sectionsByMode).forEach(([key, section]) => {
    if (!section) return;
    const isActive = key === mode;
    section.classList.toggle('signature-section-active', isActive);
    section.hidden = !isActive;
    section.setAttribute('aria-hidden', isActive ? 'false' : 'true');
    section.querySelectorAll('input, textarea, select, button').forEach((node) => {
      node.disabled = !isActive;
    });

    const canvas = section.querySelector('canvas');
    if (canvas) {
      canvas.style.pointerEvents = isActive ? 'auto' : 'none';
    }
  });
}

function resetTypedSignatureInput(inputEl, previewEl) {
  if (inputEl) inputEl.value = '';
  if (previewEl) previewEl.textContent = 'Signature preview appears here';
}

function clearClientSignatureState({ typedInput, typedPreview }) {
  if (clientSignaturePad) {
    clientSignaturePad.clear();
  }
  clearSignatureUpload();
  resetTypedSignatureInput(typedInput, typedPreview);
}

function clearCreatorSignatureState({ typedInput, typedPreview }) {
  const creatorPad = ensureCreatorSignaturePad();
  if (creatorPad) {
    creatorPad.clear();
  }
  clearCreatorSignatureUpload();
  resetTypedSignatureInput(typedInput, typedPreview);
  creatorSignatureData = '';
}

function setupSignatureInput() {
  const signatureMethodRadios = document.querySelectorAll('.signature-method-radio');
  const modeCards = document.querySelectorAll('#clientSignatureModeGrid .signature-mode-card');
  const drawWrapper = el('drawSignatureWrapper');
  const uploadWrapper = el('uploadSignatureWrapper');
  const typedWrapper = el('typedSignatureWrapper');
  const fileInput = el('signatureFileInput');
  const fileChooseBtn = el('signatureFileChooseBtn');
  const replaceBtn = el('replaceSignatureBtn');
  const removeBtn = el('removeSignatureBtn');
  const signatureTypeFlag = el('signatureTypeFlag');
  const typedInput = el('typedSignatureInput');
  const typedPreview = el('typedSignaturePreview');

  const setClientMode = (mode, options = {}) => {
    const normalizedMode = mode === 'upload' || mode === 'type' ? mode : 'draw';
    const shouldReset = options.resetOnChange !== false;
    const modeChanged = selectedMode !== normalizedMode;

    if (shouldReset && modeChanged) {
      clearClientSignatureState({ typedInput, typedPreview });
    }

    selectedMode = normalizedMode;

    signatureMethodRadios.forEach((radio) => {
      radio.checked = radio.value === normalizedMode;
    });

    applySignatureModeUI({
      cards: Array.from(modeCards),
      sectionsByMode: {
        draw: drawWrapper,
        upload: uploadWrapper,
        type: typedWrapper,
      },
      hiddenField: signatureTypeFlag,
    }, normalizedMode);
  };
  
  if (!signatureMethodRadios.length) return;

  // Handle mode selection via hidden radios
  signatureMethodRadios.forEach((radio) => {
    radio.addEventListener('change', (event) => {
      const method = event.target.value;
      setClientMode(method);
    });
  });

  // Click + keyboard access for card-style controls
  modeCards.forEach((card) => {
    const mode = card.dataset.mode;
    const radio = card.querySelector('input[type="radio"]');
    if (!mode || !radio) return;

    card.addEventListener('click', () => {
      radio.checked = true;
      setClientMode(mode);
    });

    card.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        radio.checked = true;
        setClientMode(mode);
      }
    });
  });

  // File input button click handler
  if (fileChooseBtn) {
    fileChooseBtn.addEventListener('click', (event) => {
      event.preventDefault();
      if (fileInput) fileInput.click();
    });

    fileChooseBtn.addEventListener('dragover', (event) => {
      event.preventDefault();
      fileChooseBtn.style.borderColor = 'var(--primary)';
    });

    fileChooseBtn.addEventListener('dragleave', () => {
      fileChooseBtn.style.borderColor = '';
    });

    fileChooseBtn.addEventListener('drop', (event) => {
      event.preventDefault();
      fileChooseBtn.style.borderColor = '';
      const file = event.dataTransfer?.files?.[0];
      if (file) handleSignatureFileUpload(file);
    });
  }

  // File selection handler
  if (fileInput) {
    fileInput.addEventListener('change', (event) => {
      const files = event.target.files;
      if (files && files.length > 0) {
        const file = files[0];
        handleSignatureFileUpload(file);
        
        // Update button text
        if (fileChooseBtn) {
          fileChooseBtn.textContent = file.name;
        }
      }
    });
  }

  // Replace button handler
  if (replaceBtn) {
    replaceBtn.addEventListener('click', (event) => {
      event.preventDefault();
      if (fileInput) fileInput.click();
    });
  }

  // Remove button handler
  if (removeBtn) {
    removeBtn.addEventListener('click', (event) => {
      event.preventDefault();
      clearSignatureUpload();
    });
  }

  // Live typed preview
  if (typedInput && typedPreview) {
    typedInput.addEventListener('input', () => {
      typedPreview.textContent = typedInput.value.trim() || 'Signature preview appears here';
    });
    typedPreview.textContent = 'Signature preview appears here';
  }

  setClientMode(signatureTypeFlag?.value || selectedMode, { resetOnChange: false });
}

function displayCreatorSignaturePreview(base64String) {
  const previewContainer = el('creatorSignaturePreviewContainer');
  const previewImage = el('creatorSignaturePreviewImage');

  if (previewContainer && previewImage) {
    previewImage.src = base64String;
    previewContainer.style.display = 'block';
  }
}

function clearCreatorSignatureUpload() {
  creatorUploadedSignatureBase64 = '';

  const previewContainer = el('creatorSignaturePreviewContainer');
  const fileInput = el('creatorSignatureFileInput');
  const fileChooseBtn = el('creatorSignatureFileChooseBtn');

  if (previewContainer) previewContainer.style.display = 'none';
  if (fileInput) fileInput.value = '';
  if (fileChooseBtn) fileChooseBtn.textContent = 'Click or drag image to upload';
  hideCreatorSignatureUploadError();
}

function showCreatorSignatureUploadError(message) {
  const errorEl = el('creatorSignatureUploadError');
  if (errorEl) {
    errorEl.textContent = message;
    errorEl.style.display = 'block';
  }
}

function hideCreatorSignatureUploadError() {
  const errorEl = el('creatorSignatureUploadError');
  if (errorEl) errorEl.style.display = 'none';
}

function handleCreatorSignatureFileUpload(file) {
  const validation = validateSignatureFile(file);
  if (!validation.valid) {
    showCreatorSignatureUploadError(validation.error);
    clearCreatorSignatureUpload();
    return;
  }

  const reader = new FileReader();
  reader.onerror = () => {
    showCreatorSignatureUploadError('Failed to read image file. Please try again.');
    clearCreatorSignatureUpload();
  };

  reader.onload = (event) => {
    const base64String = event.target.result;
    if (!base64String || base64String.length < 50) {
      showCreatorSignatureUploadError('Failed to process image. The file may be corrupted.');
      clearCreatorSignatureUpload();
      return;
    }

    creatorUploadedSignatureBase64 = base64String;
    creatorSignatureData = base64String;
    displayCreatorSignaturePreview(base64String);
    hideCreatorSignatureUploadError();
    updatePreview();
  };

  reader.readAsDataURL(file);
}

function setupCreatorSignatureInput() {
  const signatureMethodRadios = document.querySelectorAll('.creator-signature-method-radio');
  const modeCards = document.querySelectorAll('#creatorSignatureModeGrid .signature-mode-card');
  const drawWrapper = el('creatorDrawSignatureWrapper');
  const uploadWrapper = el('creatorUploadSignatureWrapper');
  const typedWrapper = el('creatorTypedSignatureWrapper');
  const signatureTypeFlag = el('creatorSignatureTypeFlag');

  const fileInput = el('creatorSignatureFileInput');
  const fileChooseBtn = el('creatorSignatureFileChooseBtn');
  const replaceBtn = el('replaceCreatorSignatureBtn');
  const removeBtn = el('removeCreatorSignatureBtn');
  const typedInput = el('creatorTypedSignatureInput');
  const typedPreview = el('creatorTypedSignaturePreview');

  if (!signatureMethodRadios.length) return;

  const setCreatorMode = (mode, options = {}) => {
    const normalizedMode = mode === 'upload' || mode === 'type' ? mode : 'draw';
    const shouldReset = options.resetOnChange !== false;
    const modeChanged = creatorSelectedMode !== normalizedMode;

    if (shouldReset && modeChanged) {
      clearCreatorSignatureState({ typedInput, typedPreview });
    }

    creatorSelectedMode = normalizedMode;

    signatureMethodRadios.forEach((radio) => {
      radio.checked = radio.value === normalizedMode;
    });

    applySignatureModeUI({
      cards: Array.from(modeCards),
      sectionsByMode: {
        draw: drawWrapper,
        upload: uploadWrapper,
        type: typedWrapper,
      },
      hiddenField: signatureTypeFlag,
    }, normalizedMode);

    updatePreview();
  };

  signatureMethodRadios.forEach((radio) => {
    radio.addEventListener('change', (event) => {
      setCreatorMode(event.target.value);
    });
  });

  modeCards.forEach((card) => {
    const mode = card.dataset.mode;
    const radio = card.querySelector('input[type="radio"]');
    if (!mode || !radio) return;

    card.addEventListener('click', () => {
      radio.checked = true;
      setCreatorMode(mode);
    });

    card.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        radio.checked = true;
        setCreatorMode(mode);
      }
    });
  });

  if (fileChooseBtn) {
    fileChooseBtn.addEventListener('click', (event) => {
      event.preventDefault();
      if (fileInput) fileInput.click();
    });

    fileChooseBtn.addEventListener('dragover', (event) => {
      event.preventDefault();
      fileChooseBtn.style.borderColor = 'var(--primary)';
    });

    fileChooseBtn.addEventListener('dragleave', () => {
      fileChooseBtn.style.borderColor = '';
    });

    fileChooseBtn.addEventListener('drop', (event) => {
      event.preventDefault();
      fileChooseBtn.style.borderColor = '';
      const file = event.dataTransfer?.files?.[0];
      if (file) handleCreatorSignatureFileUpload(file);
    });
  }

  if (fileInput) {
    fileInput.addEventListener('change', (event) => {
      const files = event.target.files;
      if (files && files.length > 0) {
        const file = files[0];
        handleCreatorSignatureFileUpload(file);
        if (fileChooseBtn) fileChooseBtn.textContent = file.name;
      }
    });
  }

  if (replaceBtn) {
    replaceBtn.addEventListener('click', (event) => {
      event.preventDefault();
      if (fileInput) fileInput.click();
    });
  }

  if (removeBtn) {
    removeBtn.addEventListener('click', (event) => {
      event.preventDefault();
      clearCreatorSignatureUpload();
      creatorSignatureData = '';
      updatePreview();
    });
  }

  if (typedInput && typedPreview) {
    typedInput.addEventListener('input', () => {
      typedPreview.textContent = typedInput.value.trim() || 'Signature preview appears here';
      updatePreview();
    });
    typedPreview.textContent = 'Signature preview appears here';
  }

  setCreatorMode(signatureTypeFlag?.value || creatorSelectedMode, { resetOnChange: false });
}

/**
 * Get current signature data and type
 * Returns: { data: "<base64_string>", type: "draw" | "upload" | "type" }
 */
function getCurrentSignatureData() {
  if (selectedMode === 'draw') {
    const signatureData = signaturePadContainsDrawing(clientSignaturePad) ? clientSignaturePad.toDataURL() : '';
    return {
      data: signatureData,
      type: 'drawn'
    };
  } else if (selectedMode === 'upload') {
    return {
      data: uploadedSignatureBase64,
      type: 'uploaded'
    };
  } else if (selectedMode === 'type') {
    const typedSignature = el('typedSignatureInput')?.value?.trim() || '';
    if (!typedSignature) return { data: '', type: 'typed' };
    return {
      data: renderTypedSignatureToDataUrl(typedSignature),
      type: 'typed'
    };
  }

  return { data: '', type: 'unknown' };
}

function ensureCreatorSignaturePad() {
  if (!creatorSignaturePad) {
    creatorSignaturePad = setupSignaturePad('creatorSignatureCanvas', () => {
      creatorSignatureData = creatorSignaturePad?.hasDrawing() ? creatorSignaturePad.toDataURL() : '';
      updatePreview();
    });
  }

  return creatorSignaturePad;
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

function normalizeCurrencySymbol(value, fallback = DEFAULT_CURRENCY) {
  return SUPPORTED_CURRENCIES.has(value) ? value : fallback;
}

function getSelectedCurrency(fallback = DEFAULT_CURRENCY) {
  return normalizeCurrencySymbol(document.getElementById('currency')?.value, fallback);
}

function parseContractDate(value) {
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

function renderTypedSignatureToDataUrl(typedSignature) {
  const text = String(typedSignature || '').trim();
  if (!text) return '';

  const textCanvas = document.createElement('canvas');
  textCanvas.width = 400;
  textCanvas.height = 150;

  const tCtx = textCanvas.getContext('2d');
  tCtx.fillStyle = '#ffffff';
  tCtx.fillRect(0, 0, textCanvas.width, textCanvas.height);

  const padding = 24;
  const maxWidth = textCanvas.width - (padding * 2);
  const maxHeight = textCanvas.height - (padding * 2);
  const maxLines = 2;
  let fontSize = 48;
  const minFontSize = 20;
  const fontFamily = 'serif';

  const splitIntoLines = (value) => {
    const words = value.split(/\s+/).filter(Boolean);
    if (words.length === 0) return [''];

    const lines = [];
    let currentLine = words[0];
    for (let index = 1; index < words.length; index += 1) {
      const candidate = `${currentLine} ${words[index]}`;
      if (tCtx.measureText(candidate).width <= maxWidth) {
        currentLine = candidate;
      } else {
        lines.push(currentLine);
        currentLine = words[index];
      }
    }
    lines.push(currentLine);
    return lines;
  };

  let lines = [text];
  while (fontSize >= minFontSize) {
    tCtx.font = `italic ${fontSize}px ${fontFamily}`;
    lines = splitIntoLines(text);
    const lineHeight = Math.round(fontSize * 1.15);
    const totalHeight = lines.length * lineHeight;
    const longestLine = Math.max(...lines.map((line) => tCtx.measureText(line).width));

    if (lines.length <= maxLines && longestLine <= maxWidth && totalHeight <= maxHeight) {
      break;
    }

    fontSize -= 2;
  }

  if (fontSize < minFontSize) {
    fontSize = minFontSize;
    tCtx.font = `italic ${fontSize}px ${fontFamily}`;
    lines = splitIntoLines(text).slice(0, maxLines);

    while (lines.length > 0 && tCtx.measureText(lines[lines.length - 1]).width > maxWidth) {
      let lastLine = lines[lines.length - 1];
      while (lastLine.length > 1 && tCtx.measureText(`${lastLine}...`).width > maxWidth) {
        lastLine = lastLine.slice(0, -1);
      }
      lines[lines.length - 1] = `${lastLine}...`;
      if (tCtx.measureText(lines[lines.length - 1]).width <= maxWidth) break;
    }
  }

  const lineHeight = Math.round(fontSize * 1.15);
  const totalHeight = lines.length * lineHeight;

  tCtx.font = `italic ${fontSize}px ${fontFamily}`;
  tCtx.fillStyle = '#1f2937';
  tCtx.textAlign = 'center';
  tCtx.textBaseline = 'middle';

  const startY = (textCanvas.height - totalHeight) / 2 + (lineHeight / 2);
  lines.forEach((line, index) => {
    tCtx.fillText(line, textCanvas.width / 2, startY + (index * lineHeight));
  });

  return textCanvas.toDataURL('image/png');
}

function getCreatorSignatureValue() {
  const mode = creatorSelectedMode;

  if (mode === 'draw') {
    if (signaturePadContainsDrawing(creatorSignaturePad)) {
      return creatorSignaturePad.toDataURL();
    }
    return '';
  }

  if (mode === 'upload') {
    return creatorUploadedSignatureBase64 || '';
  }

  if (mode === 'type') {
    const typedSignature = el('creatorTypedSignatureInput')?.value?.trim() || '';
    if (!typedSignature) return '';
    return renderTypedSignatureToDataUrl(typedSignature);
  }

  return '';
}

function formatContractAmount(value, currency = DEFAULT_CURRENCY, fallbackCurrency = DEFAULT_CURRENCY) {
  const numeric = Number(value);
  const symbol = normalizeCurrencySymbol(currency, fallbackCurrency);
  if (!Number.isFinite(numeric)) return `${symbol}0.00`;
  return `${symbol}${numeric.toFixed(2)}`;
}

function formatContractDate(value) {
  const dateValue = parseContractDate(value);
  return dateValue ? dateValue.toLocaleDateString('en-GB') : '—';
}

function buildPreviewSignatureBlock(label, name, signatureData, placeholderText) {
  return `
    <div class="preview-signature-block">
      <p class="preview-signature-label">${escapeHtml(label)}</p>
      ${signatureData
        ? `<img class="preview-signature-image" src="${escapeHtml(signatureData)}" alt="${escapeHtml(label)}">`
        : `<p class="preview-signature-placeholder">${escapeHtml(placeholderText)}</p>`}
      <p class="preview-signature-name">${escapeHtml(name || label)}</p>
    </div>`;
}

function buildPreviewSignatureGrid({ creatorName, clientName, creatorSignature, clientSignature }) {
  return `
    <div class="preview-signature-grid">
      ${buildPreviewSignatureBlock('Creator Signature', creatorName, creatorSignature, 'Pending creator signature')}
      ${buildPreviewSignatureBlock('Client Signature', clientName, clientSignature, 'Pending client signature')}
    </div>`;
}

function buildContractSectionCopy(details) {
  const title = String(details.title || 'this agreement').trim() || 'this agreement';
  const description = String(details.description || '').trim();
  const clauses = details.clauses || {};
  const amountText = formatContractAmount(details.amount, details.currency, DEFAULT_CURRENCY);
  const dueText = formatContractDate(details.dueDate);
  const hasCreatorSignature = Boolean(String(details.creatorSignature || '').trim());
  const hasClientSignature = Boolean(String(details.clientSignature || '').trim());
  const status = normalizeContractStatus(details.status);

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
    signatures: status === 'signed' || hasClientSignature
      ? 'This agreement has been fully executed. Both creator and client signatures are recorded below.'
      : hasCreatorSignature
        ? 'The creator signature below authorizes this document for client review. The client signature will be added once the agreement is accepted.'
        : 'By electronically signing below, the parties acknowledge that they have read, understood, and agreed to be bound by all terms and conditions set forth within this document.',
  };
}

// ── Update preview ───────────────────────────────────────────

function updatePreview() {
  const contractTitle = document.getElementById('contractTitle');
  const clientName = document.getElementById('clientName');
  const contractAmount = document.getElementById('contractAmount');
  const currency = document.getElementById('currency');
  const dueDate = document.getElementById('dueDate');
  const contractDescription = document.getElementById('contractDescription');
  const isViewMode = currentCreatePageMode === 'view';
  const creatorSignature = isViewMode
    ? (loadedContractViewState?.creatorSignature || getCreatorSignatureValue())
    : getCreatorSignatureValue();
  const clientSignature = isViewMode ? (loadedContractViewState?.clientSignature || '') : '';

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
    currency: currency?.value,
    dueDate: dueDate?.value,
    clauses,
    creatorSignature,
    clientSignature,
    status: isViewMode ? loadedContractViewState?.status : 'draft',
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
    previewDate.textContent = formatContractDate(today.toISOString());
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

  const previewSignatureVisuals = document.getElementById('previewSignatureVisuals');
  if (previewSignatureVisuals) {
    previewSignatureVisuals.innerHTML = buildPreviewSignatureGrid({
      creatorName: (isViewMode ? loadedContractViewState?.creatorName : '') || localStorage.getItem('user_name') || localStorage.getItem('user_email') || 'Creator',
      clientName: (isViewMode ? loadedContractViewState?.clientName : '') || clientName?.value || 'Client',
      creatorSignature,
      clientSignature,
    });
  }
}

function setCreateFormReadOnly() {
  const editorRoot = document.querySelector('.contract-editor');
  if (!editorRoot) return;

  editorRoot.querySelectorAll('input, textarea, select').forEach((node) => {
    node.disabled = true;
  });

  editorRoot.querySelectorAll('.contract-type-option').forEach((node) => {
    node.style.pointerEvents = 'none';
    node.setAttribute('aria-disabled', 'true');
  });
}

async function loadCreateContractPage() {
  const contractTitleEl = document.getElementById('contractTitle');
  if (!contractTitleEl) return; // Not on the create-contract page

  const mode = getContractPageModeFromContext();
  const contractId = getContractIdFromContext();
  currentCreatePageMode = mode;

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

  if (!contractId) {
    isEditOrViewMode = false;
    showToast('Contract reference is missing. Please open the contract again from the dashboard.', 'error');
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

    loadedContractViewState = {
      status: normalizeContractStatus(c.status),
      creatorSignature: c.signatures?.creator || '',
      clientSignature: c.signatures?.client || '',
      creatorName: c.userName || c.userEmail || '',
      clientName: c.clientName || c.clientEmail || '',
    };

    contractTitleEl.value = c.title || '';

    const clientNameEl = document.getElementById('clientName');
    if (clientNameEl) clientNameEl.value = c.clientName || '';

    const clientEmailEl = document.getElementById('clientEmail');
    if (clientEmailEl) clientEmailEl.value = c.clientEmail || '';

    const contractAmountEl = document.getElementById('contractAmount');
    if (contractAmountEl) contractAmountEl.value = c.amount != null ? String(c.amount) : '';

    const currencyEl = document.getElementById('currency');
    if (currencyEl) {
      currencyEl.value = normalizeCurrencySymbol(c.currency, DEFAULT_CURRENCY);
    }

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

    creatorSignatureData = c.signatures?.creator || '';

    if (mode === 'view') {
      // View mode: jump to Step 3 (preview), hide all navigation so form is read-only
      renderCreateViewStatusBadge(c.status);
      updatePreview();
      goToStep(3);
      setCreateFormReadOnly();
      const isSignedView = normalizeContractStatus(c.status) === 'signed';

      const creatorSignaturePanel = document.querySelector('.creator-signature-panel');
      if (creatorSignaturePanel) {
        creatorSignaturePanel.style.display = isSignedView ? 'none' : 'block';
      }

      const signedDetailsEl = document.getElementById('signedDetailsSection');
      if (signedDetailsEl) {
        signedDetailsEl.style.display = isSignedView ? 'block' : 'none';
      }

      const prevBtn = document.getElementById('prevBtn');
      const nextBtn = document.getElementById('nextBtn');
      const saveDraftBtn = document.getElementById('saveDraftBtn');
      const submitBtn = document.getElementById('submitBtn');
      const cancelDraftBtn = document.getElementById('cancelDraftBtn');
      if (prevBtn) prevBtn.style.display = 'none';
      if (nextBtn) nextBtn.style.display = 'none';
      if (saveDraftBtn) saveDraftBtn.style.display = 'none';
      if (submitBtn) submitBtn.style.display = 'none';

      if (cancelDraftBtn) {
        cancelDraftBtn.dataset.action = isSignedView ? 'download' : 'cancel';
        cancelDraftBtn.textContent = isSignedView ? 'Download Contract' : 'Cancel Draft';
        cancelDraftBtn.classList.toggle('btn-outline-danger', !isSignedView);
        cancelDraftBtn.classList.toggle('btn-outline', isSignedView);
      }

      if (isSignedView) {
        await populateSignedExecutionDetails(contractId);
      }

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

async function submitContract(sendForSignature = true) {
  const contractTitle = document.getElementById('contractTitle')?.value?.trim();
  const clientEmail = document.getElementById('clientEmail')?.value?.trim();
  const contractAmount = document.getElementById('contractAmount')?.value?.trim();
  const currency = getSelectedCurrency();
  const dueDate = document.getElementById('dueDate')?.value;
  const contractDescription = document.getElementById('contractDescription')?.value?.trim();
  const creatorSignature = getCreatorSignatureValue();

  if (!contractTitle || !clientEmail || !contractAmount || !dueDate) {
    // Highlight the specific fields that are missing so the user knows exactly what to fix
    const titleEl = document.getElementById('contractTitle');
    const emailEl = document.getElementById('clientEmail');
    const amountEl = document.getElementById('contractAmount');
    const dueDateEl = document.getElementById('dueDate');
    if (titleEl) clearFieldError(titleEl);
    if (emailEl) clearFieldError(emailEl);
    if (amountEl) clearFieldError(amountEl);
    if (dueDateEl) clearFieldError(dueDateEl);
    if (!contractTitle && titleEl) setFieldError(titleEl, 'Contract title is required.');
    if (!clientEmail && emailEl) setFieldError(emailEl, 'Client email address is required.');
    if (!contractAmount && amountEl) setFieldError(amountEl, 'Contract amount is required.');
    if (!dueDate && dueDateEl) setFieldError(dueDateEl, 'Due date is required.');
    showToast('Please fill in all required fields.', 'warning');
    return;
  }

  if (sendForSignature && !creatorSignature) {
    showToast('Please sign the contract before sending.', 'warning');
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
      const clientNameEl = document.getElementById('clientName');
      if (clientNameEl) clientNameEl.value = lookupData.name || '';
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
        const clientNameEl = document.getElementById('clientName');
        if (clientNameEl) clientNameEl.value = autoData.name || derivedName;
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
  const parsedDueDate = parseContractDate(dueDate);
  if (!parsedDueDate) {
    showToast('Please provide a valid due date.', 'warning');
    return;
  }

  const payload = {
    title: contractTitle,
    type: selectedContractType || 'custom',
    description: contractDescription || '',
    amount: parsedAmount,
    currency,
    dueDate: parsedDueDate.toISOString(),
    clauses: clauses,
    userId: userId,
    clientId: clientId,
    creator_signature: creatorSignature || null,
  };

  const editingContractId =
    isEditOrViewMode && currentCreatePageMode === 'edit' ? getContractIdFromContext() : '';
  const isEditingContract = isLikelyContractId(editingContractId);

  try {
    const endpoint = isEditingContract
      ? `${API_BASE}/contracts/${editingContractId}?user_id=${encodeURIComponent(userId)}`
      : `${API_BASE}/contracts/`;
    const method = isEditingContract ? 'PATCH' : 'POST';

    const res = await fetch(endpoint, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const err = await res.json();
      showToast(err.detail || 'Failed to create contract.', 'error');
      return;
    }

    const created = await res.json();
    const targetContractId = created?._id;
    if (!isLikelyContractId(targetContractId)) {
      showToast('Contract response is missing a valid ID.', 'error');
      return;
    }

    if (sendForSignature) {
      // Also mark it as sent immediately (since the button says "Send to Client")
      const sendRes = await fetch(`${API_BASE}/contracts/${targetContractId}/send`, { method: 'PUT' });
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
    }

    // Clear stale edit/view state so the next "Create New Contract" starts fresh
    localStorage.removeItem('selected_contract_id');
    localStorage.removeItem('contract_page_mode');

    clearDraft();
    const successMessage = sendForSignature
      ? `Contract sent to ${clientEmail}`
      : (isEditingContract ? 'Draft updated successfully' : 'Draft saved successfully');
    showToast(successMessage, 'success');
    setTimeout(() => { window.location.href = './user-dashboard.html'; }, 1200);
  } catch (err) {
    console.error(err);
    showToast('Could not reach the server.', 'error');
  }
}

// ── Load sign-contract page with real data ───────────────────

async function loadSignContractPage() {
  const contractId = getContractIdFromContext();
  // Only run on the sign-contract page (check for signBtn OR editor-title with sign breadcrumb)
  const signBtn = document.getElementById('signBtn');
  const editorTitle = document.querySelector('.editor-title');
  if (!signBtn && !editorTitle) return; // not on sign page
  if (!document.getElementById('signatureCanvas') && !document.getElementById('signBtn')) return;

  if (!contractId) {
    if (editorTitle) editorTitle.textContent = 'Contract Not Found';
    const statusContent = document.querySelector('.signing-status-content');
    if (statusContent) {
      statusContent.innerHTML = '<h3>Contract unavailable</h3><p>No valid contract ID was provided. Return to dashboard and open the contract again.</p>';
    }
    const previewContent = document.querySelector('.preview-content');
    if (previewContent) {
      previewContent.innerHTML = '<p style="color:var(--danger); text-align:center;">Unable to load preview because contract reference is missing.</p>';
    }
    if (signBtn) signBtn.disabled = true;
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
    if (!c) {
      throw new Error('Contract payload is empty.');
    }
    selectedContractStatus = c.status;
    const isSignable = c.status === 'sent' || c.status === 'pending';
    const creatorSignature = c.signatures?.creator || '';
    const clientSignature = c.signatures?.client || '';

    // Update page title
    if (editorTitle) editorTitle.textContent = c.title;

    // Update signing status
    const statusContent = document.querySelector('.signing-status-content');
    if (statusContent) {
      const dueStr = formatContractDate(c.dueDate);
      if (isSignable) {
        statusContent.innerHTML = `<h3>Action Required</h3><p>Please review and sign this contract by ${dueStr}</p>`;
      } else if (c.status === 'signed') {
        const signedStr = formatContractDate(c.signedAt);
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
        currency: c.currency || DEFAULT_CURRENCY,
        dueDate: c.dueDate,
        clauses: c.clauses || {},
        creatorSignature,
      });

      let html = `<h2>${escapeHtml(c.title || 'Service Agreement')}</h2>`;
      html += `<p>This agreement is entered into as of ${escapeHtml(formatContractDate(c.createdAt))}.</p>`;
      html += `<section class="preview-section"><h2>Services & Scope</h2><p>${escapeHtml(sectionCopy.services)}</p></section>`;
      html += `<section class="preview-section"><h2>Compensation & Payment</h2><p>${sectionCopy.paymentHtml}</p></section>`;
      html += `<section class="preview-section"><h2>Deliverables</h2><p>${escapeHtml(sectionCopy.deliverables)}</p></section>`;
      html += `<section class="preview-section"><h2>Confidentiality</h2><p>${escapeHtml(sectionCopy.confidentiality)}</p></section>`;
      html += `<section class="preview-section"><h2>Term & Termination</h2><p>${escapeHtml(sectionCopy.termination)}</p></section>`;
      html += `<section class="preview-section"><h2>Signatures</h2><p>${escapeHtml(sectionCopy.signatures)}</p>${buildPreviewSignatureGrid({
        creatorName: c.userName || c.userEmail || 'Creator',
        clientName: c.clientName || c.clientEmail || 'Client',
        creatorSignature,
        clientSignature,
      })}</section>`;
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
      receivedAtValueEl.textContent = formatContractDate(c.createdAt);
    }
    if (signatureDeadlineValueEl) {
      signatureDeadlineValueEl.textContent = formatContractDate(c.dueDate);
    }

    if (!isSignable) {
      // Hide the signature form and action buttons entirely
      const signatureSectionEl = document.getElementById('signatureSection');
      const formActionsEl = document.getElementById('signActionButtons');
      if (signatureSectionEl) signatureSectionEl.style.display = 'none';
      if (formActionsEl) formActionsEl.style.display = 'none';

      // For signed contracts, fetch and display the stored signature
      if (c.status === 'signed') {
        const signedDownloadActionsEl = document.getElementById('signedDownloadActions');
        const signedDownloadBtnEl = document.getElementById('signedDownloadBtn');

        try {
          const sigRes = await fetch(`${API_BASE}/contracts/${contractId}/signature`);
          if (sigRes.ok) {
            const sig = await sigRes.json();
            if (el('signedByName')) el('signedByName').textContent = sig.signerName || '—';
            if (el('signedByEmail')) el('signedByEmail').textContent = sig.signerEmail || '—';
            if (el('signedByDate')) {
              el('signedByDate').textContent = formatContractDate(sig.signedAt);
            }
            const signatureType = sig.signatureType || 'drawn';
            if (el('signatureImageDisplay') && sig.signatureImage) {
              el('signatureImageDisplay').src = sig.signatureImage;
              el('signatureImageDisplay').dataset.signatureType = signatureType;
            }
            const signedDetailsEl = document.getElementById('signedDetailsSection');
            if (signedDetailsEl) signedDetailsEl.style.display = 'block';

            if (signedDownloadBtnEl) {
              signedDownloadBtnEl.onclick = () => {
                downloadSignedContract(contractId, signedDownloadBtnEl);
              };
            }
            if (signedDownloadActionsEl) signedDownloadActionsEl.style.display = 'flex';
          }
        } catch (_) { /* signature display is best-effort */ }
      }
    }
  } catch (err) {
    console.error('Failed to load contract for signing:', err);
    if (editorTitle) editorTitle.textContent = 'Contract Unavailable';
    const statusContent = document.querySelector('.signing-status-content');
    if (statusContent) {
      statusContent.innerHTML = '<h3>Unable to load contract</h3><p>The contract could not be loaded. Please return to dashboard and try again.</p>';
    }
    const previewContent = document.querySelector('.preview-content');
    if (previewContent) {
      previewContent.innerHTML = '<p style="color:var(--danger); text-align:center;">Contract preview could not be rendered.</p>';
    }
    if (signBtn) signBtn.disabled = true;
  }
}

function signaturePadContainsDrawing(signaturePad) {
  return Boolean(signaturePad?.hasDrawing());
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

  if (!signerName || !signerEmail || !agreeTerms) {
    showToast('Please fill in all required fields and agree to the terms.', 'warning');
    return;
  }

  // Get signature data based on method
  const signatureObj = getCurrentSignatureData();
  
  if (!signatureObj.data) {
    if (selectedMode === 'draw') {
      showToast('Please draw your signature in the box above.', 'warning');
    } else if (selectedMode === 'type') {
      showToast('Please type your legal name as your signature.', 'warning');
    } else if (selectedMode === 'upload') {
      showToast('Please upload a signature image.', 'warning');
    } else {
      showToast('Please add a signature.', 'warning');
    }
    return;
  }

  const contractId = getContractIdFromContext();
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
        signatureImage: signatureObj.data,
        signatureType: signatureObj.type,
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

  const contractId = getContractIdFromContext();
  const userId = localStorage.getItem('user_id');
  if (!contractId) {
    showToast('No contract selected.', 'error');
    return;
  }
  if (!userId) {
    showToast('Please sign in again before updating contract status.', 'error');
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/contracts/${contractId}/status?user_id=${encodeURIComponent(userId)}`, {
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

async function populateSignedExecutionDetails(contractId) {
  if (!contractId) return false;

  try {
    const sigRes = await fetch(`${API_BASE}/contracts/${contractId}/signature`);
    if (!sigRes.ok) return false;

    const sig = await sigRes.json();
    if (el('signedByName')) el('signedByName').textContent = sig.signerName || '—';
    if (el('signedByEmail')) el('signedByEmail').textContent = sig.signerEmail || '—';
    if (el('signedByDate')) el('signedByDate').textContent = formatContractDate(sig.signedAt);
    if (el('signatureImageDisplay')) {
      el('signatureImageDisplay').src = sig.signatureImage || 'data:,';
      el('signatureImageDisplay').dataset.signatureType = sig.signatureType || 'drawn';
    }

    const signedDetailsEl = document.getElementById('signedDetailsSection');
    if (signedDetailsEl) signedDetailsEl.style.display = 'block';
    return true;
  } catch {
    return false;
  }
}
