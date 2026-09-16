/* Presentation only: preserve every existing form, control, and role boundary. */
(() => {
  const sections = [
    ['staff-members', 'Members', true],
    ['staff-trials', 'Trial Requests', false],
    ['staff-attendance', 'Attendance', false],
    ['staff-waivers', 'Signed Waivers', false],
    ['staff-settings', 'Settings', false],
    ['developer-access-card', 'Developer Access', false]
  ];
  const controls = new Map();
  for (const [id, title, initiallyOpen] of sections) {
    const card = document.getElementById(id);
    if (!card || card.dataset.collapsibleReady) continue;
    card.dataset.collapsibleReady = 'true';
    card.classList.add('dashboard-collapsible');
    const content = document.createElement('div');
    content.id = id + '-content';
    content.className = 'dashboard-section-content';
    // Move nodes rather than cloning them so existing listeners and form state survive.
    while (card.firstChild) content.appendChild(card.firstChild);
    const heading = document.createElement('h2');
    heading.className = 'dashboard-section-heading';
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'dashboard-section-toggle';
    button.setAttribute('aria-controls', content.id);
    const label = document.createElement('span');
    label.textContent = title;
    const indicator = document.createElement('span');
    indicator.className = 'dashboard-section-indicator';
    indicator.setAttribute('aria-hidden', 'true');
    button.append(label, indicator);
    heading.appendChild(button);
    card.append(heading, content);
    const setOpen = open => {
      content.hidden = !open;
      button.setAttribute('aria-expanded', String(open));
      indicator.textContent = open ? '−' : '+';
    };
    setOpen(initiallyOpen);
    controls.set(id, { card, setOpen });
    button.addEventListener('click', () => setOpen(content.hidden));
  }
  function revealHash() {
    const id = location.hash.slice(1);
    const target = document.getElementById(id);
    const card = target?.closest('.dashboard-collapsible');
    if (card && !card.hidden) controls.get(card.id)?.setOpen(true);
  }
  document.querySelectorAll('.staff-section-nav a[href^="#"]').forEach(link => {
    link.addEventListener('click', () => {
      const section = controls.get(link.getAttribute('href').slice(1));
      if (section && !section.card.hidden) section.setOpen(true);
    });
  });
  window.addEventListener('hashchange', revealHash);
  revealHash();
  // Existing member/trial actions open a waiver in a different section.
  // Reveal it after its hidden attribute changes, then scroll to the actual record.
  for (const id of ['owner-waiver-panel', 'edit-member-panel']) {
    const panel = document.getElementById(id);
    if (!panel) continue;
    new MutationObserver(() => {
      if (panel.hidden) return;
      const card = panel.closest('.dashboard-collapsible');
      if (!card || card.hidden) return;
      controls.get(card.id)?.setOpen(true);
      panel.scrollIntoView({ behavior: 'auto', block: 'nearest' });
    }).observe(panel, { attributes: true, attributeFilter: ['hidden'] });
  }
})();
