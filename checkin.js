import { monthInfo, fetchMonth, renderMonth } from './attendance-month.js?v=1';
import { listenAsync } from './ui-utils.js?v=49';
import { currentClass, CLASS_HOURS, checkInNotice } from './class-schedule.js?v=2';
import { firebaseConfigured, auth, db, signOut, signInWithEmailAndPassword, sendEmailVerification, onAuthStateChanged, doc, getDoc, getDocFromServer, deleteDoc, setDoc, serverTimestamp } from './firebase-client.js?v=52';
const $ = selector => document.querySelector(selector);
const emailKey = value => String(value || '').trim().toLowerCase();
let member = null, pending = false, completed = '', generation = 0, signingIn = false;
let attendanceRows = [], attendanceMonth = '', attendanceGeneration = 0;
async function loadAttendance() {
  const record = member, user = auth.currentUser, info = monthInfo();
  if (!record || !user) return;
  const attempt = ++attendanceGeneration;
  attendanceMonth = info.key;
  const status = $('#attendance-status');
  status.textContent = 'Loading your attendance…';
  $('#attendance-retry').hidden = true;
  try {
    const rows = await withTimeout(fetchMonth(record.email, info));
    if (attempt !== attendanceGeneration || member !== record || auth.currentUser?.uid !== user.uid) return;
    attendanceRows = rows;
    $('#attendance-month-label').textContent = info.label;
    $('#attendance-count').textContent = String(rows.length);
    renderMonth($('#attendance-calendar'), info, rows);
    $('#attendance-details').hidden = false;
    status.textContent = rows.length ? 'Your recorded classes this month.' : 'No classes recorded this month yet. Your first check-in will appear here.';
    refreshClass();
  } catch (error) {
    if (attempt !== attendanceGeneration || member !== record || auth.currentUser?.uid !== user.uid) return;
    status.textContent = 'Attendance could not refresh. You can still check in. Try loading attendance again.';
    $('#attendance-retry').hidden = false;
    console.error('Monthly attendance could not load', error);
  }
}

