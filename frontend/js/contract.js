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
const HOUSE_SALE_TYPE = 'house_sale';
const LEGACY_DRAFT_CLEANUP_FLAG = 'legacy_contract_wizard_draft_removed_v1';
const PAGE_CONFIG = window.CONTRACT_PAGE_CONFIG || {};
const IS_TYPE_SELECTION_PAGE = Boolean(PAGE_CONFIG.isTypeSelectionPage || window.IS_TYPE_SELECTION_PAGE);
const PAGE_CONTRACT_TYPE = String(PAGE_CONFIG.contractType || '').trim().toLowerCase();
const PAGE_CONTRACT_LABEL = String(PAGE_CONFIG.contractTypeLabel || '').trim();
const HOUSE_SALE_FIELD_IDS = [
  'hsAgreementPlace',
  'hsAgreementDate',
  'hsVendorName',
  'hsVendorResidence',
  'hsPurchaserName',
  'hsPurchaserResidence',
  'hsPropertyDetails',
  'hsSalePrice',
  'hsEarnestMoneyAmount',
  'hsCompletionPeriodMonths',
  'hsWitness1Name',
  'hsWitness2Name',
];

const previousGlobalErrorHandler = window.onerror;
window.onerror = function contractGlobalErrorHandler(msg, url, line, column, error) {
  console.error('Global error:', msg, url, line, column, error);
  if (typeof previousGlobalErrorHandler === 'function') {
    return previousGlobalErrorHandler(msg, url, line, column, error);
  }
  return false;
};

function el(id) {
  return document.getElementById(id);
}

function isLikelyContractId(value) {
  if (!value) return false;
  return /^[a-f\d]{24}$/i.test(String(value).trim());
}

function getContractIdFromContext() {
  const urlId = new URLSearchParams(window.location.search).get('contractId');
  return isLikelyContractId(urlId) ? urlId : '';
}

function getContractPageModeFromContext() {
  const modeFromUrl = new URLSearchParams(window.location.search).get('mode');
  if (modeFromUrl === 'edit' || modeFromUrl === 'view') return modeFromUrl;
  return '';
}

function normalizeContractStatus(status) {
  return String(status || '').trim().toLowerCase();
}

function isHouseSaleType(typeValue = selectedContractType) {
  return String(typeValue || '').trim().toLowerCase() === HOUSE_SALE_TYPE;
}

function toTitleCase(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase())
    .trim();
}

function parseInputDateValue(value) {
  if (!value) return null;
  const text = String(value).trim();
  if (!text) return null;

  let year;
  let month;
  let day;

  const isoMatch = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const displayMatch = text.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);

  if (isoMatch) {
    year = Number(isoMatch[1]);
    month = Number(isoMatch[2]);
    day = Number(isoMatch[3]);
  } else if (displayMatch) {
    day = Number(displayMatch[1]);
    month = Number(displayMatch[2]);
    year = Number(displayMatch[3]);
  } else {
    return null;
  }

  if (year < 1900 || year > 2100) return null;

  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    Number.isNaN(parsed.getTime())
    || parsed.getUTCFullYear() !== year
    || parsed.getUTCMonth() !== month - 1
    || parsed.getUTCDate() !== day
  ) {
    return null;
  }

  const iso = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  return { iso, date: parsed, year };
}

function formatDateForInput(value) {
  const parsed = parseInputDateValue(value);
  if (parsed) {
    const [year, month, day] = parsed.iso.split('-');
    return `${day}/${month}/${year}`;
  }

  const fallbackDate = new Date(String(value || '').trim());
  if (Number.isNaN(fallbackDate.getTime())) return '';
  const year = String(fallbackDate.getFullYear());
  const month = String(fallbackDate.getMonth() + 1).padStart(2, '0');
  const day = String(fallbackDate.getDate()).padStart(2, '0');
  return `${day}/${month}/${year}`;
}

