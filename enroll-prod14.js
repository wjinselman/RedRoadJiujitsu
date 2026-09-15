import { firebaseConfigured, auth, createUserWithEmailAndPassword, signOut } from './firebase-client.js?v=49';

const form = document.querySelector('#enroll-form');
const message = document.querySelector('#enroll-success');
const normalizeEmail = value => String(value || '').trim().toLowerCase();
let submitting = false;

function show(text) {
  message.hidden = false;
  message.dataset.tone = 'error';
  message.textContent = text;
}

function friendlyError(error) {
  const code = error?.code || '';
  if (code.includes('email-already-in-use')) return 'That email already has an account. Use Member Login, or reset the password there.';
  if (code.includes('weak-password')) return 'Use a password with at least 8 characters.';
  if (code.includes('network-request-failed')) return 'The signup service could not be reached. Check your connection and try again.';
  return String(error?.message || 'Signup could not be completed.').replace(/^Firebase:\s*/i, '');
}

if (form) {
  const params = new URLSearchParams(location.search);
  const requestedProgram = { kids: 'Kids', adult: 'Adult', service: 'First Responder', family: 'Family' }[params.get('program')];
  if (requestedProgram) document.querySelector('#program').value = requestedProgram;

  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (submitting) return;
    if (!form.reportValidity()) return;
    if (!firebaseConfigured) return show('Member signup is not connected yet. Firebase configuration is required.');

    const fd = new FormData(form);
    const password = String(fd.get('password') || '');
    if (password.length < 8) return show('Use a password with at least 8 characters.');
    if (password !== String(fd.get('confirmPassword') || '')) return show('The passwords do not match.');

    const record = Object.fromEntries(fd.entries());
    delete record.password;
    delete record.confirmPassword;
    record.email = normalizeEmail(record.email);
    record.createdAt = new Date().toISOString();
    // Validate tab storage before creating an account. Personal details never
    // belong in a URL, referrer or browser-history entry.
    try { sessionStorage.setItem('redroad:pendingEnrollment', JSON.stringify(record)); }
    catch (_) { return show('Allow this site to use tab storage before continuing. No account was created.'); }
    const submit = form.querySelector('button[type="submit"]');
    submitting = true;
    form.setAttribute('aria-busy', 'true');
    submit.disabled = true;
    submit.textContent = 'Creating Account…';
    message.hidden = true;

    try {
      await createUserWithEmailAndPassword(auth, record.email, password);
      location.href = 'waiver.html?enrollment=1';
    } catch (error) {
      await signOut(auth).catch(() => {});
      show(friendlyError(error));
      submitting = false;
      form.removeAttribute('aria-busy');
      submit.disabled = false;
      submit.textContent = 'Create Account & Continue to Waiver';
    }
  });
  form.dataset.serviceReady = 'true';
}