function withTimeout(promise) {
  let timer;
  return Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Connection timed out. Check your connection and try again.')), 15000); })]).finally(() => clearTimeout(timer));
}
function showHours() {
  flash($('#checkin-hours'), checkInNotice(member), member && !currentClass(member) ? 'error' : 'ok');
}
function flash(target, text, tone = 'ok') { target.textContent = text; target.dataset.tone = tone; target.hidden = false; }
function refreshClass() {
  showHours();
  const resetButton = $('#checkin-reset-test');
  resetButton.hidden = !member?.developerTest;
  resetButton.disabled = pending || !testResetTarget();
  if (!member || pending) return;
  const slot = currentClass(member);
  if (attendanceMonth && attendanceMonth !== monthInfo().key) {
    attendanceRows = []; completed = ''; $('#attendance-details').hidden = true;
    void loadAttendance();
  }
  const key = slot ? slot.classDate + '_' + slot.classKey : '';
  if (slot && attendanceRows.some(row => row.classDate === slot.classDate && row.className === slot.className)) {
    if (completed !== key) flash($('#checkin-message'), 'You’re already checked in for ' + slot.className + ' today.');
    completed = key;
  }
  const button = $('#checkin-confirm-button');
  button.disabled = !slot || completed === key;
  button.textContent = !slot ? 'Check-In Closed' : completed === key ? 'Checked In' : 'Check In — ' + slot.className;
  $('#checkin-class-name').textContent = checkInNotice(member);
}
async function openCheckIn(user) {
  if (user?.isAnonymous) user = null;
  const attempt = ++generation;
  member = null; completed = ''; attendanceRows = []; attendanceMonth = ''; ++attendanceGeneration;
  $('#attendance-details').hidden = true; $('#attendance-status').textContent = '';
  $('#checkin-reset-test').hidden = true; showHours();
  $('#checkin-login-view').hidden = Boolean(user?.emailVerified);
  $('#checkin-restoring').hidden = !user?.emailVerified;
  $('#checkin-confirm-view').hidden = true;
  $('#checkin-verification').hidden = !user || user.emailVerified === true;
  if (!user) { $('#checkin-login-message').hidden = true; return; }
  if (user.emailVerified !== true) return flash($('#checkin-login-message'), 'You are signed in. Verify your email to continue: send the email below, open its verification link, then select “I’ve verified my email.”', 'error');
  try {
  const email = emailKey(user.email);
  const developer = await withTimeout(getDoc(doc(db, 'developers', email)));
  let record;
  if (developer.exists() && developer.data().enabled === true) {
    record = { email, name:'Developer Test', developerTest:true };
  } else {
    const snap = await withTimeout(getDoc(doc(db, 'members', email)));
    if (attempt !== generation) return;
    if (!snap.exists()) return flash($('#checkin-login-message'), 'No member record was found. Use “New here? Create an account” below or ask a coach.', 'error');
    record = { ...snap.data(), email };
    if (record.enabled !== true || record.active !== true || record.archived === true) return flash($('#checkin-login-message'), 'Your membership must be active. Ask a coach for help.', 'error');
  }
  if (attempt !== generation || auth.currentUser?.uid !== user.uid) return;
  member = record;
  const chooser = $('#checkin-program-choice');
  chooser.hidden = !(record.developerTest || String(record.plan || '').toLowerCase().includes('family'));
  $('#checkin-program').value = '';
  member.selectedProgram = '';
  $('#checkin-member-name').textContent = member.name || 'Member';
  $('#checkin-message').hidden = true;
  if (member.developerTest) flash($('#checkin-message'), 'Developer test: no member profile needed. This check-in is labeled Developer Test in attendance.');
  $('#checkin-login-view').hidden = true;
  $('#checkin-confirm-view').hidden = false;
  refreshClass();
  void loadAttendance();
  } finally {
    if (attempt === generation) {
      $('#checkin-restoring').hidden = true;
      if (!member) $('#checkin-login-view').hidden = false;
    }
  }
}
function testResetTarget() {
  if (!member?.developerTest || !['kids','adult'].includes(member.selectedProgram)) return null;
  const date = monthInfo().today;
  const weekday = new Date(date + 'T12:00:00Z').getUTCDay();
  const className = (member.selectedProgram === 'kids' ? 'Kids' : 'Adult')
    + ([2,5].includes(weekday) ? ' No-Gi' : ' Jiu Jitsu');
  return {classDate:date, className, classKey:className.toLowerCase().replace(/[^a-z0-9]+/g,'-')};
}
async function resetTestCheckIn() {
  const user = auth.currentUser, record = member, slot = testResetTarget();
  if (pending || !user || !record?.developerTest || !slot || emailKey(user.email) !== record.email) return;
  pending = true;
  ++attendanceGeneration;
  const button = $('#checkin-reset-test');
  button.disabled = true; button.textContent = 'Resetting test check-in…';
  $('#checkin-confirm-button').disabled = true;
  $('#checkin-program').disabled = true;
  try {
    await withTimeout(user.getIdToken(true));
    const developer = await withTimeout(getDocFromServer(doc(db,'developers',record.email)));
    if (auth.currentUser?.uid !== user.uid || member !== record) return;
    if (!developer.exists() || developer.data().enabled !== true) throw new Error('Developer access is required.');
    const ref = doc(db,'attendance',slot.classDate+'_'+record.email+'_'+slot.classKey);
    const snap = await withTimeout(getDocFromServer(ref));
    if (auth.currentUser?.uid !== user.uid || member !== record) return;
    if (monthInfo().today !== slot.classDate) throw new Error('The day changed. Select your class and try again.');
    if (snap.exists()) {
      const data = snap.data();
      if (data.source !== 'developer-test' || data.memberEmail !== record.email
          || data.checkedInBy !== record.email || data.memberName !== 'Developer Test'
          || data.classDate !== slot.classDate || data.className !== slot.className) {
        throw new Error('This is not your Developer Test record. It was not removed.');
      }
      await deleteDoc(ref);
    }
    if (auth.currentUser?.uid !== user.uid || member !== record) return;
    ++attendanceGeneration;
    attendanceRows = attendanceRows.filter(row => row.id !== ref.id);
    completed = '';
    const info = monthInfo();
    $('#attendance-count').textContent = String(attendanceRows.length);
    renderMonth($('#attendance-calendar'),info,attendanceRows);
    flash($('#checkin-message'), snap.exists()
      ? 'Your test check-in for ' + slot.className + ' was reset. You can check in again during its class window.'
      : 'No test check-in was found for this class today. You can check in during its class window.');
    void loadAttendance();
  } catch (error) {
    if (auth.currentUser?.uid !== user.uid || member !== record) return;
    flash($('#checkin-message'), error?.code
      ? 'Could not reset your test check-in (' + error.code + '). Refresh and try again.'
      : error?.message || 'Could not reset your test check-in. Try again.', 'error');
  } finally {
    pending = false; button.textContent = 'Reset my test check-in';
    $('#checkin-program').disabled = false;
    refreshClass();
  }
}

