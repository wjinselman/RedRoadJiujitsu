import { listenAsync } from './ui-utils.js?v=49';
import { FEATURES } from './launch-config.js';
import {
  firebaseConfigured,
  auth,
  db,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  deleteUser,
  onAuthStateChanged,
  doc,
  getDoc,
  getDocs,
  setDoc,
  collection,
  query,
  limit,
  serverTimestamp
} from './firebase-kiosk-client.js?v=49';

const $ = selector => document.querySelector(selector);
const normalizedEmail = value => String(value || '').trim().toLowerCase();
let directory = [];
let selectedMember = null;
let kioskIdentity = null;
let restoreAttempted = false;
let resetTimer = null;
let idleTimer = null;
let checkInPending = false;

function flash(el, message, tone = 'ok') {
  el.textContent = message;
  el.dataset.tone = tone;
  el.hidden = false;
}

function clearFlash(el) {
  el.hidden = true;
  el.textContent = '';
  delete el.dataset.tone;
}

function friendlyError(error) {
  const code = String(error?.code || '');
  if (code.includes('invalid-credential') || code.includes('wrong-password') || code.includes('user-not-found')) return 'Kiosk email or password is incorrect.';
  if (code.includes('email-already-in-use')) return 'This kiosk is already activated. Use Connect Kiosk.';
  if (code.includes('permission-denied')) return 'Kiosk permission denied. Deploy the prod40 Firestore rules, then confirm this kiosk is enabled.';
  if (code.includes('too-many-requests')) return 'Too many attempts. Wait a moment and try again.';
  return error?.message ? String(error.message).replace(/^Firebase:\s*/i, '') : 'Check-in is temporarily unavailable.';
}

function localDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function updateClock() {
  const now = new Date();
  $('#kiosk-time').textContent = now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  $('#kiosk-date').textContent = now.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
}

async function sha256(value) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

function classFor(member, now = new Date()) {
  const plan = String(member.plan || '').toLowerCase();
  const kids = plan.includes('kid') || (plan.includes('family') && now.getHours() < 19);
  const noGi = now.getDay() === 2 || now.getDay() === 4;
  if (kids) return noGi ? 'Kids No-Gi' : 'Kids Jiu Jitsu';
  return noGi ? 'Adult No-Gi' : 'Adult Jiu Jitsu';
}

function attendanceId(member, className) {
  const memberKey = normalizedEmail(member.memberEmail);
  const classKey = className.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  return `${localDateKey()}_${memberKey}_${classKey}`;
}

async function getKioskAccess(email) {
  const snap = await getDoc(doc(db, 'kiosks', normalizedEmail(email)));
  return snap.exists() && snap.data()?.enabled === true ? { id: snap.id, ...snap.data() } : null;
}

async function loadDirectory() {
  const snap = await getDocs(query(collection(db, 'checkInDirectory'), limit(250)));
  directory = snap.docs.map(item => ({ id: item.id, ...item.data() })).filter(item => item.active === true);
  $('#kiosk-directory-status').textContent = `${directory.length} members ready`;
  renderResults();
}

function renderResults() {
  const target = $('#kiosk-results');
  const term = $('#kiosk-member-search').value.trim().toLowerCase();
  if (term.length < 2) {
    target.innerHTML = '<p class="kiosk-result-note">Enter at least two letters.</p>';
    return;
  }
  const words = term.split(/\s+/).filter(Boolean);
  const matches = directory
    .filter(member => words.every(word => String(member.displayName || '').toLowerCase().includes(word)))
    .sort((a, b) => String(a.displayName).localeCompare(String(b.displayName)))
    .slice(0, 8);
  if (!matches.length) {
    target.innerHTML = '<p class="kiosk-result-note">No matching active member. Ask a coach for help.</p>';
    return;
  }
  target.innerHTML = matches.map(member => `<button class="kiosk-member-result" data-member-id="${escapeHtml(member.id)}" type="button"><strong>${escapeHtml(member.displayName)}</strong><span>${escapeHtml(member.plan || 'Member')}</span></button>`).join('');
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[char]));
}

