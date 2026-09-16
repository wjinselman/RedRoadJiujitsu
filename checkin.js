import { listenAsync } from './ui-utils.js?v=49';
import { currentClass, CLASS_HOURS } from './class-schedule.js?v=1';
import { firebaseConfigured, auth, db, signInWithEmailAndPassword, onAuthStateChanged, doc, getDoc, setDoc, serverTimestamp } from './firebase-client.js?v=52';
const $ = selector => document.querySelector(selector);
const emailKey = value => String(value || '').trim().toLowerCase();
let member = null, pending = false, completed = '', generation = 0;
function flash(target, text, tone = 'ok') { target.textContent = text; target.dataset.tone = tone; target.hidden = false; }
function refreshClass() {
  if (!member || pending) return;
  const slot = currentClass(member);
  const key = slot ? slot.classDate + '_' + slot.classKey : '';
  const button = $('#checkin-confirm-button');
  button.disabled = !slot || completed === key;
  button.textContent = !slot ? 'Check-In Closed' : completed === key ? 'Checked In' : 'Check In';
  $('#checkin-class-name').textContent = (slot ? slot.className : 'Check-in is closed for your class.') + ' · ' + CLASS_HOURS;
}
async function openCheckIn(user) {
  const attempt = ++generation;
  member = null; completed = '';
  $('#checkin-login-view').hidden = false;
  $('#checkin-confirm-view').hidden = true;
  if (!user) return;
  if (user.emailVerified !== true) return flash($('#checkin-login-message'), 'Verify your email before checking in.', 'error');
  const email = emailKey(user.email);
  const developer = await getDoc(doc(db, 'developers', email));
  let record;
  if (developer.exists() && developer.data().enabled === true) {
    record = { email, name:'Developer Test', developerTest:true };
  } else {
    const snap = await getDoc(doc(db, 'members', email));
    if (attempt !== generation) return;
    if (!snap.exists()) return flash($('#checkin-login-message'), 'No member record was found. Use Sign Up below or ask a coach.', 'error');
    record = { ...snap.data(), email };
    if (record.enabled !== true || record.active !== true || record.archived === true) return flash($('#checkin-login-message'), 'Your membership must be active. Ask a coach for help.', 'error');
  }
  if (attempt !== generation || auth.currentUser?.uid !== user.uid) return;
  member = record;
  $('#checkin-member-name').textContent = member.name || 'Member';
  $('#checkin-message').hidden = true;
  if (member.developerTest) flash($('#checkin-message'), 'Developer test: no member profile needed. This check-in is labeled Developer Test in attendance.');
  $('#checkin-login-view').hidden = true;
  $('#checkin-confirm-view').hidden = false;
  refreshClass();
}
async function confirmCheckIn() {
  if (!member || pending || emailKey(auth.currentUser?.email) !== member.email) return;
  const slot = currentClass(member);
  if (!slot) { refreshClass(); return flash($('#checkin-message'), 'Check-in is only available during your class. ' + CLASS_HOURS, 'error'); }
  pending = true;
  const button = $('#checkin-confirm-button');
  button.disabled = true; button.textContent = 'Checking In…';
  const record = member;
  try {
    await setDoc(doc(db, 'attendance', slot.classDate + '_' + record.email + '_' + slot.classKey), {
      memberEmail:record.email, memberName:String(record.name || 'Member').slice(0,120),
      className:slot.className, classDate:slot.classDate, checkedInAt:serverTimestamp(),
      checkedInBy:record.email, source:record.developerTest ? 'developer-test' : 'member'
    });
    completed = slot.classDate + '_' + slot.classKey;
    flash($('#checkin-message'), 'You’re checked in for ' + slot.className + (record.developerTest ? ' (Developer Test).' : '.'));
  } catch (error) {
    flash($('#checkin-message'), String(error?.code || '').includes('permission-denied')
      ? 'Check-in was not accepted. Class may have ended, you may already be checked in, or your access may have changed. Ask a coach to check attendance.'
      : 'Check-in is temporarily unavailable. Please try again.', 'error');
  } finally { pending = false; refreshClass(); }
}
if (!firebaseConfigured) flash($('#checkin-login-message'), 'Check-in is not connected yet.', 'error');
else {
  listenAsync($('#checkin-login-form'), 'submit', async event => {
    event.preventDefault(); $('#checkin-login-message').hidden = true;
    try { await signInWithEmailAndPassword(auth, emailKey($('#checkin-email').value), $('#checkin-password').value); }
    catch (_) { flash($('#checkin-login-message'), 'Unable to sign in. Check your email, password, and connection.', 'error'); }
  });
  $('#checkin-confirm-button').addEventListener('click', confirmCheckIn);
  onAuthStateChanged(auth, user => { openCheckIn(user).catch(() => flash($('#checkin-login-message'), 'Check-in access could not be loaded. Refresh or ask a coach.', 'error')); });
  setInterval(refreshClass, 15000);
  document.addEventListener('visibilitychange', refreshClass);
  document.querySelectorAll('form[data-service-form]').forEach(form => { form.dataset.serviceReady = 'true'; });
}
