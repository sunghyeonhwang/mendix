// Theme toggle functionality
(function () {
  var toggle = document.getElementById('themeToggle');
  var root = document.documentElement;

  // Check saved preference or system preference
  var saved = localStorage.getItem('theme');
  if (saved) {
    root.setAttribute('data-theme', saved);
  } else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
    root.setAttribute('data-theme', 'dark');
  }

  if (toggle) {
    toggle.addEventListener('click', function () {
      var current = root.getAttribute('data-theme');
      var next = current === 'dark' ? 'light' : 'dark';
      root.setAttribute('data-theme', next);
      localStorage.setItem('theme', next);
    });
  }
})();

// Sidebar toggle (mobile/tablet collapsible curriculum)
(function () {
  var toggleBtn = document.getElementById('sidebarToggle');
  var content = document.getElementById('sidebarContent');

  if (toggleBtn && content) {
    toggleBtn.addEventListener('click', function () {
      var expanded = toggleBtn.getAttribute('aria-expanded') === 'true';
      toggleBtn.setAttribute('aria-expanded', String(!expanded));
      content.classList.toggle('sidebar__content--collapsed', expanded);
    });
  }
})();

// Resume popup dismiss
(function () {
  var popup = document.getElementById('resumePopup');
  var closeBtn = document.getElementById('resumePopupDismiss');
  var secondaryBtn = document.getElementById('resumePopupClose');

  function hidePopup() {
    if (popup) {
      popup.style.display = 'none';
    }
  }

  if (closeBtn) {
    closeBtn.addEventListener('click', hidePopup);
  }
  if (secondaryBtn) {
    secondaryBtn.addEventListener('click', hidePopup);
  }
})();