async function confirmCheckIn() {
  const user = auth.currentUser;
  if (!member || pending || emailKey(user?.email) !== member.email) return;
  let slot = currentClass(member);
  if (!slot) { refreshClass(); return flash($('#checkin-message'), 'Check-in is only available during your class. ' + CLASS_HOURS, 'error'); }
  pending = true;
  const button = $('#checkin-confirm-button');
  button.disabled = true; button.textContent = 'Checking In…';
  const record = member;
  let attendanceRef;
  let saving = false;
  try {
    await withTimeout(user.reload());
    await withTimeout(user.getIdToken(true));
    if (auth.currentUser?.uid !== user.uid || member !== record) return;
    if (!user.emailVerified) {
      await openCheckIn(user);
      return;
    }
    slot = currentClass(record);
    if (!slot) return flash($('#checkin-message'), 'Check-in is only available during your class. ' + CLASS_HOURS, 'error');
    attendanceRef = doc(db, 'attendance', slot.classDate + '_' + record.email + '_' + slot.classKey);
    saving = true;
    await setDoc(attendanceRef, {
      memberEmail:record.email, memberName:String(record.name || 'Member').slice(0,120),
      className:slot.className, classDate:slot.classDate, checkedInAt:serverTimestamp(),
      checkedInBy:record.email, source:record.developerTest ? 'developer-test' : 'member'
    });
    if (auth.currentUser?.uid !== user.uid || member !== record) return;
    completed = slot.classDate + '_' + slot.classKey;
    flash($('#checkin-message'), 'You’re checked in for ' + slot.className + (record.developerTest ? ' (Developer Test).' : '.'));
    void loadAttendance();
  } catch (error) {
    if (auth.currentUser?.uid !== user.uid || member !== record) return;
    const code = String(error?.code || 'connection-error');
    if (saving && code.includes('permission-denied')) {
      // A repeated set is an update, which attendance rules intentionally deny.
      // Confirm a saved record before treating this as a successful check-in.
      try {
        const existing = await withTimeout(getDoc(attendanceRef));
        const data = existing.exists() ? existing.data() : null;
        if (auth.currentUser?.uid !== user.uid || member !== record) return;
        if (data && existing.metadata?.hasPendingWrites !== true && existing.metadata?.fromCache !== true
            && data.memberEmail === record.email && data.classDate === slot.classDate
            && data.className === slot.className && data.checkedInAt) {
          completed = slot.classDate + '_' + slot.classKey;
          flash($('#checkin-message'), 'You’re already checked in for ' + slot.className + ' today.');
          void loadAttendance();
          return;
        }
      } catch (_) { /* A denied or failed read is not evidence of attendance. */ }
    }
    if (auth.currentUser?.uid !== user.uid || member !== record) return;
    console.error('Red Road check-in failed', {code, stage:saving ? 'attendance-save' : 'session-refresh', className:slot?.className, classDate:slot?.classDate});
    flash($('#checkin-message'), saving && code.includes('permission-denied')
      ? 'Firebase denied the attendance save. No existing check-in could be confirmed. Send the Developer this code: ' + code + ' | ' + slot.className + ' | ' + slot.classDate + '.'
      : 'Check-in could not finish (' + (saving ? 'attendance save' : 'sign-in refresh') + ': ' + code + '). Check your connection and try again.', 'error');
  } finally { pending = false; refreshClass(); }
}

