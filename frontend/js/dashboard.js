// Dashboard Handler

document.addEventListener('DOMContentLoaded', () => {
  // Mobile menu toggle
  const mobileMenuToggle = document.getElementById('mobileMenuToggle');
  const navbarMenu = document.getElementById('navbarMenu');

  if (mobileMenuToggle && navbarMenu) {
    mobileMenuToggle.addEventListener('click', () => {
      navbarMenu.classList.toggle('active');
    });

    // Close menu when clicking on a link
    document.querySelectorAll('.navbar-menu .navbar-link').forEach((link) => {
      link.addEventListener('click', () => {
        navbarMenu.classList.remove('active');
      });
    });
  }

  // Logout functionality
  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      if (confirm('Are you sure you want to sign out?')) {
        localStorage.clear();
        // Determine which login page to go to based on role
        const userRole = localStorage.getItem('user_role') || 'user';
        const loginPage = userRole === 'client' ? './client-login.html' : './user-login.html';
        window.location.href = loginPage;
      }
    });
  }

  // Add edit/view handlers for contract cards
  const editButtons = document.querySelectorAll('.edit-contract-btn');
  const viewButtons = document.querySelectorAll('.view-contract-btn');

  editButtons.forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const contractCard = e.target.closest('.contract-card');
      const contractTitle = contractCard.querySelector('.contract-title').textContent;
      console.log('Editing contract:', contractTitle);
      // Navigate to create contract page or open editor
      window.location.href = './create-contract.html';
    });
  });

  viewButtons.forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const contractCard = e.target.closest('.contract-card');
      const contractTitle = contractCard.querySelector('.contract-title').textContent;
      console.log('Viewing contract:', contractTitle);
      // In a real app, open contract details in modal or new page
    });
  });

  // Sign/Decline handlers for client dashboard
  const sendReminderBtns = document.querySelectorAll('.btn-secondary');
  sendReminderBtns.forEach((btn) => {
    if (btn.textContent.includes('Send Reminder')) {
      btn.addEventListener('click', (e) => {
        const contractCard = e.target.closest('.contract-card');
        const contractTitle = contractCard.querySelector('.contract-title').textContent;
        console.log('Reminder sent for:', contractTitle);
        alert('Reminder sent to client');
      });
    }
  });

  // Handle contract signing
  const reviewSignButtons = document.querySelectorAll('.btn-secondary');
  reviewSignButtons.forEach((btn) => {
    if (btn.textContent.includes('Review & Sign')) {
      btn.addEventListener('click', (e) => {
        const contractCard = e.target.closest('.contract-card');
        const contractTitle = contractCard.querySelector('.contract-title').textContent;
        console.log('Reviewing contract for signature:', contractTitle);
        window.location.href = './sign-contract.html';
      });
    }
  });

  // Download buttons
  const downloadBtns = document.querySelectorAll('.btn-outline');
  downloadBtns.forEach((btn) => {
    if (btn.textContent.includes('Download')) {
      btn.addEventListener('click', (e) => {
        const contractCard = e.target.closest('.contract-card');
        const contractTitle = contractCard.querySelector('.contract-title').textContent;
        console.log('Downloading contract:', contractTitle);
        alert('Contract downloaded: ' + contractTitle + '.pdf');
      });
    }
  });

  // Set user name in welcome message
  const userName = localStorage.getItem('user_name') || 'User';
  const welcomeMessage = document.querySelector('.welcome-message');
  if (welcomeMessage && welcomeMessage.textContent.includes('!')) {
    welcomeMessage.textContent = `Welcome back, ${capitalizeFirstLetter(userName)}!`;
  }

  // Check if user is authenticated
  if (!localStorage.getItem('user_email')) {
    console.log('No user session found, redirecting to login');
    window.location.href = './user-login.html';
  }
});

// Helper function
function capitalizeFirstLetter(string) {
  return string.charAt(0).toUpperCase() + string.slice(1);
}

// Mock data for contracts
const contractsData = {
  draft: [
    {
      id: 1,
      title: 'Service Agreement',
      date: 'Jan 15, 2024',
      client: 'Acme Corp',
      amount: '$5,000',
      due: 'Feb 15, 2024',
      status: 'Draft',
    },
    {
      id: 2,
      title: 'NDA Agreement',
      date: 'Jan 10, 2024',
      client: 'TechStart Inc',
      amount: 'Confidential',
      due: 'Jan 25, 2024',
      status: 'Draft',
    },
  ],
  pending: [
    {
      id: 3,
      title: 'Consulting Agreement',
      date: 'Jan 5, 2024',
      client: 'Global Solutions',
      amount: '$8,500',
      due: 'Jan 20, 2024',
      status: 'Pending',
    },
  ],
  signed: [
    {
      id: 4,
      title: 'Website Development',
      date: 'Jan 3, 2024',
      client: 'Creative Labs',
      amount: '$12,000',
      due: 'Jan 3, 2024',
      status: 'Signed',
    },
    {
      id: 5,
      title: 'Maintenance Services',
      date: 'Dec 28, 2023',
      client: 'FinanceHub',
      amount: '$3,000/month',
      due: 'Dec 28, 2023',
      status: 'Signed',
    },
  ],
};

// API simulation
const dashboardAPI = {
  getContracts: async (status) => {
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve(contractsData[status] || []);
      }, 100);
    });
  },

  deleteContract: async (contractId) => {
    console.log('[API] Delete contract:', contractId);
    return { success: true };
  },

  updateContractStatus: async (contractId, status) => {
    console.log('[API] Update contract status:', contractId, status);
    return { success: true };
  },
};
