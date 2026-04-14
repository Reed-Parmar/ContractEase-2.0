// Refactor Summary:
// - Moved shared page-level UI behavior out of HTML
// - Centralized dashboard tab switching and mobile menu handling

function setupDashboardChrome() {
  const tabs = document.querySelectorAll('.dashboard-tab');
  const sections = document.querySelectorAll('.dashboard-section');

  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      tabs.forEach((t) => t.classList.remove('active'));
      sections.forEach((section) => section.classList.remove('active'));

      tab.classList.add('active');
      const target = tab.getAttribute('data-target');
      if (target && document.getElementById(target)) {
        document.getElementById(target).classList.add('active');
      }
    });
  });

  const mobileBtn = document.getElementById('mobileMenuBtn');
  if (mobileBtn) {
    mobileBtn.addEventListener('click', () => {
      const menu = document.getElementById('navbarMenu');
      if (!menu) return;
      menu.classList.toggle('active');
      const isActive = menu.classList.contains('active');
      mobileBtn.setAttribute('aria-expanded', isActive ? 'true' : 'false');
      menu.setAttribute('aria-hidden', isActive ? 'false' : 'true');
    });
  }
}

document.addEventListener('DOMContentLoaded', setupDashboardChrome);