function selectMember(member) {
  if (checkInPending) return;
  selectedMember = member;
  $('#kiosk-search-step').hidden = true;
  $('#kiosk-pin-step').hidden = false;
  $('#kiosk-selected-name').textContent = member.displayName;
  $('#kiosk-class-label').textContent = classFor(member);
  $('#kiosk-pin').value = '';
  clearFlash($('#kiosk-message'));
  $('#kiosk-pin').focus();
  restartIdleTimer();
}

function resetKiosk() {
  if (checkInPending) return;
  clearTimeout(resetTimer);
  clearTimeout(idleTimer);
  selectedMember = null;
  $('#kiosk-success').hidden = true;
  $('#kiosk-pin-step').hidden = true;
  $('#kiosk-search-step').hidden = false;
  $('#kiosk-member-search').value = '';
  $('#kiosk-pin').value = '';
  $('#kiosk-device-panel').hidden = true;
  $('#kiosk-device-button').setAttribute('aria-expanded', 'false');
  $('#kiosk-results').innerHTML = '<p class="kiosk-result-note">Enter at least two letters.</p>';
  $('#kiosk-member-search').focus();
}

function restartIdleTimer() {
  clearTimeout(idleTimer);
  if (kioskIdentity && !checkInPending) idleTimer = setTimeout(resetKiosk, 45000);
}

async function authorizeKiosk(user) {
  const access = await getKioskAccess(user.email);
  if (!access) return false;
  kioskIdentity = { email: normalizedEmail(user.email), ...access };
  $('#kiosk-device-name').textContent = access.name || 'Front Desk iPad';
  $('#kiosk-auth-view').hidden = true;
  $('#kiosk-app').hidden = false;
  await loadDirectory();
  resetKiosk();
  return true;
}

async function checkIn(pin) {
  if (!selectedMember || !kioskIdentity || checkInPending) return;
  checkInPending = true;
  clearTimeout(idleTimer);
  const button = $('#kiosk-pin-form button[type=submit]');
  button.disabled = true;
  button.textContent = 'Checking In…';
  $('#kiosk-back').disabled = true;
  $('#kiosk-pin-form').setAttribute('aria-busy', 'true');
  try {
    const proof = await sha256(`${normalizedEmail(selectedMember.memberEmail)}|${pin}`);
    if (proof !== selectedMember.pinHash) {
      flash($('#kiosk-message'), 'That PIN does not match. Try again or ask a coach.', 'error');
      $('#kiosk-pin').value = '';
      $('#kiosk-pin').focus();
      return;
    }
    const className = classFor(selectedMember);
    const ref = doc(db, 'attendance', attendanceId(selectedMember, className));
    const payload = {
      memberEmail: normalizedEmail(selectedMember.memberEmail),
      memberName: String(selectedMember.displayName || '').slice(0, 120),
      className,
      classDate: localDateKey(),
      checkedInAt: serverTimestamp(),
      checkedInBy: kioskIdentity.email,
      source: 'kiosk'
    };
    await setDoc(ref, payload);
    $('#kiosk-pin-step').hidden = true;
    $('#kiosk-success-name').textContent = `Welcome, ${selectedMember.displayName.split(/\s+/)[0]}.`;
    $('#kiosk-success-class').textContent = `${className} · You’re checked in.`;
    $('#kiosk-success').hidden = false;
    $('#kiosk-pin').value = '';
    resetTimer = setTimeout(resetKiosk, 4500);
  } catch (error) {
    if (String(error?.code || '').includes('permission-denied')) {
      flash($('#kiosk-message'), 'Check-in could not be confirmed. You may already be checked in, or this device may need staff attention. Ask a coach to check today’s attendance.', 'error');
    } else {
      flash($('#kiosk-message'), friendlyError(error), 'error');
    }
  } finally {
    checkInPending = false;
    button.disabled = false;
    button.textContent = 'Check In';
    $('#kiosk-back').disabled = false;
    $('#kiosk-pin-form').removeAttribute('aria-busy');
    if ($('#kiosk-success').hidden) restartIdleTimer();
  }
}

