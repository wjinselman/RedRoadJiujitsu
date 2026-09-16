import { localDate, listenAsync } from './ui-utils.js?v=49';
import { firebaseConfigured, auth, db, signInWithEmailAndPassword, onAuthStateChanged, doc, getDoc, setDoc, serverTimestamp } from './firebase-client.js?v=52';

const $ = selector => document.querySelector(selector);
const emailKey = value => String(value || '').trim().toLowerCase();
let member = null;
let pending = false;

function flash(target, text, tone = 'ok') { target.textContent = text; target.dataset.tone = tone; target.hidden = false; }
function classFor(record, now = new Date()) { const plan = String(record?.plan || '').toLowerCase(); const kids = plan.includes('kid') || (plan.includes('family') && now.getHours() < 19); const noGi = now.getDay() === 2 || now.getDay() === 5; return kids ? (noGi ? 'Kids No-Gi' : 'Kids Jiu Jitsu') : (noGi ? 'Adult No-Gi' : 'Adult Jiu Jitsu'); }
function attendanceId(record, className) { return `${localDate()}_${emailKey(record.email)}_${className.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`; }

async function openCheckIn(user) {
  if (user.emailVerified !== true) return flash($('#checkin-login-message'), 'Verify your email before checking in.', 'error');
  const snap = await getDoc(doc(db, 'members', emailKey(user.email)));
  if (!snap.exists()) return flash($('#checkin-login-message'), 'No active member account was found for this email.', 'error');
  member = { id: snap.id, ...snap.data() };
  if (member.enabled !== true || member.active !== true || member.archived === true) return flash($('#checkin-login-message'), 'Your membership must be active. Ask a coach for help.', 'error');
  $('#checkin-member-name').textContent = member.name || 'Member';
  $('#checkin-class-name').textContent = classFor(member);
  $('#checkin-login-view').hidden = true;
  $('#checkin-confirm-view').hidden = false;
}

async function confirmCheckIn() {
  if (!member || pending) return;
  pending = true; const button = $('#checkin-confirm-button'); button.disabled = true; button.textContent = 'Checking In…';
  const className = classFor(member); const email = emailKey(auth.currentUser?.email);
  try {
    await setDoc(doc(db, 'attendance', attendanceId(member, className)), { memberEmail: email, memberName: String(member.name || 'Member').slice(0,120), className, classDate: localDate(), checkedInAt: serverTimestamp(), checkedInBy: email, source: 'member' });
    button.textContent = 'Checked In'; flash($('#checkin-message'), `You’re checked in for ${className}.`);
  } catch (error) {
    button.disabled = false; button.textContent = 'Check In';
    flash($('#checkin-message'), String(error?.code || '').includes('permission-denied') ? 'You may already be checked in today. Ask a coach if you need help.' : 'Check-in is temporarily unavailable. Please try again.', 'error');
  } finally { pending = false; }
}

if (!firebaseConfigured) flash($('#checkin-login-message'), 'Check-in is not connected yet.', 'error');
else {
  listenAsync($('#checkin-login-form'), 'submit', async event => { event.preventDefault(); $('#checkin-login-message').hidden = true; try { const credential = await signInWithEmailAndPassword(auth, emailKey($('#checkin-email').value), $('#checkin-password').value); await openCheckIn(credential.user); } catch (_) { flash($('#checkin-login-message'), 'Email or password is incorrect.', 'error'); } });
  listenAsync($('#checkin-confirm-button'), 'click', confirmCheckIn);
  let restored = false; onAuthStateChanged(auth, async user => { if (restored) return; restored = true; if (user) await openCheckIn(user).catch(() => flash($('#checkin-login-message'), 'Check-in is temporarily unavailable.', 'error')); });
  document.querySelectorAll('form[data-service-form]').forEach(form => { form.dataset.serviceReady = 'true'; });
}
