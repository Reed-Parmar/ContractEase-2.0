// Refactor Summary:
// - Moved shared page-level UI behavior out of HTML
// - Centralized dashboard tab switching and mobile menu handling

function setupDashboardChrome() {
  const tabs = document.querySelectorAll('.dashboard-tab');
  const sections = document.querySelectorAll('.dashboard-section');
  const tabList = tabs.length ? tabs[0].parentElement : null;

  if (tabList) {
    tabList.setAttribute('role', 'tablist');
  }

  const activateTab = (tab) => {
    tabs.forEach((t) => {
      t.classList.remove('active');
      t.setAttribute('aria-selected', 'false');
      t.setAttribute('tabindex', '-1');
    });
    sections.forEach((section) => section.classList.remove('active'));

    tab.classList.add('active');
    tab.setAttribute('aria-selected', 'true');
    tab.setAttribute('tabindex', '0');

    const target = tab.getAttribute('data-target');
    if (target) {
      tab.setAttribute('aria-controls', target);
      const section = document.getElementById(target);
      if (section) {
        section.classList.add('active');
      }
    }
  };

  tabs.forEach((tab, index) => {
    tab.setAttribute('role', 'tab');
    tab.setAttribute('aria-selected', tab.classList.contains('active') ? 'true' : 'false');
    tab.setAttribute('tabindex', tab.classList.contains('active') ? '0' : '-1');
    const target = tab.getAttribute('data-target');
    if (target) {
      tab.setAttribute('aria-controls', target);
    }

    tab.addEventListener('click', () => {
      activateTab(tab);
    });

    tab.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
        event.preventDefault();
        const nextIndex = (index + 1) % tabs.length;
        const nextTab = tabs[nextIndex];
        nextTab.focus();
      } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
        event.preventDefault();
        const prevIndex = (index - 1 + tabs.length) % tabs.length;
        const prevTab = tabs[prevIndex];
        prevTab.focus();
      } else if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        activateTab(tab);
        tab.focus();
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
