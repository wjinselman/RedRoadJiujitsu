import { firebaseConfigured, auth, db, doc, getDocFromServer, onAuthStateChanged, createUserWithEmailAndPassword, signOut } from './firebase-client.js?v=52';

const form = document.querySelector('#enroll-form');
const message = document.querySelector('#enroll-success');
const normalizeEmail = value => String(value || '').trim().toLowerCase();
let submitting = false;
let resumeUser = null, setupReady = false;
const submitButton = form?.querySelector('button[type="submit"]');
if (submitButton) submitButton.disabled = true;
async function prepareEnrollment(user) {
  setupReady = false;
  resumeUser = user && !user.isAnonymous ? user : null;
  if (resumeUser) {
    const snap = await getDocFromServer(doc(db, 'members', normalizeEmail(user.email)));
    if (auth.currentUser?.uid !== user.uid) return;
    if (snap.exists()) { location.replace('members.html'); return; }
    document.querySelector('#email').value = user.email;
    document.querySelector('#email').readOnly = true;
    for (const id of ['password','confirmPassword']) {
      const input = document.getElementById(id);
      input.required = false; input.disabled = true; input.value = '';
      input.closest('.form-field').hidden = true;
    }
    submitButton.textContent = 'Continue to Waiver';
    show('Your login is ready. Complete your member information and waiver to finish joining.');
    message.dataset.tone = 'ok';
  } else {
    // All new-account entry points use the same email-first activation screen.
    location.replace('members.html?setup=1');
    return;
  }
  setupReady = true; submitButton.disabled = false; form.hidden = false; document.querySelector('#enrollment-loading').hidden = true;
}


function show(text) {
  if (form.hidden) { const loading=document.querySelector('#enrollment-loading'); if(loading) loading.textContent=text; }
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
  if (firebaseConfigured) {
    let restored=false;
    onAuthStateChanged(auth, user => { if(restored)return;restored=true;prepareEnrollment(user).catch(()=>show('Could not check your member profile. Refresh to retry, or ask staff to check signup permissions.')); });
  }
  const params = new URLSearchParams(location.search);
  const requestedProgram = { kids: 'Kids', adult: 'Adult', service: 'First Responder', family: 'Family' }[params.get('program')];
  if (requestedProgram) document.querySelector('#program').value = requestedProgram;

  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (submitting || !setupReady) return;
    if (!form.reportValidity()) return;
    if (!firebaseConfigured) return show('Member signup is not connected yet. Firebase configuration is required.');

    const fd = new FormData(form);
    const password = String(fd.get('password') || '');
    if (!resumeUser && password.length < 8) return show('Use a password with at least 8 characters.');
    if (!resumeUser && password !== String(fd.get('confirmPassword') || '')) return show('The passwords do not match.');

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
      if (resumeUser) {
        if (auth.currentUser?.uid !== resumeUser.uid || record.email !== normalizeEmail(resumeUser.email)) throw Error('Your sign-in changed. Refresh before continuing.');
      } else await createUserWithEmailAndPassword(auth, record.email, password);
      location.href = 'waiver.html?enrollment=1';
    } catch (error) {
      // Keep the existing login available for retrying enrollment.
      show(friendlyError(error));
      submitting = false;
      form.removeAttribute('aria-busy');
      submit.disabled = false;
      submit.textContent = 'Create Account & Continue to Waiver';
    }
  });
  form.dataset.serviceReady = 'true';
}
