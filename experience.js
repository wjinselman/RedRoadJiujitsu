/* Small progressive enhancements; core links/forms remain usable without this file. */
(() => {
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const behavior = () => reducedMotion.matches ? 'auto' : 'smooth';
  const main = document.querySelector('main');
  if (main) {
    if (!main.id) main.id = 'main-content';
    main.tabIndex = -1;
    const skip = document.createElement('a');
    skip.className = 'skip-link';
    skip.href = `#${main.id}`;
    skip.textContent = 'Skip to content';
    document.body.prepend(skip);
  }

  document.querySelectorAll('input[type=email]').forEach(input => {
    input.autocapitalize = 'none'; input.spellcheck = false; input.inputMode = 'email';
  });
  document.querySelectorAll('input[type=password]').forEach(input => {
    // Do not reveal a front-desk member's PIN on the shared kiosk.
    if (input.id === 'kiosk-pin') return;
    const wrap = document.createElement('div');
    wrap.className = 'password-field';
    input.before(wrap);
    wrap.append(input);
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'password-toggle';
    button.textContent = 'Show';
    button.setAttribute('aria-label', `Show ${input.labels?.[0]?.textContent.trim() || 'password'}`);
    button.setAttribute('aria-pressed', 'false');
    button.setAttribute('aria-controls', input.id);
    button.addEventListener('click', () => {
      const show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      button.textContent = show ? 'Hide' : 'Show';
      button.setAttribute('aria-pressed', String(show));
      button.setAttribute('aria-label', `${show ? 'Hide' : 'Show'} ${input.labels?.[0]?.textContent.trim() || 'password'}`);
    });
    input.form?.addEventListener('reset', () => {
      input.type = 'password'; button.textContent = 'Show'; button.setAttribute('aria-pressed', 'false');
      button.setAttribute('aria-label', `Show ${input.labels?.[0]?.textContent.trim() || 'password'}`);
    });
    wrap.append(button);
  });
  const confirmations = [['password', 'confirmPassword'], ['staff-new-password', 'staff-confirm-password']];
  confirmations.forEach(([firstId, secondId]) => {
    const first = document.getElementById(firstId), second = document.getElementById(secondId);
    if (!first || !second) return;
    const validate = () => second.setCustomValidity(second.value && first.value !== second.value ? 'The passwords do not match.' : '');
    first.addEventListener('input', validate); second.addEventListener('input', validate);
  });

  document.querySelectorAll('.flash-message,.flow-success').forEach(message => {
    message.setAttribute('role', 'status');
    message.setAttribute('aria-live', 'polite');
    message.setAttribute('aria-atomic', 'true');
  });
  // Fail closed when an Auth module/CDN fails to load. Never let a credentials
  // form fall back to a native GET that puts its fields into the URL.
  document.addEventListener('submit', event => {
    if (!event.target.matches('form[data-service-form]') || event.target.dataset.serviceReady === 'true') return;
    event.preventDefault(); event.stopImmediatePropagation();
    let notice = event.target.querySelector('.service-wait-message');
    if (!notice) {
      notice = document.createElement('p'); notice.className = 'flash-message service-wait-message';
      notice.setAttribute('role', 'alert'); notice.dataset.tone = 'error'; event.target.append(notice);
    }
    notice.textContent = 'The secure form is still connecting. Check your connection and refresh before trying again. Nothing was submitted.';
  }, true);
  const offline = document.createElement('div');
  offline.className = 'offline-notice'; offline.setAttribute('role', 'status'); offline.hidden = true;
  offline.textContent = 'You appear to be offline. Reconnect before signing in, submitting a form or saving changes.';
  (document.querySelector('.top') || document.querySelector('.kiosk-header'))?.after(offline);
  const updateConnection = () => { offline.hidden = navigator.onLine !== false; };
  addEventListener('online', updateConnection); addEventListener('offline', updateConnection); updateConnection();

  // Status messages are announced by aria-live without moving the viewport.
  const panelPairs = [
    ['toggle-member-profile', 'member-profile-panel'], ['toggle-change-password', 'change-password-panel'],
    ['toggle-add-member', 'add-member-panel'], ['toggle-add-owner', 'add-owner-panel'], ['toggle-add-kiosk', 'add-kiosk-panel']
  ];
  panelPairs.forEach(([buttonId, panelId]) => {
    const button = document.getElementById(buttonId), panel = document.getElementById(panelId);
    if (!button || !panel) return;
    button.setAttribute('aria-controls', panelId);
    new MutationObserver(() => {
      button.setAttribute('aria-expanded', String(!panel.hidden));
      if (!panel.hidden && !matchMedia('(pointer: coarse)').matches) panel.querySelector('input:not([type=hidden]),select')?.focus({ preventScroll: true });
    }).observe(panel, { attributes: true, attributeFilter: ['hidden'] });
  });

  const gallery = document.querySelector('.home-page .gallery');
  if (gallery) {
    const figures = [...gallery.querySelectorAll('figure')];
    gallery.tabIndex = 0;
    gallery.setAttribute('aria-label', 'Training photos. Swipe or use the arrow buttons to browse.');
    const toolbar = document.createElement('div'); toolbar.className = 'gallery-toolbar';
    toolbar.innerHTML = '<p><span class="gallery-position">1</span> / ' + figures.length + ' <span aria-hidden="true">·</span> Life on the mats</p><div class="gallery-controls"><button type="button" aria-label="Previous training photo">←</button><button type="button" aria-label="Next training photo">→</button></div>';
    gallery.after(toolbar);
    const [previous, next] = toolbar.querySelectorAll('button');
    let index = 0;
    const update = () => {
      index = figures.reduce((best, figure, i) => Math.abs(figure.offsetLeft - figures[0].offsetLeft - gallery.scrollLeft) < Math.abs(figures[best].offsetLeft - figures[0].offsetLeft - gallery.scrollLeft) ? i : best, 0);
      toolbar.querySelector('.gallery-position').textContent = String(index + 1);
      previous.disabled = index === 0; next.disabled = index === figures.length - 1;
    };
    const move = delta => {
      const figure = figures[Math.max(0, Math.min(figures.length - 1, index + delta))];
      gallery.scrollTo({ left: figure.offsetLeft - figures[0].offsetLeft, behavior: behavior() });
    };
    previous.addEventListener('click', () => move(-1)); next.addEventListener('click', () => move(1));
    gallery.addEventListener('keydown', event => {
      if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
      event.preventDefault(); move(event.key === 'ArrowRight' ? 1 : -1);
    });
    gallery.addEventListener('scroll', update, { passive: true });
    addEventListener('resize', update, { passive: true }); update();
  }
})();

(() => {
 if (!document.body.classList.contains('home-page') || !('IntersectionObserver' in window)) return;
 document.body.classList.add('defer-program-photos');
 const observer = new IntersectionObserver(entries => entries.forEach(entry => {
   if (entry.isIntersecting) { entry.target.classList.add('photo-ready'); observer.unobserve(entry.target); }
 }), {rootMargin:'500px 0px'});
 document.querySelectorAll('.program-card').forEach(card => observer.observe(card));
})();
