// Refactor Summary:
// - Moved landing-page interaction logic out of inline HTML
// - Keeps the page behavior in a reusable JS module

function setupLandingCta() {
  const cta = document.querySelector('.cta-box');
  if (!cta) return;

  cta.addEventListener('mousemove', (e) => {
    const rect = cta.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    cta.style.background = `radial-gradient(circle at ${x}% ${y}%, rgba(255,255,255,0.2), rgba(79,70,229,0.96) 46%, rgba(124,58,237,0.98) 100%)`;
  });

  cta.addEventListener('mouseleave', () => {
    cta.style.background = '';
  });
}

document.addEventListener('DOMContentLoaded', setupLandingCta);
/* ===== ContractEase Landing Page — JS ===== */

(function () {
  'use strict';

  /* ------- Navbar scroll shadow ------- */
  const navbar = document.getElementById('navbar');
  if (navbar) {
    const onScroll = () => {
      navbar.classList.toggle('scrolled', window.scrollY > 12);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll(); // run once on load
  }

  /* ------- Mobile hamburger menu ------- */
  const hamburger  = document.getElementById('hamburger');
  const navLinks   = document.getElementById('nav-links');

  if (hamburger && navLinks) {
    hamburger.addEventListener('click', () => {
      const isOpen = navLinks.classList.toggle('open');
      hamburger.setAttribute('aria-expanded', String(isOpen));
    });

    // Close mobile menu when a nav link is clicked
    navLinks.querySelectorAll('.nav-link').forEach(link => {
      link.addEventListener('click', () => {
        navLinks.classList.remove('open');
        hamburger.setAttribute('aria-expanded', 'false');
      });
    });
  }

  /* ------- Smooth scroll for anchor links ------- */
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
      const target = document.querySelector(this.getAttribute('href'));
      if (target) {
        e.preventDefault();
        const offset = 80; // account for sticky navbar height
        const top = target.getBoundingClientRect().top + window.scrollY - offset;
        window.scrollTo({ top, behavior: 'smooth' });
      }
    });
  });

  /* ------- Fade-in on scroll (IntersectionObserver) ------- */
  const fadeEls = document.querySelectorAll('.fade-in');

  if ('IntersectionObserver' in window && fadeEls.length) {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            entry.target.classList.add('visible');
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: '0px 0px -40px 0px' }
    );

    fadeEls.forEach(el => observer.observe(el));
  } else {
    // Fallback for browsers without IntersectionObserver
    fadeEls.forEach(el => el.classList.add('visible'));
  }

  /* ------- Card stagger animation on scroll ------- */
  const cardGroups = [
    { selector: '.features-grid .card', delay: 80 },
    { selector: '.steps-grid .step',    delay: 100 },
    { selector: '.dual-card',           delay: 120 },
  ];

  if ('IntersectionObserver' in window) {
    cardGroups.forEach(({ selector, delay }) => {
      const cards = document.querySelectorAll(selector);
      cards.forEach((card, i) => {
        card.style.opacity = '0';
        card.style.transform = 'translateY(20px)';
        card.style.transition = `opacity 0.5s ease ${i * delay}ms, transform 0.5s ease ${i * delay}ms`;
      });

      const groupObserver = new IntersectionObserver(
        (entries) => {
          entries.forEach(entry => {
            if (entry.isIntersecting) {
              cards.forEach(card => {
                card.style.opacity = '1';
                card.style.transform = 'translateY(0)';
              });
              groupObserver.disconnect();
            }
          });
        },
        { threshold: 0.08 }
      );

      // Observe the parent container
      if (cards.length) {
        const parent = cards[0].closest('section') || cards[0].parentElement;
        if (parent) groupObserver.observe(parent);
      }
    });
  }

})();
