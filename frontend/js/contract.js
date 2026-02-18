// Contract Creation & Signing Handler

let currentStep = 1;
let selectedContractType = null;
let isDrawing = false;
let lastX = 0;
let lastY = 0;

document.addEventListener('DOMContentLoaded', () => {
  // Contract Type Selection
  const contractTypeOptions = document.querySelectorAll('.contract-type-option');
  contractTypeOptions.forEach((option) => {
    option.addEventListener('click', () => {
      contractTypeOptions.forEach((opt) => opt.classList.remove('selected'));
      option.classList.add('selected');
      selectedContractType = option.dataset.type;
      console.log('Selected contract type:', selectedContractType);
    });
  });

  // Toggle Switches
  const toggleSwitches = document.querySelectorAll('.toggle-switch');
  toggleSwitches.forEach((toggle) => {
    toggle.addEventListener('click', () => {
      toggle.classList.toggle('active');
      const clause = toggle.dataset.clause;
      console.log('Toggled clause:', clause, toggle.classList.contains('active'));
    });
  });

  // Step Navigation (Create Contract)
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

  // Signature Canvas (Sign Contract)
  const signatureCanvas = document.getElementById('signatureCanvas');
  if (signatureCanvas) {
    const ctx = signatureCanvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;

    // Set canvas size
    const rect = signatureCanvas.getBoundingClientRect();
    signatureCanvas.width = rect.width * dpr;
    signatureCanvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    // Draw on canvas
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

    signatureCanvas.addEventListener('mouseup', () => {
      isDrawing = false;
    });

    signatureCanvas.addEventListener('mouseleave', () => {
      isDrawing = false;
    });

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

    signatureCanvas.addEventListener('touchend', () => {
      isDrawing = false;
    });
  }

  // Clear Signature Button
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
    rejectBtn.addEventListener('click', () => {
      if (confirm('Are you sure you want to decline this contract?')) {
        console.log('Contract declined');
        alert('Contract declined. The other party has been notified.');
        window.location.href = './client-dashboard.html';
      }
    });
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
        localStorage.clear();
        window.location.href = './user-login.html';
      }
    });
  }

  // Set today's date
  const signerDate = document.getElementById('signerDate');
  if (signerDate) {
    const today = new Date().toISOString().split('T')[0];
    signerDate.value = today;
  }
});

// Go to specific step
function goToStep(step) {
  // Hide all steps
  document.querySelectorAll('[id^="step-"]').forEach((el) => {
    el.classList.add('hidden');
  });

  // Show selected step
  const stepElement = document.getElementById(`step-${step}`);
  if (stepElement) {
    stepElement.classList.remove('hidden');
  }

  // Update progress
  document.querySelectorAll('.progress-step').forEach((el) => {
    const stepNum = parseInt(el.dataset.step);
    el.classList.remove('active', 'completed');
    if (stepNum === step) {
      el.classList.add('active');
    } else if (stepNum < step) {
      el.classList.add('completed');
    }
  });

  // Update buttons
  const prevBtn = document.getElementById('prevBtn');
  const nextBtn = document.getElementById('nextBtn');
  const submitBtn = document.getElementById('submitBtn');

  if (prevBtn) prevBtn.style.display = step > 1 ? 'inline-flex' : 'none';
  if (nextBtn) nextBtn.style.display = step < 3 ? 'inline-flex' : 'none';
  if (submitBtn) submitBtn.style.display = step === 3 ? 'inline-flex' : 'none';

  currentStep = step;

  // Update preview on step 3
  if (step === 3) {
    updatePreview();
  }
}

// Update preview with entered data
function updatePreview() {
  const contractTitle = document.getElementById('contractTitle');
  const clientName = document.getElementById('clientName');
  const contractAmount = document.getElementById('contractAmount');
  const dueDate = document.getElementById('dueDate');

  if (contractTitle) {
    document.getElementById('previewTitle').textContent = contractTitle.value || 'Service Agreement';
  }
  if (clientName) {
    document.getElementById('previewClient').textContent = clientName.value || 'Acme Corp';
  }
  if (contractAmount) {
    document.getElementById('previewAmount').textContent = contractAmount.value || '$5,000';
  }
  if (dueDate) {
    document.getElementById('previewDue').textContent = new Date(dueDate.value).toLocaleDateString() || 'February 15, 2024';
  }

  // Set preview date
  const today = new Date();
  document.getElementById('previewDate').textContent = today.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

// Submit contract
function submitContract() {
  const contractTitle = document.getElementById('contractTitle')?.value;
  const clientEmail = document.getElementById('clientEmail')?.value;

  if (!contractTitle || !clientEmail) {
    alert('Please fill in all required fields');
    return;
  }

  console.log('Submitting contract:', {
    title: contractTitle,
    type: selectedContractType,
    clientEmail,
  });

  alert('Contract sent successfully to ' + clientEmail);
  window.location.href = './user-dashboard.html';
}

// Sign contract
function signContract() {
  const signerName = document.getElementById('signerName')?.value;
  const signerEmail = document.getElementById('signerEmail')?.value;
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

  console.log('Contract signed by:', {
    name: signerName,
    email: signerEmail,
    timestamp: new Date(),
  });

  alert('Contract signed successfully! You will receive a confirmation email shortly.');
  window.location.href = './client-dashboard.html';
}

// Contract API
const contractAPI = {
  createContract: async (data) => {
    console.log('[API] Create contract:', data);
    return { success: true, id: 'CT-2024-001' };
  },

  sendContract: async (contractId, clientEmail) => {
    console.log('[API] Send contract:', contractId, 'to', clientEmail);
    return { success: true };
  },

  signContract: async (contractId, signatureData) => {
    console.log('[API] Sign contract:', contractId);
    return { success: true, signedAt: new Date() };
  },

  getContractById: async (contractId) => {
    console.log('[API] Get contract:', contractId);
    return { id: contractId, title: 'Service Agreement' };
  },
};
