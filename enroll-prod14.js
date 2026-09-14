import { firebaseConfigured, auth, createUserWithEmailAndPassword, signOut } from './firebase-client.js';

const form = document.querySelector('#enroll-form');
const message = document.querySelector('#enroll-success');
const normalizeEmail = value => String(value || '').trim().toLowerCase();

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
  if (params.get('program') === 'kids') document.querySelector('#program').value = 'Kids';

  form.addEventListener('submit', async event => {
    event.preventDefault();
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
    const submit = form.querySelector('button[type="submit"]');
    submit.disabled = true;
    submit.textContent = 'Creating Account…';
    message.hidden = true;

    try {
      await createUserWithEmailAndPassword(auth, record.email, password);
      sessionStorage.setItem('redroad:pendingEnrollment', JSON.stringify(record));
      const query = new URLSearchParams({ enrollment: '1', name: record.name || '', dob: record.dob || '', email: record.email || '', phone: record.phone || '' });
      location.href = `waiver.html?${query}`;
    } catch (error) {
      await signOut(auth).catch(() => {});
      show(friendlyError(error));
      submit.disabled = false;
      submit.textContent = 'Create Account & Continue to Waiver';
    }
  });
}
