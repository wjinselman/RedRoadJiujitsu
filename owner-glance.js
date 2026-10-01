/* Read-only presentation: reuse authoritative dashboard outputs, with no extra database reads. */
(() => {
  const byId = id => document.getElementById(id);
  if (!byId('gym-glance-title')) return;
  const text = id => byId(id)?.textContent.trim() || '';
  const number = value => /^\d+(?:%|\b)/.test(value) ? value.match(/^\d+%?/)[0] : '—';
  const fields = {active:'stat-active-count',paid:'stat-paid-percent',due:'stat-past-due',pending:'stat-pending',trials:'stat-trials-note',today:'attendance-today-count'};
  const edit = byId('quick-edit-update');
  function render() {
    const rosterReady = number(text('stat-members')) !== '—';
    for (const [key, source] of Object.entries(fields)) {
      const ready = !['active','paid','due','pending'].includes(key) || rosterReady;
      const value = ready ? number(text(source)) : '—';
      byId('glance-' + key).textContent = value;
      byId('glance-' + key).parentElement.dataset.attention = String(['due','pending','trials'].includes(key) && Number(value) > 0);
    }
    edit.hidden = !byId('staff-updates-link') || byId('staff-updates-link').hidden;
    byId('glance-load-note').textContent = rosterReady
      ? 'Use Refresh for the latest figures. Load more records in the sections below when available. A dash means that figure is not loaded or unavailable.'
      : 'Waiting for roster data. A dash means not loaded or unavailable—not zero.';
  }
  edit.addEventListener('click', () => {
    const link = byId('staff-updates-link');
    if (!link || link.hidden) return;
    link.click(); // Use the existing section navigation and permission checks.
    const title = byId('weekly-editor-title');
    if (title && title.getClientRects().length) title.focus({preventScroll:true});
  });
  const observer = new MutationObserver(render);
  const sources = new Set([...Object.values(fields),'stat-members','staff-updates-link']);
  for (const id of sources) {
    const node = byId(id);
    if (node) observer.observe(node,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:['hidden']});
  }
  render();
})();