let verificationBusy = false;
const verificationSentAt = new Map();
async function verificationAction(send) {
  if (verificationBusy) return;
  const user = auth.currentUser;
  const message = $('#checkin-login-message');
  if (!user) return flash(message, 'Please sign in again before verifying your email.', 'error');
  verificationBusy = true;
  const buttons = [$('#checkin-send-verification'), $('#checkin-recheck-verification')];
  buttons.forEach(button => { button.disabled = true; });
  try {
    if (send) {
      if (user.emailVerified) {
        await withTimeout(user.getIdToken(true));
        if (auth.currentUser?.uid === user.uid) await openCheckIn(user);
        return;
      }
      if (Date.now() - (verificationSentAt.get(user.uid) || 0) < 60000) {
        flash(message, 'A verification email was just sent. Wait a minute before requesting another, and check your Spam folder.');
        return;
      }
      flash(message, 'Sending verification email…');
      await withTimeout(sendEmailVerification(user, { url:'https://redroadbjj.com/checkin.html' }));
      if (auth.currentUser?.uid !== user.uid) return;
      verificationSentAt.set(user.uid, Date.now());
      flash(message, 'Verification email sent to ' + user.email + '. Check your inbox or Spam folder. Open the link, then come back and select “I’ve verified my email.”');
    } else {
      flash(message, 'Checking your email verification…');
      await withTimeout(user.reload());
      if (auth.currentUser?.uid !== user.uid) return;
      if (!user.emailVerified) {
        flash(message, 'Your email is not verified yet. Open the link in the latest verification email, then try this button again.', 'error');
        return;
      }
      // Refresh the verified claim used by Firestore, not just the screen state.
      await withTimeout(user.getIdToken(true));
      if (auth.currentUser?.uid !== user.uid) return;
      await openCheckIn(user);
    }
  } catch (error) {
    if (auth.currentUser?.uid !== user.uid) return;
    const code = String(error?.code || '');
    flash(message, code.includes('too-many-requests')
      ? 'Too many verification requests. Wait a few minutes, then try again.'
      : code.includes('unauthorized-continue-uri') || code.includes('invalid-continue-uri')
      ? 'The verification return address needs configuration. Ask the Developer to allow redroadbjj.com in Firebase Authentication.'
      : send ? 'Could not send the verification email. Check your connection and try again.'
      : 'Could not finish verification or load your check-in access. Try again or ask the Developer for help.', 'error');
  } finally {
    verificationBusy = false;
    buttons.forEach(button => { button.disabled = false; });
  }
}

showHours();
window.redRoadCheckinReady = true;
if (!firebaseConfigured) { $('#checkin-restoring').hidden = true; $('#checkin-login-view').hidden = false; flash($('#checkin-login-message'), 'Check-in is not connected yet.', 'error'); }
else {
  $('#checkin-switch-account').addEventListener('click', async () => {
    if (pending) return;
    try { await signOut(auth); $('#checkin-password').value = ''; }
    catch (_) { flash($('#checkin-message'), 'Could not sign out. Please try again.', 'error'); }
  });
  $('#checkin-reset-test').addEventListener('click', resetTestCheckIn);
  $('#attendance-retry').addEventListener('click', () => { void loadAttendance(); });
  $('#checkin-send-verification').addEventListener('click', () => verificationAction(true));
  $('#checkin-recheck-verification').addEventListener('click', () => verificationAction(false));
  listenAsync($('#checkin-login-form'), 'submit', async event => {
    event.preventDefault();
    if (signingIn) return;
    signingIn = true;
    const button = $('#checkin-login-form button[type="submit"]');
    button.disabled = true;
    button.textContent = 'Signing In…';
    flash($('#checkin-login-message'), 'Signing in and checking your access…');
    try {
      const credential = await withTimeout(signInWithEmailAndPassword(auth, emailKey($('#checkin-email').value), $('#checkin-password').value));
      await openCheckIn(credential.user);
    } catch (error) {
      ++generation;
      const code = String(error?.code || '');
      const message = code.includes('permission-denied')
        ? 'Signed in, but check-in access was denied. Ask the Developer to check Firebase permissions.'
        : code.includes('invalid-credential') || code.includes('wrong-password') || code.includes('user-not-found')
        ? 'Email or password is incorrect.'
        : 'Unable to finish sign-in. Check your connection and try again.';
      flash($('#checkin-login-message'), message, 'error');
    } finally { signingIn = false; button.disabled = false; button.textContent = 'Sign In'; $('#checkin-password').value = ''; }
  });
  $('#checkin-program').addEventListener('change', () => { if (member) { member.selectedProgram = $('#checkin-program').value; refreshClass(); } });
  $('#checkin-confirm-button').addEventListener('click', confirmCheckIn);
  onAuthStateChanged(auth, user => { if (signingIn) return; openCheckIn(user).catch(() => flash($('#checkin-login-message'), 'Check-in access could not be loaded. Refresh or ask a coach.', 'error')); });
  setInterval(refreshClass, 15000);
  document.addEventListener('visibilitychange', refreshClass);
  document.querySelectorAll('form[data-service-form]').forEach(form => { form.dataset.serviceReady = 'true'; });
}
