(() => {
  const banner = document.getElementById('veterans-announcement');
  const dialog = document.getElementById('veterans-dialog');
  const opener = document.getElementById('veterans-open');
  if (!banner || !dialog || !opener) return;
  // November 2026 only, using the gym's Oklahoma time zone.
  const active = () => {
    const date = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Chicago', year: 'numeric', month: '2-digit'
    }).formatToParts(new Date());
    return date.find(p => p.type === 'year').value === '2026' &&
      date.find(p => p.type === 'month').value === '11';
  };
  let previousOverflow;
  const refresh = () => {
    banner.hidden = !active();
    if (banner.hidden && dialog.open) dialog.close();
  };
  opener.addEventListener('click', () => {
    refresh();
    if (banner.hidden || dialog.open) return;
    previousOverflow = document.body.style.overflow;
    dialog.showModal();
    document.body.style.overflow = 'hidden';
    dialog.querySelector('.veterans-dialog-content').scrollTop = 0;
    document.getElementById('veterans-close').focus();
  });
  document.getElementById('veterans-close').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const box = dialog.getBoundingClientRect();
    if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) dialog.close();
  });
  dialog.addEventListener('close', () => {
    document.body.style.overflow = previousOverflow || '';
    if (!banner.hidden) opener.focus();
  });
  document.addEventListener('visibilitychange', refresh);
  setInterval(refresh, 60000);
  refresh();
})();
