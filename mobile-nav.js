/* Responsive navigation. No account reads or background requests. */
(() => {
  const header = document.querySelector('.top');
  const nav = header?.querySelector('.nav');
  if (!header || !nav || header.querySelector('.mobile-nav-panel')) return;
  const page = (location.pathname.split('/').pop() || 'index.html').toLowerCase();
  const home = page === 'index.html' ? '' : 'index.html';
  const menuMedia = matchMedia('(max-width: 1100px)');
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'btn btn-dark mobile-menu mobile-menu-toggle';
  toggle.setAttribute('aria-expanded', 'false');
  toggle.setAttribute('aria-controls', 'mobile-site-nav');
  toggle.setAttribute('aria-label', 'Open navigation');
  toggle.textContent = 'Menu';
  const previous = nav.querySelector('.mobile-menu');
  if (previous) previous.replaceWith(toggle); else nav.append(toggle);
  const panel = document.createElement('div');
  panel.className = 'mobile-nav-panel';
  panel.id = 'mobile-site-nav';
  panel.hidden = true;
  panel.innerHTML = `<div class="mobile-nav-heading">Find your next step</div>
    <nav class="mobile-nav-links" aria-label="Mobile navigation">
      <a href="index.html">Home</a><a href="${home}#programs">Programs</a>
      <a href="${home}#schedule">Schedule</a><a href="${home}#pricing">Pricing</a>
      <a href="${home}#coaches">Coaches</a><a href="story.html">Our Story</a>
      <a href="${home}#location">Location</a><a href="waiver.html">Waiver</a>
      <a href="members.html">Member Login</a><a href="enroll.html">Join Red Road</a>
      <a class="mobile-nav-primary" href="waiver.html?trial=1">Try one class free <span aria-hidden="true">↗</span></a>
    </nav><p class="mobile-nav-note">Lone Grove, Oklahoma · All levels welcome</p>`;
  header.append(panel);
  const backdrop = document.createElement('div');
  backdrop.className = 'nav-backdrop';
  backdrop.hidden = true;
  backdrop.setAttribute('aria-hidden', 'true');
  header.after(backdrop);
  let inertElements = [];
  let priorOverflow = '';
  let priorRootOverflow = '';
  const close = (restoreFocus = false) => {
    if (panel.hidden) return;
    panel.hidden = true;
    backdrop.hidden = true;
    panel.classList.remove('is-open');
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-label', 'Open navigation');
    toggle.textContent = 'Menu';
    document.body.classList.remove('navigation-open');
    document.body.style.overflow = priorOverflow;
    document.documentElement.style.overflow = priorRootOverflow;
    inertElements.forEach(([el, original]) => { el.inert = original; });
    inertElements = [];
    if (restoreFocus) toggle.focus({ preventScroll: true });
  };
  toggle.addEventListener('click', () => {
    if (!panel.hidden) return close(true);
    priorOverflow = document.body.style.overflow;
    priorRootOverflow = document.documentElement.style.overflow;
    inertElements = [...document.querySelectorAll('main, footer, .mobile-action-bar, .scroll-rail, .skip-link')]
      .filter(el => !header.contains(el)).map(el => [el, el.inert]);
    inertElements.forEach(([el]) => { el.inert = true; });
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    document.body.classList.add('navigation-open');
    panel.hidden = false;
    backdrop.hidden = false;
    panel.classList.add('is-open');
    toggle.setAttribute('aria-expanded', 'true');
    toggle.setAttribute('aria-label', 'Close navigation');
    toggle.textContent = 'Close';
    panel.querySelector('a').focus({ preventScroll: true });
  });
  panel.addEventListener('click', event => { if (event.target.closest('a')) close(); });
  backdrop.addEventListener('click', () => close(true));
  document.addEventListener('keydown', event => {
    if (panel.hidden) return;
    if (event.key === 'Escape') { event.preventDefault(); close(true); }
    if (event.key === 'Tab') {
      const focusable = [toggle, ...panel.querySelectorAll('a')];
      const index = focusable.indexOf(document.activeElement);
      if (event.shiftKey && index <= 0) { event.preventDefault(); focusable.at(-1).focus(); }
      else if (!event.shiftKey && (index === focusable.length - 1 || index === -1)) { event.preventDefault(); toggle.focus(); }
    }
  });
  menuMedia.addEventListener('change', () => { if (!menuMedia.matches) close(); });
  addEventListener('pagehide', () => close());
  addEventListener('pageshow', () => close());
  if (page === 'index.html' || page === 'story.html' || page.startsWith('jiu-jitsu-')) {
    const actionBar = document.createElement('nav');
    actionBar.className = 'mobile-action-bar';
    actionBar.setAttribute('aria-label', 'Quick actions');
    actionBar.innerHTML = `<a class="mobile-action-link mobile-action-primary" href="enroll.html" data-account-link>Sign Up</a>`;
    document.body.append(actionBar);
    document.body.classList.add('has-mobile-action-bar');
    import('./account-nav.js?v=56').then(module => module.bindAccountNavigation()).catch(() => {
      // Keep public links usable if authentication cannot be reached.
    });
  }
  const updateCurrent = () => {
    document.querySelectorAll('.mobile-nav-links a, .mobile-action-link').forEach(link => {
      const target = new URL(link.href, location.href);
      const current = target.pathname === location.pathname && target.hash === location.hash && target.search === location.search;
      link.classList.toggle('is-active', current);
      if (current) link.setAttribute('aria-current', target.hash ? 'location' : 'page');
      else link.removeAttribute('aria-current');
    });
  };
  addEventListener('hashchange', updateCurrent);
  updateCurrent();
})();
