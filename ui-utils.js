/* Shared async feedback. No persistence, network access or automatic retries. */
export function listenAsync(target, eventName, handler) {
  if (!target) return;
  target.addEventListener(eventName, async event => {
    const control = event.type === 'submit' ? target : event.target.closest('button');
    if (!control) return handler(event);
    if (event.type === 'submit') event.preventDefault();
    if (control.getAttribute('aria-busy') === 'true') return;
    const buttons = control.tagName === 'FORM' ? [...control.querySelectorAll('button[type=submit]')] : [control];
    const states = buttons.map(button => [button, button.disabled]);
    control.setAttribute('aria-busy', 'true');
    states.forEach(([button]) => { button.disabled = true; });
    try { await handler(event); }
    finally {
      control.removeAttribute('aria-busy');
      states.forEach(([button, disabled]) => { button.disabled = disabled; });
    }
  });
}

export function localDate(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
