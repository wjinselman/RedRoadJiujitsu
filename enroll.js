/* Retired prototype entry point. Current pages use the production module.
   Fail closed for an old cached HTML page; never store credentials or signatures. */
(() => {
  const form = document.getElementById('enroll-form');
  if (!form) return;
  form.addEventListener('submit', event => {
    event.preventDefault(); event.stopImmediatePropagation();
    let notice=document.getElementById('legacy-version-notice');
    if(!notice){notice=document.createElement('p');notice.id='legacy-version-notice';notice.setAttribute('role','alert');form.prepend(notice);}
    notice.textContent='This page version is outdated. Refresh the page before submitting. Nothing was saved.';
  },true);
})();