async function setup() {
  let kioskEnabled = FEATURES.kioskAttendance === true;
  if (firebaseConfigured) {
    try {
      const settings = await getDoc(doc(db, 'appSettings', 'attendance'));
      if (settings.exists()) kioskEnabled = settings.data()?.kioskEnabled === true;
    } catch (_) {}
  }
  if (!kioskEnabled) {
    $('#kiosk-auth-view').hidden = true;
    $('#kiosk-app').hidden = true;
    const notice = document.createElement('section');
    notice.className = 'kiosk-auth';
    notice.dataset.kioskDisabled = 'true';
    notice.innerHTML = '<div class="kicker">Check-In Updated</div><h1>Use Your Phone.</h1><p>The shared kiosk is not active. Scan the Red Road QR code posted at the gym.</p>';
    document.querySelector('.kiosk-header').after(notice);
    return;
  }
  updateClock();
  setInterval(updateClock, 30000);
  if (!firebaseConfigured) {
    flash($('#kiosk-auth-message'), 'Firebase is not configured for this build.', 'error');
    return;
  }

  listenAsync($('#kiosk-login-form'), 'submit', async event => {
    event.preventDefault();
    const email = normalizedEmail($('#kiosk-email').value);
    const password = $('#kiosk-password').value;
    clearFlash($('#kiosk-auth-message'));
    try {
      const credential = await signInWithEmailAndPassword(auth, email, password);
      if (!await authorizeKiosk(credential.user)) {
        await signOut(auth);
        flash($('#kiosk-auth-message'), 'This email is not enabled as a Red Road kiosk.', 'error');
      }
    } catch (error) {
      flash($('#kiosk-auth-message'), friendlyError(error), 'error');
    }
  });

  listenAsync($('#kiosk-activate'), 'click', async () => {
    const email = normalizedEmail($('#kiosk-email').value);
    const password = $('#kiosk-password').value;
    if (!email || password.length < 8) return flash($('#kiosk-auth-message'), 'Enter the approved kiosk email and a password of at least eight characters.', 'error');
    try {
      const credential = await createUserWithEmailAndPassword(auth, email, password);
      if (!await authorizeKiosk(credential.user)) {
        await deleteUser(credential.user).catch(() => {});
        flash($('#kiosk-auth-message'), 'The Developer must approve this kiosk email first.', 'error');
      }
    } catch (error) {
      flash($('#kiosk-auth-message'), friendlyError(error), 'error');
    }
  });

  $('#kiosk-member-search').addEventListener('input', () => { renderResults(); restartIdleTimer(); });
  $('#kiosk-pin').addEventListener('input', restartIdleTimer);
  $('#kiosk-results').addEventListener('click', event => {
    const button = event.target.closest('[data-member-id]');
    if (!button) return;
    const member = directory.find(item => item.id === button.dataset.memberId);
    if (member) selectMember(member);
  });
  $('#kiosk-back').addEventListener('click', resetKiosk);
  $('#kiosk-pin-form').addEventListener('submit', async event => {
    event.preventDefault();
    const pin = $('#kiosk-pin').value;
    if (/^\d{4}$/.test(pin)) await checkIn(pin);
  });
  $('#kiosk-device-button').addEventListener('click', () => {
    $('#kiosk-device-panel').hidden = !$('#kiosk-device-panel').hidden;
    $('#kiosk-device-button').setAttribute('aria-expanded', String(!$('#kiosk-device-panel').hidden));
  });
  listenAsync($('#kiosk-reload'), 'click', async () => {
    try { await loadDirectory(); resetKiosk(); } catch (error) { $('#kiosk-directory-status').textContent = friendlyError(error); }
  });
  listenAsync($('#kiosk-logout'), 'click', async () => {
    await signOut(auth).catch(() => {});
    location.reload();
  });

  onAuthStateChanged(auth, async user => {
    if (restoreAttempted) return;
    restoreAttempted = true;
    if (!user) return;
    try { if (!await authorizeKiosk(user)) await signOut(auth); }
    catch (error) {
      $('#kiosk-app').hidden = true;
      $('#kiosk-auth-view').hidden = false;
      flash($('#kiosk-auth-message'), friendlyError(error), 'error');
    }
  });
}

setup();
if (firebaseConfigured) document.querySelectorAll('form[data-service-form]').forEach(form => { form.dataset.serviceReady = 'true'; });