function formatLongDate(value) {
  const parsed = parseInputDateValue(value);
  if (!parsed) return 'N/A';
  return parsed.date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function getInputElement(id) {
  return document.getElementById(id);
}

function getTrimmedInputValue(id, fallback = '') {
  const field = getInputElement(id);
  if (!field) return fallback;
  const value = String(field.value || '').trim();
  return value || fallback;
}

function getRawInputValue(id, fallback = '') {
  const field = getInputElement(id);
  if (!field) return fallback;
  return String(field.value || '');
}

function getConfiguredContractType() {
  if (!PAGE_CONTRACT_TYPE) return '';
  return PAGE_CONTRACT_TYPE;
}

function getActiveContractType() {
  return String(getConfiguredContractType() || selectedContractType || '').trim().toLowerCase();
}

function getContractPage(typeValue) {
  const normalizedType = String(typeValue || '').trim().toLowerCase();
  const map = {
    house_sale: 'create-contract-house-sale.html',
    service: 'create-contract-service.html',
    nda: 'create-contract-nda.html',
    license: 'create-contract-license.html',
    employment: 'create-contract-employment.html',
    partnership: 'create-contract-partnership.html',
    custom: 'create-contract-custom.html',
    broker: 'create-contract-broker.html',
  };

  return map[normalizedType];
}

function redirectToContractPage(typeValue) {
  const page = getContractPage(typeValue);
  window.location.href = `./${page}`;
}

function runLegacyDraftCleanupOnce() {
  const cleanupDone = localStorage.getItem(LEGACY_DRAFT_CLEANUP_FLAG) === '1';
  if (cleanupDone) return;

  localStorage.removeItem(DRAFT_STORAGE_KEY);
  localStorage.setItem(LEGACY_DRAFT_CLEANUP_FLAG, '1');
}

function initializeContractPageConfig() {
  if (!PAGE_CONTRACT_TYPE) return;

  selectedContractType = PAGE_CONTRACT_TYPE;
  currentStep = 2;

  const typeLabelEl = document.getElementById('typeLabel');
  if (typeLabelEl && PAGE_CONTRACT_LABEL) {
    typeLabelEl.textContent = PAGE_CONTRACT_LABEL;
  }

  const pageTitleEl = document.getElementById('pageTitle');
  if (pageTitleEl && PAGE_CONTRACT_LABEL) {
    pageTitleEl.textContent = PAGE_CONTRACT_LABEL;
  }

  const agreementTitleEl = document.getElementById('contractTitle');
  if (
    agreementTitleEl
    && isHouseSaleType(PAGE_CONTRACT_TYPE)
    && !agreementTitleEl.value.trim()
  ) {
    agreementTitleEl.placeholder = 'Agreement for Sale of House';
  }

  const clauseToggles = document.getElementById('clauseToggles');
  if (clauseToggles) {
    clauseToggles.classList.toggle('hidden', isHouseSaleType(PAGE_CONTRACT_TYPE));
  }
}

function toggleFormByType(type) {
  const isHouseSale = isHouseSaleType(type);
  const genericFields = document.getElementById('genericFields');
  const houseSaleFields = document.getElementById('houseSaleFields');
  const clauseToggles = document.getElementById('clauseToggles');
  const clientNameGroup = document.getElementById('clientNameGroup');
  const contractTitleLabel = document.getElementById('contractTitleLabel');
  const contractTitleRequired = document.getElementById('contractTitleRequired');
  const contractTitleInput = document.getElementById('contractTitle');
  const amountInput = document.getElementById('contractAmount');
  const descriptionInput = document.getElementById('contractDescription');
  const dueDateInput = document.getElementById('dueDate');

  if (genericFields) genericFields.classList.toggle('hidden', isHouseSale);
  if (houseSaleFields) houseSaleFields.classList.toggle('hidden', !isHouseSale);
  if (clauseToggles) clauseToggles.classList.toggle('hidden', isHouseSale);
  if (clientNameGroup) clientNameGroup.classList.toggle('hidden', isHouseSale);

  if (contractTitleInput) {
    contractTitleInput.required = !isHouseSale;
    if (isHouseSale && !contractTitleInput.value.trim()) {
      contractTitleInput.placeholder = 'Agreement for Sale of House (optional)';
    } else {
      contractTitleInput.placeholder = 'e.g., Q3 Web Development Services';
    }
  }

  if (contractTitleRequired) {
    contractTitleRequired.classList.toggle('hidden', isHouseSale);
  }

  if (contractTitleLabel) {
    contractTitleLabel.childNodes[0].textContent = isHouseSale ? 'Contract Title (Optional) ' : 'Contract Title ';
  }

  if (isHouseSale && amountInput) {
    const houseSalePriceField = document.getElementById('hsSalePrice');
    if (houseSalePriceField) {
      amountInput.value = houseSalePriceField.value || amountInput.value;
    }
  }

  if (!isHouseSale) return;

  if (descriptionInput && !descriptionInput.value.trim()) {
    descriptionInput.value = '';
  }
  if (dueDateInput && !dueDateInput.value.trim()) {
    const today = new Date();
    const dd = String(today.getDate()).padStart(2, '0');
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const yyyy = String(today.getFullYear());
    dueDateInput.value = `${dd}/${mm}/${yyyy}`;
  }
}

function collectHouseSaleTemplateData() {
  const salePriceRaw = getTrimmedInputValue('hsSalePrice');
  const earnestRaw = getTrimmedInputValue('hsEarnestMoneyAmount');
  const completionRaw = getTrimmedInputValue('hsCompletionPeriodMonths');

  const parseNumberOrNull = (raw) => {
    if (!raw) return null;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : null;
  };

  const parseIntegerOrNull = (raw) => {
    if (!raw) return null;
    const parsed = parseInt(raw, 10);
    return Number.isFinite(parsed) ? parsed : null;
  };

  return {
    agreement_place: getTrimmedInputValue('hsAgreementPlace'),
    agreement_date: parseInputDateValue(getRawInputValue('hsAgreementDate'))?.iso || null,
    vendor_name: getTrimmedInputValue('hsVendorName'),
    vendor_residence: getTrimmedInputValue('hsVendorResidence'),
    purchaser_name: getTrimmedInputValue('hsPurchaserName'),
    purchaser_residence: getTrimmedInputValue('hsPurchaserResidence'),
    property_details: getTrimmedInputValue('hsPropertyDetails'),
    sale_price: parseNumberOrNull(salePriceRaw),
    earnest_money_amount: parseNumberOrNull(earnestRaw),
    completion_period_months: parseIntegerOrNull(completionRaw),
    witness_1_name: getTrimmedInputValue('hsWitness1Name'),
    witness_2_name: getTrimmedInputValue('hsWitness2Name'),
  };
}

function applyHouseSaleDataToForm(houseSaleData = {}) {
  const getValue = (key) => (houseSaleData?.[key] == null ? '' : String(houseSaleData[key]));

  const fieldMap = {
    hsAgreementPlace: 'agreement_place',
    hsAgreementDate: 'agreement_date',
    hsVendorName: 'vendor_name',
    hsVendorResidence: 'vendor_residence',
    hsPurchaserName: 'purchaser_name',
    hsPurchaserResidence: 'purchaser_residence',
    hsPropertyDetails: 'property_details',
    hsSalePrice: 'sale_price',
    hsEarnestMoneyAmount: 'earnest_money_amount',
    hsCompletionPeriodMonths: 'completion_period_months',
    hsWitness1Name: 'witness_1_name',
    hsWitness2Name: 'witness_2_name',
  };

  Object.entries(fieldMap).forEach(([fieldId, sourceKey]) => {
    const input = document.getElementById(fieldId);
    if (!input) return;
    if (fieldId === 'hsAgreementDate') {
      input.value = formatDateForInput(houseSaleData?.[sourceKey]);
      return;
    }
    input.value = getValue(sourceKey);
  });

  const amountInput = document.getElementById('contractAmount');
  if (amountInput && houseSaleData?.sale_price != null && String(houseSaleData.sale_price).trim() !== '') {
    amountInput.value = String(houseSaleData.sale_price);
  }
}

/**
 * Collect generic contract data from form fields (used for service, nda, license, etc.).
 * Returns object matching the backend's expected templateData structure.
 * @returns {Object} generic contract data
 */
function collectGenericFormData() {
  const clauses = {};
  document.querySelectorAll('.toggle-switch[data-clause]').forEach((toggle) => {
    clauses[toggle.dataset.clause] = toggle.checked;
  });

  const dueDateValue = getRawInputValue('dueDate');

  return {
    title: getTrimmedInputValue('contractTitle'),
    client_name: getTrimmedInputValue('clientName'),
    client_email: getTrimmedInputValue('clientEmail'),
    amount: getRawInputValue('contractAmount'),
    currency: getRawInputValue('currency') || DEFAULT_CURRENCY,
    due_date: parseInputDateValue(dueDateValue)?.iso || null,
    description: getTrimmedInputValue('contractDescription'),
    clauses, // object with keys: payment, liability, confidentiality, termination
  };
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
  try {
    runLegacyDraftCleanupOnce();

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

  initializeContractPageConfig();
  if (IS_TYPE_SELECTION_PAGE) {
    // Creating a new contract should not inherit stale edit/view state.
    localStorage.removeItem('selected_contract_id');
    localStorage.removeItem('contract_page_mode');
  }

  // ── Contract Type Selection ──────────────────────────────────
  const contractTypeOptions = document.querySelectorAll('.contract-type-option');
  contractTypeOptions.forEach((option) => {
    option.addEventListener('click', () => {
      const type = option.dataset.type;
      selectedContractType = type;
      
      // Type selection page routes immediately to dedicated contract pages.
      if (IS_TYPE_SELECTION_PAGE) {
        redirectToContractPage(type);
        return;
      }
      
      // Otherwise (existing create-contract.html with all steps), show step 2
      contractTypeOptions.forEach((opt) => opt.classList.remove('selected'));
      option.classList.add('selected');
      toggleFormByType(type);
      saveDraft();
      goToStep(2);
      // Scroll viewport to top of form for clarity
      document.querySelector('.contract-editor')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
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

  ['dueDate', 'hsAgreementDate'].forEach((fieldId) => {
    const field = document.getElementById(fieldId);
    if (!field) return;
    field.addEventListener('blur', () => {
      if (!field.value.trim()) return;
      const normalized = formatDateForInput(field.value);
      if (normalized) {
        field.value = normalized;
        saveDraft();
      }
    });
  });

  HOUSE_SALE_FIELD_IDS.forEach((fieldId) => {
    const field = document.getElementById(fieldId);
    if (!field) return;
    field.addEventListener('input', saveDraft);
    field.addEventListener('change', saveDraft);
    field.addEventListener('input', () => clearFieldError(field));
  });

  const hsSalePrice = document.getElementById('hsSalePrice');
  const contractAmountInput = document.getElementById('contractAmount');
  if (hsSalePrice && contractAmountInput) {
    hsSalePrice.addEventListener('input', () => {
      if (!isHouseSaleType()) return;
      contractAmountInput.value = hsSalePrice.value;
      saveDraft();
    });
  }

  // ── Step Navigation (Create Contract) ────────────────────────
  const nextBtn = document.getElementById('nextBtn');
  const prevBtn = document.getElementById('prevBtn');
  const saveDraftBtn = document.getElementById('saveDraftBtn');
  const submitBtn = document.getElementById('submitBtn');
  const contractForm = document.getElementById('contractForm');

  if (contractForm) {
    contractForm.addEventListener('submit', (event) => {
      event.preventDefault();
      if (nextBtn) nextBtn.click();
    });
  }

  if (nextBtn) {
    nextBtn.addEventListener('click', () => {
      // Type selection page routes directly to dedicated page.
      if (IS_TYPE_SELECTION_PAGE) {
        if (!selectedContractType) {
          showToast('Please select a contract type to continue.', 'warning');
          return;
        }
        redirectToContractPage(selectedContractType);
        return;
      }
      
      // Otherwise, normal step navigation in multi-step flow
      if (currentStep === 1 && !selectedContractType) {
        showToast('Please select a contract type to continue.', 'warning');
        return;
      }
      // Validate Step 2 required fields before advancing to Step 3
      if (currentStep === 2) {
        const validation = isHouseSaleType() ? validateHouseSale() : validateGenericForm();
        if (!validation.isValid) {
          applyValidationErrors(validation.errors);
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
  } catch (error) {
    console.error('[contract.js] Page initialization failed:', error);
    const message = document.createElement('div');
    message.className = 'error-banner';
    message.style.margin = '16px auto';
    message.style.maxWidth = '960px';
    message.style.padding = '12px 16px';
    message.style.border = '1px solid #fecaca';
    message.style.background = '#fff1f2';
    message.style.color = '#991b1b';
    message.textContent = 'Contract page failed to initialize. Please refresh the page. If this persists, contact support.';
    const main = document.querySelector('main') || document.body;
    main.prepend(message);
  }
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
/**
 * Save current form state to localStorage with type isolation.
 * Accepts optional type parameter; uses selectedContractType if not provided.
 * For backward compatibility with old code that calls saveDraft() without parameters.
 * @param {string} [type] - Contract type (e.g., 'service', 'house_sale', 'nda'). If omitted, uses selectedContractType.
 */
function saveDraft(type) {
  if (isEditOrViewMode) return;
  const contractType = String(type || getActiveContractType() || '').trim().toLowerCase();
  if (!contractType) return; // Skip if type not determined
  
  const storageKey = `draftContract_${contractType}`;
  const houseSaleData = isHouseSaleType(contractType) ? collectHouseSaleTemplateData() : null;
  
  const draft = {
    contractType,
    contractTitle: getRawInputValue('contractTitle'),
    clientName: getRawInputValue('clientName'),
    clientEmail: getRawInputValue('clientEmail'),
    contractAmount: getRawInputValue('contractAmount'),
    currency: getRawInputValue('currency') || DEFAULT_CURRENCY,
    dueDate: getRawInputValue('dueDate'),
    contractDescription: getRawInputValue('contractDescription'),
    houseSaleData,
    clauses: {},
  };
  
  document.querySelectorAll('.toggle-switch[data-clause]').forEach((toggle) => {
    draft.clauses[toggle.dataset.clause] = toggle.checked;
  });
  
  localStorage.setItem(storageKey, JSON.stringify(draft));
}

/**
 * Re-populate all wizard fields from a previously saved draft.
 * Accepts optional type parameter; uses selectedContractType if not provided.
 * For backward compatibility with old code that calls restoreDraft() without parameters.
 * @param {string} [type] - Contract type (e.g., 'service', 'house_sale', 'nda'). If omitted, uses selectedContractType.
 */
function restoreDraft(type) {
  const contractType = String(type || getActiveContractType() || '').trim().toLowerCase();
  if (!contractType) return; // Skip if type not determined
  
  const storageKey = `draftContract_${contractType}`;
  const raw = localStorage.getItem(storageKey);
  if (!raw) return;
  
  try {
    const draft = JSON.parse(raw);
    if (draft.contractType) {
      selectedContractType = draft.contractType;
      // Only apply toggleFormByType in old multi-step pages.
      if (typeof toggleFormByType === 'function' && !IS_TYPE_SELECTION_PAGE) {
        document.querySelectorAll('.contract-type-option').forEach((opt) => {
          opt.classList.toggle('selected', opt.dataset.type === draft.contractType);
        });
        toggleFormByType(selectedContractType);
      }
    }
    
    // Restore generic form fields
    ['contractTitle', 'clientName', 'clientEmail', 'contractAmount', 'currency', 'dueDate', 'contractDescription'].forEach((id) => {
      const field = document.getElementById(id);
      if (!field) return;
      if (Object.prototype.hasOwnProperty.call(draft, id)) {
        field.value = draft[id] == null ? '' : draft[id];
      }
    });
    
    // Restore clause toggles
    if (draft.clauses) {
      document.querySelectorAll('.toggle-switch[data-clause]').forEach((toggle) => {
        if (draft.clauses[toggle.dataset.clause] !== undefined) {
          toggle.checked = draft.clauses[toggle.dataset.clause];
        }
      });
    }

    // Restore house sale data if present
    if (draft.houseSaleData && typeof draft.houseSaleData === 'object') {
      applyHouseSaleDataToForm(draft.houseSaleData);
    }
  } catch (err) {
    console.warn(`Could not restore draft for type "${contractType}":`, err);
  }
}

/**
 * Remove the cached draft for a specific type — called on successful send or intentional cancel.
 * @param {string} [type] - Contract type. If omitted, uses selectedContractType.
 */
function clearDraft(type) {
  const contractType = type || selectedContractType;
  if (!contractType) return;
  const storageKey = `draftContract_${contractType}`;
  localStorage.removeItem(storageKey);
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

function clearValidationErrors(fieldIds) {
  fieldIds.forEach((fieldId) => {
    const field = document.getElementById(fieldId);
    if (!field) return;
    clearFieldError(field);
  });
}

function addValidationError(errors, fieldId, message) {
  const field = document.getElementById(fieldId);
  if (!field) return;
  errors.push({ field, message });
}

function applyValidationErrors(errors) {
  if (!errors.length) return true;

  errors.forEach(({ field, message }) => setFieldError(field, message));
  errors[0].field.scrollIntoView({ behavior: 'smooth', block: 'center' });
  return false;
}

function validateGenericForm() {
  const fieldIds = ['contractTitle', 'clientEmail', 'contractAmount', 'dueDate'];
  clearValidationErrors(fieldIds);

  const errors = [];
  const title = getTrimmedInputValue('contractTitle');
  const clientEmail = getTrimmedInputValue('clientEmail');
  const amountText = getTrimmedInputValue('contractAmount');
  const dueDateText = getTrimmedInputValue('dueDate');
  const parsedDueDate = parseInputDateValue(dueDateText);
  const amountValue = Number(amountText);

  if (!title) addValidationError(errors, 'contractTitle', 'Contract title is required.');
  if (!clientEmail) addValidationError(errors, 'clientEmail', 'Client email address is required.');
  if (!amountText) {
    addValidationError(errors, 'contractAmount', 'Contract amount is required.');
  } else if (!(amountValue > 0)) {
    addValidationError(errors, 'contractAmount', 'Contract amount must be greater than 0.');
  }

  if (!dueDateText) {
    addValidationError(errors, 'dueDate', 'Due date is required.');
  } else if (!parsedDueDate) {
    addValidationError(errors, 'dueDate', 'Due date must be in dd/mm/yyyy format and year between 1900-2100.');
  }

  return {
    isValid: errors.length === 0,
    errors,
    data: {
      title,
      clientEmail,
      amountText,
      amountValue,
      dueDateText,
      dueDateIso: parsedDueDate?.iso || null,
    },
  };
}

function validateHouseSale() {
  const fieldIds = [
    'clientEmail',
    'hsAgreementDate',
    'hsVendorName',
    'hsPurchaserName',
    'hsPropertyDetails',
    'hsSalePrice',
    'hsEarnestMoneyAmount',
  ];
  clearValidationErrors(fieldIds);

  const errors = [];
  const houseSaleData = collectHouseSaleTemplateData();
  const clientEmail = getTrimmedInputValue('clientEmail');
  const agreementDateText = getTrimmedInputValue('hsAgreementDate');
  const parsedAgreementDate = agreementDateText ? parseInputDateValue(agreementDateText) : null;
  const salePriceValue = Number(houseSaleData.sale_price || 0);
  const earnestValue = Number(houseSaleData.earnest_money_amount || 0);

  if (!clientEmail) {
    addValidationError(errors, 'clientEmail', 'Client email address is required.');
  }
  if (!houseSaleData.vendor_name) {
    addValidationError(errors, 'hsVendorName', 'Vendor name is required for house sale contracts.');
  }
  if (!houseSaleData.purchaser_name) {
    addValidationError(errors, 'hsPurchaserName', 'Purchaser name is required for house sale contracts.');
  }
  if (!houseSaleData.property_details) {
    addValidationError(errors, 'hsPropertyDetails', 'Property details are required for house sale contracts.');
  } else if (houseSaleData.property_details.length <= 10) {
    addValidationError(errors, 'hsPropertyDetails', 'Property details must be longer than 10 characters.');
  }
  if (!(salePriceValue > 0)) {
    addValidationError(errors, 'hsSalePrice', 'Sale price must be greater than 0.');
  }
  if (earnestValue > salePriceValue) {
    addValidationError(errors, 'hsEarnestMoneyAmount', 'Earnest money cannot exceed sale price.');
  }
  if (agreementDateText && !parsedAgreementDate) {
    addValidationError(errors, 'hsAgreementDate', 'Agreement date must be dd/mm/yyyy with year between 1900-2100.');
  }

  return {
    isValid: errors.length === 0,
    errors,
    data: {
      clientEmail,
      houseSaleData,
      salePriceValue,
      agreementDate: parsedAgreementDate?.date || null,
    },
  };
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

  const selectedClientSignatureMode = signatureTypeFlag ? signatureTypeFlag.value : selectedMode;
  setClientMode(selectedClientSignatureMode || selectedMode, { resetOnChange: false });
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

  const selectedCreatorSignatureMode = signatureTypeFlag ? signatureTypeFlag.value : creatorSelectedMode;
  setCreatorMode(selectedCreatorSignatureMode || creatorSelectedMode, { resetOnChange: false });
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
    const typedSignatureField = el('typedSignatureInput');
    const typedSignature = typedSignatureField ? typedSignatureField.value.trim() : '';
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
  const currencyField = document.getElementById('currency');
  if (!currencyField) return fallback;
  return normalizeCurrencySymbol(currencyField.value, fallback);
}

function parseContractDate(value) {
  const parsedInput = parseInputDateValue(value);
  if (parsedInput) return parsedInput.date;

  if (!value) return null;
  const parsedDate = new Date(String(value).trim());
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
    const typedSignatureField = el('creatorTypedSignatureInput');
    const typedSignature = typedSignatureField ? typedSignatureField.value.trim() : '';
    if (!typedSignature) return '';
    return renderTypedSignatureToDataUrl(typedSignature);
  }

  return '';
}

function formatContractAmount(value, currency = DEFAULT_CURRENCY, fallbackCurrency = DEFAULT_CURRENCY) {
  const numeric = Number(value);
  const symbol = normalizeCurrencySymbol(currency, fallbackCurrency);
  if (!Number.isFinite(numeric)) return `${symbol}0.00`;
  return `${symbol}${numeric.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
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

function buildPreviewSignatureGrid({
  creatorName,
  clientName,
  creatorSignature,
  clientSignature,
  creatorLabel = 'Creator Signature',
  clientLabel = 'Client Signature',
  creatorPendingLabel = 'Pending creator signature',
  clientPendingLabel = 'Pending client signature',
}) {
  return `
    <div class="preview-signature-grid">
      ${buildPreviewSignatureBlock(creatorLabel, creatorName, creatorSignature, creatorPendingLabel)}
      ${buildPreviewSignatureBlock(clientLabel, clientName, clientSignature, clientPendingLabel)}
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

function renderHouseSalePreview(templateData, options = {}) {
  const previewContent = document.getElementById('previewContent');
  const summaryPanel = document.getElementById('houseSaleSummaryPreview');
  const summaryContent = document.getElementById('houseSaleSummaryContent');
  if (!previewContent) return;

  const houseSale = templateData?.houseSale || collectHouseSaleTemplateData();
  const currency = getSelectedCurrency();
  const salePrice = formatContractAmount(houseSale.sale_price, currency, DEFAULT_CURRENCY);
  const earnestMoney = houseSale.earnest_money_amount != null
    ? formatContractAmount(houseSale.earnest_money_amount, currency, DEFAULT_CURRENCY)
    : 'N/A';

  const titleField = document.getElementById('contractTitle');
  const contractTitleText = titleField
    ? titleField.value.trim() || 'Agreement for Sale of House'
    : 'Agreement for Sale of House';

  const creatorName = houseSale.vendor_name || options.creatorName || localStorage.getItem('user_name') || 'Vendor';
  const purchaserName = houseSale.purchaser_name || options.clientName || 'Purchaser';
  const creatorSignature = options.creatorSignature || getCreatorSignatureValue();
  const clientSignature = options.clientSignature || '';

  const witness1 = toTitleCase(houseSale.witness_1_name || '');
  const witness2 = toTitleCase(houseSale.witness_2_name || '');
  const showWitnesses = Boolean(witness1 || witness2);

  if (summaryPanel && summaryContent) {
    summaryPanel.classList.remove('hidden');
    summaryContent.innerHTML = `
      <p><strong>Vendor:</strong> ${escapeHtml(houseSale.vendor_name || 'N/A')}</p>
      <p><strong>Residence:</strong> ${escapeHtml(houseSale.vendor_residence || 'N/A')}</p>
      <p><strong>Purchaser:</strong> ${escapeHtml(houseSale.purchaser_name || 'N/A')}</p>
      <p><strong>Residence:</strong> ${escapeHtml(houseSale.purchaser_residence || 'N/A')}</p>
      <p><strong>Sale Price:</strong> ${escapeHtml(salePrice)}</p>
    `;
  }

  previewContent.innerHTML = `
    <h2>AGREEMENT FOR SALE OF A HOUSE</h2>
    <h3>${escapeHtml(contractTitleText)}</h3>
    <p>THIS AGREEMENT of sale made at ${escapeHtml(houseSale.agreement_place || 'N/A')} on ${escapeHtml(formatLongDate(houseSale.agreement_date) || 'N/A')}, between ${escapeHtml(houseSale.vendor_name || 'N/A')} resident of ${escapeHtml(houseSale.vendor_residence || 'N/A')} hereinafter called the vendor of the ONE PART and ${escapeHtml(houseSale.purchaser_name || 'N/A')} resident of ${escapeHtml(houseSale.purchaser_residence || 'N/A')} hereinafter called the purchaser of the OTHER PART.</p>
    <p>WHEREAS the vendor is absolutely seized and possessed of or well and sufficiently entitled to the house more fully described in the Schedule hereunder:</p>
    <p>AND WHEREAS the vendor has agreed to sell his house to the purchaser on the terms and conditions hereafter set-forth.</p>
    <p><strong>NOW THIS AGREEMENT WITNESSETH AS FOLLOWS</strong></p>
    <p><strong>(1)</strong> The vendor will sell and the purchaser will purchase that entire house more particularly described in the Schedule hereunder written at a price of ${escapeHtml(salePrice)} free from all encumbrances.</p>
    <p><strong>(2)</strong> The purchaser has paid a sum of ${escapeHtml(earnestMoney)} as earnest money (the receipt of which sum, the vendor hereby acknowledges) and the balance amount of consideration will be paid at the time of execution of conveyance deed.</p>
    <p><strong>(3)</strong> The sale shall be completed within a period of ${escapeHtml(String(houseSale.completion_period_months || 'N/A'))} months from this date and it is hereby agreed that time is the essence of the contract.</p>
    <p><strong>(4)</strong> The vendor shall submit the title deeds of the house in his possession or power to the purchaser's advocate within one week from the date of this agreement for investigation of title and the purchaser will intimate about his advocate's report within reasonable time after delivery of title deeds.</p>
    <p><strong>(5)</strong> If the purchaser's advocate gives the report that the vendor's title is not clear, the vendor shall refund the earnest money, without interest, to the purchaser within reasonable time from intimation of such report. If the vendor does not refund the earnest money within such time, the vendor shall be liable for applicable interest up to the date of repayment of earnest money.</p>
    <p><strong>(6)</strong> The vendor declares that the sale of the house will be without encumbrances.</p>
    <p><strong>(7)</strong> The vendor will hand over the vacant possession of the house on the execution and registration of conveyance deed.</p>
    <p><strong>(8)</strong> If the purchaser commits breach of the agreement, the vendor shall be entitled to forfeit the earnest money paid by the purchaser to the vendor and the vendor will be at liberty to resell the property to any person.</p>
    <p><strong>(9)</strong> If the vendor commits breach of the agreement, he shall be liable to refund earnest money received by him and liquidated damages as may be determined under applicable law.</p>
    <p><strong>(10)</strong> The vendor shall execute the conveyance deed in favour of the purchaser or his nominee as the purchaser may require, on receipt of the balance consideration.</p>
    <p><strong>(11)</strong> The vendor shall at his own costs obtain statutory clearances and permissions required for completion of the sale.</p>
    <p><strong>(12)</strong> The expenses for preparation of the conveyance deed, cost of stamp, registration charges and all other out-of-pocket expenses shall be borne by the purchaser.</p>
    <h3>SCHEDULE OF PROPERTY</h3>
    <p><strong>Detailed description:</strong> ${escapeHtml(houseSale.property_details || 'N/A')}</p>
    <h3>EXECUTION</h3>
    <p>IN WITNESS WHEREOF the parties have set their hands to this Agreement on the day and year first hereinabove written.</p>
    ${buildPreviewSignatureGrid({
      creatorName,
      clientName: purchaserName,
      creatorSignature,
      clientSignature,
      creatorLabel: 'Vendor Signature',
      clientLabel: 'Purchaser Signature',
      creatorPendingLabel: 'Pending vendor signature',
      clientPendingLabel: 'Pending purchaser signature',
    })}
    ${showWitnesses ? `<h3>WITNESSES</h3>${witness1 ? `<p>1. ${escapeHtml(witness1)}</p>` : ''}${witness2 ? `<p>2. ${escapeHtml(witness2)}</p>` : ''}` : ''}
  `;
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

  if (isHouseSaleType()) {
    renderHouseSalePreview(
      { houseSale: collectHouseSaleTemplateData() },
      {
        creatorName: (isViewMode ? loadedContractViewState?.creatorName : '') || localStorage.getItem('user_name') || 'Vendor',
        clientName: (isViewMode ? loadedContractViewState?.clientName : '') || getTrimmedInputValue('clientName', 'Purchaser'),
        creatorSignature,
        clientSignature,
      },
    );
    return;
  }

  const sectionCopy = buildContractSectionCopy({
    title: getRawInputValue('contractTitle'),
    description: getRawInputValue('contractDescription'),
    amount: getRawInputValue('contractAmount'),
    currency: getRawInputValue('currency'),
    dueDate: getRawInputValue('dueDate'),
    clauses,
    creatorSignature,
    clientSignature,
    status: isViewMode ? loadedContractViewState?.status : 'draft',
  });

  if (contractTitle) {
    const previewTitleEl = document.getElementById('previewTitle');
    if (previewTitleEl) {
      previewTitleEl.textContent = contractTitle.value || 'Service Agreement';
    }
  }
  if (clientName) {
    const previewClientEl = document.getElementById('previewClient');
    if (previewClientEl) {
      previewClientEl.textContent = clientName.value || 'Client';
    }
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
      clientName: (isViewMode ? loadedContractViewState?.clientName : '') || getTrimmedInputValue('clientName', 'Client'),
      creatorSignature,
      clientSignature,
    });
  }
}

function ensureSignedDetailsSection() {
  const existing = document.getElementById('signedDetailsSection');
  if (existing) return existing;

  const stepThree = document.getElementById('step-3');
  if (!stepThree) return null;

  const section = document.createElement('div');
  section.className = 'form-section';
  section.id = 'signedDetailsSection';
  section.style.display = 'none';
  section.style.borderColor = 'var(--success)';
  section.style.backgroundColor = '#f8fafc';
  section.innerHTML = `
    <h2 class="form-section-title" style="color: var(--success);">Execution Details</h2>
    <div class="contract-meta" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: var(--space-6); margin-bottom: var(--space-6);">
      <div class="meta-row" style="flex-direction: column; align-items: flex-start;">
        <span class="meta-label">Electronically Signed By</span>
        <span class="meta-value" id="signedByName">-</span>
      </div>
      <div class="meta-row" style="flex-direction: column; align-items: flex-start;">
        <span class="meta-label">Signer Email Address</span>
        <span class="meta-value" id="signedByEmail">-</span>
      </div>
      <div class="meta-row" style="flex-direction: column; align-items: flex-start;">
        <span class="meta-label">Timestamp</span>
        <span class="meta-value" id="signedByDate">-</span>
      </div>
    </div>

    <div>
      <span class="meta-label" style="display:block; margin-bottom:var(--space-2);">Certified Signature</span>
      <img
        id="signatureImageDisplay"
        src="data:image/gif;base64,R0lGODlhAQABAAAAACwAAAAAAQABAAA="
        alt="Signature Data"
        style="border:1px solid var(--border); border-radius:var(--radius-md); max-width:100%; height:auto; display:block; background:#fff; box-shadow: var(--shadow-sm);"
      >
    </div>
  `;

  stepThree.appendChild(section);
  return section;
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
    restoreDraft(getActiveContractType());
    return;
  }

  if (!contractId) {
    isEditOrViewMode = false;
    showToast('Contract reference is missing. Please open the contract again from the dashboard.', 'error');
    restoreDraft(getActiveContractType());
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
      dueDateEl.value = formatDateForInput(c.dueDate);
    }

    const contractDescriptionEl = document.getElementById('contractDescription');
    if (contractDescriptionEl) contractDescriptionEl.value = c.description || '';

    if (c.type) {
      selectedContractType = c.type;
      document.querySelectorAll('.contract-type-option').forEach((opt) => {
        opt.classList.toggle('selected', opt.dataset.type === c.type);
      });
      toggleFormByType(selectedContractType);
    }

    if (isHouseSaleType(c.type)) {
      applyHouseSaleDataToForm(c.templateData?.houseSale || {});
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

      let signedDetailsEl = document.getElementById('signedDetailsSection');
      if (isSignedView && !signedDetailsEl) {
        signedDetailsEl = ensureSignedDetailsSection();
      }
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

function getClausePayload() {
  return {
    payment: !!document.querySelector('.toggle-switch[data-clause="payment"]')?.checked,
    liability: !!document.querySelector('.toggle-switch[data-clause="liability"]')?.checked,
    confidentiality: !!document.querySelector('.toggle-switch[data-clause="confidentiality"]')?.checked,
    termination: !!document.querySelector('.toggle-switch[data-clause="termination"]')?.checked,
  };
}

async function findOrCreateClientByEmail(clientEmail) {
  let clientId = null;

  try {
    const lookupRes = await fetch(`${API_BASE}/clients/by-email?email=${encodeURIComponent(clientEmail)}`);
    if (lookupRes.ok) {
      const lookupData = await lookupRes.json();
      clientId = lookupData.user_id;
      const clientNameEl = document.getElementById('clientName');
      if (clientNameEl) clientNameEl.value = lookupData.name || '';
      return clientId;
    }
  } catch (_) {
    // Best effort lookup; fallback path auto-registers.
  }

  const namePart = clientEmail.split('@')[0].replace(/[._\-]+/g, ' ');
  const derivedName = namePart.replace(/\b\w/g, (ch) => ch.toUpperCase());
  const autoRes = await fetch(`${API_BASE}/register/client`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: derivedName, email: clientEmail, password: 'client123' }),
  });

  if (!autoRes.ok) {
    const autoErr = await autoRes.json();
    throw new Error(autoErr.detail || 'Could not create client account.');
  }

  const autoData = await autoRes.json();
  clientId = autoData.user_id;
  const clientNameEl = document.getElementById('clientName');
  if (clientNameEl) clientNameEl.value = autoData.name || derivedName;
  showToast('Client account auto-created. Default password: client123', 'info');
  return clientId;
}

async function handleSubmit(type, collectFn, sendForSignature = true) {
  const enforcedType = String(type || getActiveContractType() || 'custom').trim().toLowerCase();
  const houseSaleContract = isHouseSaleType(enforcedType);
  const creatorSignature = getCreatorSignatureValue();
  const validation = houseSaleContract ? validateHouseSale() : validateGenericForm();

  if (!validation.isValid) {
    applyValidationErrors(validation.errors);
    showToast('Please correct the highlighted fields.', 'warning');
    return;
  }

  if (sendForSignature && !creatorSignature) {
    showToast('Please sign the contract before sending.', 'warning');
    return;
  }

  const userId = localStorage.getItem('user_id');
  if (!userId) {
    showToast('You must be logged in to create a contract.', 'error');
    window.location.href = './user-login.html';
    return;
  }

  let clientId;
  try {
    clientId = await findOrCreateClientByEmail(validation.data.clientEmail);
  } catch (error) {
    showToast(error.message || 'Could not register client account.', 'error');
    return;
  }

  const collected = typeof collectFn === 'function'
    ? collectFn()
    : (houseSaleContract ? collectHouseSaleTemplateData() : collectGenericFormData());

  const currency = getSelectedCurrency();
  let parsedAmount = 0;
  let parsedDueDate = null;
  let descriptionValue = '';
  let titleValue = '';
  let templateDataPayload = null;

  if (houseSaleContract) {
    const houseSaleData = collected || collectHouseSaleTemplateData();
    parsedAmount = Number(houseSaleData.sale_price || 0);
    parsedDueDate = validation.data.agreementDate || new Date();
    descriptionValue = getTrimmedInputValue('contractDescription')
      || `House sale agreement for ${houseSaleData.property_details || 'property details pending'} between ${houseSaleData.vendor_name || 'Vendor'} and ${houseSaleData.purchaser_name || 'Purchaser'}.`;
    titleValue = getTrimmedInputValue('contractTitle', 'Agreement for Sale of House');
    templateDataPayload = { houseSale: houseSaleData };
  } else {
    parsedAmount = validation.data.amountValue;
    parsedDueDate = parseContractDate(validation.data.dueDateText);
    descriptionValue = getTrimmedInputValue('contractDescription');
    titleValue = validation.data.title;
  }

  if (!parsedDueDate) {
    showToast('Please provide a valid due date.', 'warning');
    return;
  }

  const payload = {
    title: titleValue,
    type: enforcedType,
    description: descriptionValue,
    amount: parsedAmount,
    currency,
    dueDate: parsedDueDate.toISOString(),
    clauses: getClausePayload(),
    userId,
    clientId,
    creator_signature: creatorSignature || null,
    templateData: houseSaleContract ? templateDataPayload : null,
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

    localStorage.removeItem('selected_contract_id');
    localStorage.removeItem('contract_page_mode');

    clearDraft(enforcedType);
    const successMessage = sendForSignature
      ? `Contract sent to ${validation.data.clientEmail}`
      : (isEditingContract ? 'Draft updated successfully' : 'Draft saved successfully');
    showToast(successMessage, 'success');
    setTimeout(() => { window.location.href = './user-dashboard.html'; }, 1200);
  } catch (err) {
    console.error(err);
    showToast('Could not reach the server.', 'error');
  }
}

async function submitContract(sendForSignature = true) {
  const contractType = getActiveContractType() || 'custom';
  const collectFn = isHouseSaleType(contractType) ? collectHouseSaleTemplateData : collectGenericFormData;
  await handleSubmit(contractType, collectFn, sendForSignature);
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
      if (isHouseSaleType(c.type)) {
        const houseSale = c.templateData?.houseSale || {};
        const salePrice = formatContractAmount(houseSale.sale_price, c.currency || DEFAULT_CURRENCY, DEFAULT_CURRENCY);
        const earnestMoney = houseSale.earnest_money_amount != null
          ? formatContractAmount(houseSale.earnest_money_amount, c.currency || DEFAULT_CURRENCY, DEFAULT_CURRENCY)
          : 'N/A';
        const witness1 = toTitleCase(houseSale.witness_1_name || '');
        const witness2 = toTitleCase(houseSale.witness_2_name || '');
        const showWitnesses = Boolean(witness1 || witness2);

        let html = '<h2>AGREEMENT FOR SALE OF A HOUSE</h2>';
        html += `<h3>${escapeHtml(c.title || 'Agreement for Sale of House')}</h3>`;
        html += `<p>THIS AGREEMENT of sale made at ${escapeHtml(houseSale.agreement_place || 'N/A')} on ${escapeHtml(formatLongDate(houseSale.agreement_date) || 'N/A')}, between ${escapeHtml(houseSale.vendor_name || 'N/A')} resident of ${escapeHtml(houseSale.vendor_residence || 'N/A')} hereinafter called the vendor of the ONE PART and ${escapeHtml(houseSale.purchaser_name || 'N/A')} resident of ${escapeHtml(houseSale.purchaser_residence || 'N/A')} hereinafter called the purchaser of the OTHER PART.</p>`;
        html += '<p>WHEREAS the vendor is absolutely seized and possessed of or well and sufficiently entitled to the house more fully described in the Schedule hereunder:</p>';
        html += '<p>AND WHEREAS the vendor has agreed to sell his house to the purchaser on the terms and conditions hereafter set-forth.</p>';
        html += '<p><strong>NOW THIS AGREEMENT WITNESSETH AS FOLLOWS</strong></p>';
        html += `<p><strong>(1)</strong> The vendor will sell and the purchaser will purchase that entire house more particularly described in the Schedule hereunder written at a price of ${escapeHtml(salePrice)} free from all encumbrances.</p>`;
        html += `<p><strong>(2)</strong> The purchaser has paid a sum of ${escapeHtml(earnestMoney)} as earnest money (the receipt of which sum, the vendor hereby acknowledges) and the balance amount of consideration will be paid at the time of execution of conveyance deed.</p>`;
        html += `<p><strong>(3)</strong> The sale shall be completed within a period of ${escapeHtml(String(houseSale.completion_period_months || 'N/A'))} months from this date and it is hereby agreed that time is the essence of the contract.</p>`;
        html += '<p><strong>(4)</strong> The vendor shall submit the title deeds of the house in his possession or power to the purchaser\'s advocate within one week from the date of this agreement for investigation of title and the purchaser will intimate about his advocate\'s report within reasonable time after delivery of title deeds.</p>';
        html += '<p><strong>(5)</strong> If the purchaser\'s advocate gives the report that the vendor\'s title is not clear, the vendor shall refund the earnest money, without interest, to the purchaser within reasonable time from intimation of such report. If the vendor does not refund the earnest money within such time, the vendor shall be liable for applicable interest up to the date of repayment of earnest money.</p>';
        html += '<p><strong>(6)</strong> The vendor declares that the sale of the house will be without encumbrances.</p>';
        html += '<p><strong>(7)</strong> The vendor will hand over the vacant possession of the house on the execution and registration of conveyance deed.</p>';
        html += '<p><strong>(8)</strong> If the purchaser commits breach of the agreement, the vendor shall be entitled to forfeit the earnest money paid by the purchaser to the vendor and the vendor will be at liberty to resell the property to any person.</p>';
        html += '<p><strong>(9)</strong> If the vendor commits breach of the agreement, he shall be liable to refund earnest money received by him and liquidated damages as may be determined under applicable law.</p>';
        html += '<p><strong>(10)</strong> The vendor shall execute the conveyance deed in favour of the purchaser or his nominee as the purchaser may require, on receipt of the balance consideration.</p>';
        html += '<p><strong>(11)</strong> The vendor shall at his own costs obtain statutory clearances and permissions required for completion of the sale.</p>';
        html += '<p><strong>(12)</strong> The expenses for preparation of the conveyance deed, cost of stamp, registration charges and all other out-of-pocket expenses shall be borne by the purchaser.</p>';
        html += '<h3>SCHEDULE OF PROPERTY</h3>';
        html += `<p><strong>Detailed description:</strong> ${escapeHtml(houseSale.property_details || 'N/A')}</p>`;
        html += '<h3>EXECUTION</h3>';
        html += '<p>IN WITNESS WHEREOF the parties have set their hands to this Agreement on the day and year first hereinabove written.</p>';
        html += buildPreviewSignatureGrid({
          creatorName: houseSale.vendor_name || c.userName || c.userEmail || 'Vendor',
          clientName: houseSale.purchaser_name || c.clientName || c.clientEmail || 'Purchaser',
          creatorSignature,
          clientSignature,
          creatorLabel: 'Vendor Signature',
          clientLabel: 'Purchaser Signature',
          creatorPendingLabel: 'Pending vendor signature',
          clientPendingLabel: 'Pending purchaser signature',
        });
        if (showWitnesses) {
          html += `<h3>WITNESSES</h3>${witness1 ? `<p>1. ${escapeHtml(witness1)}</p>` : ''}${witness2 ? `<p>2. ${escapeHtml(witness2)}</p>` : ''}`;
        }
        previewContent.innerHTML = html;
      } else {
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

  const signerNameField = document.getElementById('signerName');
  const signerEmailField = document.getElementById('signerEmail');
  const agreeTermsField = document.getElementById('agreeTerms');
  const signerName = signerNameField ? signerNameField.value.trim() : '';
  const signerEmail = signerEmailField ? signerEmailField.value.trim() : '';
  const agreeTerms = !!(agreeTermsField && agreeTermsField.checked);

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

  ensureSignedDetailsSection();

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
