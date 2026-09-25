import {PENDING_RANK, rankMetadata, assignRank} from './rank-model.js?v=1';
import {loadTopAttendance,clearTopAttendance} from './top-attendance.js?v=2';
import {toggleMemberPaid} from './quick-paid.js?v=2';
let quickPaymentBusy = false;
let ownerBillingLoading = false;
import {setupEmailInvitation,isAccountSetupOpen} from './email-setup.js?v=4';
import {activePaymentAlerts} from './admin-alerts.js?v=1';
import {gymDate} from './billing-model.js?v=2';

import {profiles,billingReady,loadBillingProfiles,loadMyBilling,memberBilling,saveWithBilling,ensureNoCoveredMembers} from './billing-store.js?v=2';

import {fillBillingForm,billingIntent,billingText,setupBillingReport,invalidateReport} from './billing-ui.js?v=3';

import { listenAsync, localDate } from './ui-utils.js?v=49';

import { attachWaiverPrint } from './waiver-pdf.js?v=49';

import { FEATURES } from './launch-config.js';

/*

  Red Road Jiu Jitsu — production portal

  ---------------------------------------

  Deliberately bounded Firestore usage:

    - Member page: one getDoc on login/session restore.

    - Staff page: bounded role checks + one bounded member query. Developer additionally loads a bounded owner list.

    - Refresh happens ONLY when the owner presses Refresh.

    - Writes happen ONLY when the owner presses Add/Save/Enable/Disable/Remove.

    - NO realtime listeners (no onSnapshot).

    - NO polling / intervals.

    - NO Cloud Functions.

*/

import {

  firebaseConfigured,

  auth,

  db,

  signInWithEmailAndPassword,

  createUserWithEmailAndPassword,

  sendPasswordResetEmail,

  sendEmailVerification,

  updatePassword,

  reauthenticateWithCredential,

  EmailAuthProvider,

  signOut,

  deleteUser,

  onAuthStateChanged,

  doc,

  getDoc,

  getDocFromServer,

  getDocs,

  getDocsFromServer,

  setDoc,

  deleteDoc,

  collection,

  query,

  where,

  orderBy,

  startAfter,

  limit,

  serverTimestamp,

  writeBatch

} from './firebase-client.js?v=52';



const MAX_OWNER_MEMBERS = 250;

let ownerMembers = [];

let ownerRosterLoaded = false;

let staffAuthorization = null;

let ownerAccess = [];

let kioskAccess = [];

let ownerAttendance = [];

let ownerTrials = [];

let ownerTrialsLoaded = false;

let standaloneWaivers = [];

const waiverPages = {

  members: { cursor: null, more: false },

  trials: { cursor: null, more: false },

  standalone: { cursor: null, more: false }

};

let ownerIdentity = null;

let currentMember = null;

let memberAttendance = [];

let memberAttendanceMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);

let kioskModeEnabled = FEATURES.kioskAttendance === true;

let memberRestoreAttempted = false;

let ownerRestoreAttempted = false;



const $ = selector => document.querySelector(selector);

const esc = value => String(value ?? '').replace(/[&<>'"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));

const normalizedEmail = value => String(value || '').trim().toLowerCase();

const todayIso = () => localDate();

const clean = (value, max = 240) => String(value || '').trim().slice(0, max);

const localDateKey = (date = new Date()) => {

  const year = date.getFullYear();

  const month = String(date.getMonth() + 1).padStart(2, '0');

  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;

};



async function sha256(value) {

  const bytes = new TextEncoder().encode(value);

  const digest = await crypto.subtle.digest('SHA-256', bytes);

  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');

}



const stripeCount = value => {

  const n = Number(value);

  return Number.isInteger(n) && n >= 0 && n <= 4 ? n : 0;

};

const formatRank = member => {

  const belt = String(member?.rank || PENDING_RANK);
  if (belt === PENDING_RANK) return PENDING_RANK;

  const stripes = stripeCount(member?.stripes);

  if (stripes === 0) return belt;

  return `${belt} · ${stripes} ${stripes === 1 ? 'Stripe' : 'Stripes'}`;

};



function flash(el, message, tone = 'ok') {

  if (!el) return;

  el.textContent = message;

  el.dataset.tone = tone;

  el.hidden = false;

}



function clearFlash(el) {

  if (!el) return;

  el.hidden = true;

  el.textContent = '';

  delete el.dataset.tone;

}



function renderKioskMode() {

  const select = $('#kiosk-mode-select');

  if (select) select.value = kioskModeEnabled ? 'enabled' : 'disabled';

  document.querySelectorAll('[data-kiosk-feature]').forEach(element => { element.hidden = !kioskModeEnabled; });

}



async function loadAttendanceOptions() {

  const snap = await getDoc(doc(db, 'appSettings', 'attendance'));

  kioskModeEnabled = snap.exists() ? snap.data()?.kioskEnabled === true : FEATURES.kioskAttendance === true;

  renderKioskMode();

}



function friendlyError(error) {

  const code = error?.code || '';

  if (code.includes('invalid-credential') || code.includes('wrong-password') || code.includes('user-not-found')) return 'Email or password is incorrect.';

  if (code.includes('email-already-in-use')) return 'That email already has an account. Use Sign In instead.';

  if (code.includes('weak-password')) return 'Use a password with at least 6 characters.';

  if (code.includes('too-many-requests')) return 'Too many attempts. Wait a moment and try again.';

  if (code.includes('requires-recent-login')) return 'For security, sign out and sign back in before changing the password.';

  if (code.includes('permission-denied')) return 'Permission denied. Staff accounts require the included Firestore rules to be deployed to the Red Road Firebase project.';

  if (code.includes('unavailable') || code.includes('network-request-failed')) return 'The service is temporarily unavailable. Nothing will auto-retry; try again when you are ready.';

  return error?.message ? String(error.message).replace(/^Firebase:\s*/i, '') : 'Something went wrong.';

}



function showSetupIfNeeded() {

  const setup = $('#firebase-setup-view');

  if (firebaseConfigured) return false;

  if (setup) setup.hidden = false;

  const memberLogin = $('#member-login-view');

  const ownerLogin = $('#owner-login-view');

  if (memberLogin) memberLogin.hidden = true;

  if (ownerLogin) ownerLogin.hidden = true;

  return true;

}



async function getStaffAccess(email, optional = false) {

  const cleanEmail = normalizedEmail(email);
  async function readRole(collectionName) {
    try { return await getDoc(doc(db, collectionName, cleanEmail)); }
    catch (error) {
      // A denied optional role check grants no role. Member access is still
      // checked independently by Firestore when reading the member record.
      if (optional && String(error?.code || '').includes('permission-denied')) return { exists: () => false };
      throw error;
    }
  }



  // Settle every speculative read so a lower-priority denied role cannot
  // reject an already-authorized developer or owner.
  const settled = promise => promise.then(value => ({value}), error => ({error}));
  const developerRead = settled(readRole('developers'));
  const ownerRead = settled(readRole('owners'));
  const coachRead = auth.currentUser?.emailVerified === true ? settled(readRole('members')) : null;
  const result = async promise => { const item = await promise; if (item.error) throw item.error; return item.value; };
  // Developer access remains console-managed and takes priority.


  const developerSnap = await result(developerRead);

  if (developerSnap.exists() && developerSnap.data()?.enabled === true) {

    return { id: developerSnap.id, role: 'developer', ...developerSnap.data() };

  }



  const ownerSnap = await result(ownerRead);

  if (ownerSnap.exists() && ownerSnap.data()?.enabled === true) {

    return { id: ownerSnap.id, role: 'owner', ...ownerSnap.data() };

  }



  // Coach access lives on the member record so waiver, attendance and staff

  // access always belong to one person instead of duplicated records.

  // A verified email is required before Firestore permits the member record

  // lookup. Skipping it here preserves the normal verification flow.

  if (auth.currentUser?.emailVerified === true) {

    const coachSnap = await result(coachRead);

    if (coachSnap.exists()) {

      const coach = coachSnap.data();

      if (coach.coachAccess === true && coach.enabled === true && coach.active === true && coach.archived !== true) {

        return { id: coachSnap.id, role: 'coach', ...coach };

      }

    }

  }



  return null;

}



async function getMemberRecord(email) {

  const ref = doc(db, 'members', normalizedEmail(email));

  const snap = await getDoc(ref); // exactly one Firestore document read

  return snap.exists() ? { id: snap.id, ...snap.data() } : null;

}



function renderMemberDashboard(member, userEmail) {

  currentMember = member;

  $('#member-login-view').hidden = true;

  $('#member-dashboard').hidden = false;

  $('#member-name').textContent = member.name || 'Member';

  $('#member-email-display').textContent = userEmail || member.email || '';

  $('#member-rank').textContent = formatRank(member);
  const rankNote = $('#member-rank-note');
  if (rankNote) rankNote.textContent = (member.rank || PENDING_RANK) === PENDING_RANK
    ? `Staff will confirm your rank.${member.selfReportedRank ? ' Self-reported: ' + member.selfReportedRank : ''}`
    : 'Current belt / rank';

  $('#member-plan').textContent = member.plan || '—';

  $('#member-joined').textContent = member.joinedAt || '—';

  $('#profile-phone').value = member.phone || '';
  $('#profile-self-reported-rank').value = member.selfReportedRank || '';

  $('#profile-address').value = member.address || '';

  $('#profile-emergency-name').value = member.emergencyName || '';

  $('#profile-emergency-phone').value = member.emergencyPhone || '';

  $('#profile-guardian-name').value = member.guardianName || '';

  $('#profile-household-email').value = member.householdEmail || '';



  const membershipActive = member.active === true && member.archived !== true;

  const portalEnabled = member.enabled === true && member.archived !== true;

  const paymentExempt = isPaymentExempt(member);

  const paid = memberBilling(member).current;

  const waiverSigned = member.waiverSigned === true;



  const activeLabel = $('#member-active-label');

  const paidLabel = $('#member-paid-label');

  const waiverLabel = $('#member-waiver-label');

  activeLabel.textContent = membershipActive ? 'Active' : 'Inactive';

  paidLabel.textContent = member._billingUnavailable ? 'Payment status unavailable — refresh to retry' : billingText(member);

  activeLabel.dataset.state = membershipActive ? 'good' : 'bad';

  paidLabel.dataset.state = paid ? 'good' : 'bad';

  waiverLabel.textContent = waiverSigned ? 'Signed' : 'Missing';

  waiverLabel.dataset.state = waiverSigned ? 'good' : 'bad';

  const waiverButton = $('#member-view-waiver');

  if (waiverButton) waiverButton.hidden = !waiverSigned;



  const note = $('#member-access-note');

  if (!portalEnabled) {

    note.hidden = false;

    note.textContent = 'Portal access has been disabled by Red Road. Contact the academy if you believe this is an error.';

    $('#member-dashboard').dataset.disabled = 'true';

  } else if (!membershipActive && waiverSigned) {

    note.hidden = false;

    note.textContent = 'Your waiver is signed and your membership is waiting for staff activation.';

    delete $('#member-dashboard').dataset.disabled;

  } else {

    note.hidden = true;

    delete $('#member-dashboard').dataset.disabled;

  }

}



async function openMemberForUser(user) {

  const message = $('#member-login-message');

  clearFlash(message);

  try {

    // One public login door: staff are routed to the Owner/Developer dashboard.

    // These are one-time document checks only; no listeners or polling.

    const staff = await getStaffAccess(user.email, true);

    if (staff) {

      window.location.replace('owner.html');

      return;

    }



    if (user.emailVerified !== true) {

      let verificationSent = false;
      try { await sendEmailVerification(user); verificationSent = true; } catch (_) {};

      await signOut(auth);

      flash(message, verificationSent ? 'A verification email has been sent. Open its link, then sign in again.' : 'Your login exists, but your email needs verification. The verification email could not be sent. Please try again later or contact Red Road staff.', 'error');

      return;

    }



    const member = await getMemberRecord(user.email);

    if (!member) {
      window.location.replace('enroll.html?continue=1');
      return;
    }

    try { await loadMyBilling(member.email); } catch (_) { member._billingUnavailable = true; }

    renderMemberDashboard(member, user.email);

  } catch (error) {

    flash(message, String(error?.code || '').includes('permission-denied') ? 'Your login succeeded, but your member profile could not be opened. Ask Red Road staff to check portal access for this email.' : friendlyError(error), 'error');

  }

}



function renderWaiverDetails(record, target) {

  if (!target) return;

  target.innerHTML = `

    <dl class="waiver-detail-grid">

      <div><dt>Participant</dt><dd>${esc(record.participantName || '—')}</dd></div>

      <div><dt>Date of Birth</dt><dd>${esc(record.dob || '—')}</dd></div>

      <div><dt>Signed</dt><dd>${esc(record.signedAt ? new Date(record.signedAt).toLocaleString() : '—')}</dd></div>

      <div><dt>Receipt</dt><dd>${esc(record.receiptId || '—')}</dd></div>

      <div><dt>Signature</dt><dd>${esc(record.electronicSignature || '—')}</dd></div>

      <div><dt>Phone</dt><dd>${esc(record.phone || '—')}</dd></div>

      <div><dt>Address</dt><dd>${esc(record.address || '—')}</dd></div>

      <div><dt>Emergency Contact</dt><dd>${esc(record.emergencyName || '—')}</dd></div>

      <div><dt>Emergency Phone</dt><dd>${esc(record.emergencyPhone || '—')}</dd></div>

      <div><dt>Guardian</dt><dd>${esc(record.guardianName || 'Not applicable')}</dd></div>

      <div><dt>Relationship</dt><dd>${esc(record.relationship || 'Not applicable')}</dd></div>

      <div><dt>Photo / Video Release</dt><dd>${record.photoVideoReleaseAccepted === true ? `Accepted · ${esc(record.photoVideoInitials || 'Initials recorded')}` : record.photoVideoReleaseAccepted === false ? 'Declined' : 'Not recorded on this waiver version'}</dd></div>

      ${record.trialClass === true ? `<div><dt>Trial Class</dt><dd>${esc(record.trialProgram || '—')}</dd></div><div><dt>Preferred Date</dt><dd>${esc(record.trialDate || '—')}</dd></div><div><dt>Trial Pass Valid Through</dt><dd>${esc(record.trialExpiresOn || '—')}</dd></div>` : ''}

      <div><dt>Waiver Version</dt><dd>${esc(record.waiverVersion || '—')}</dd></div>

    </dl>`;

  attachWaiverPrint(record,target);

}



async function loadWaiverRecord(email) {

  const snap = await getDoc(doc(db, 'waivers', normalizedEmail(email)));

  return snap.exists() ? snap.data() : null;

}



async function loadMemberAttendance(email) {

  const list = $('#member-attendance-list');

  if (!list) return;

  const snap = await getDocs(query(

    collection(db, 'attendance'),

    where('memberEmail', '==', normalizedEmail(email)),

    limit(250)

  ));

  memberAttendance = snap.docs.map(item => ({ id: item.id, ...item.data() }))

    .sort((a, b) => (b.checkedInAt?.toMillis?.() || 0) - (a.checkedInAt?.toMillis?.() || 0));

  renderMemberAttendanceMonth();

}



function renderMemberAttendanceMonth() {

  const list = $('#member-attendance-list');

  if (!list) return;

  const key = `${memberAttendanceMonth.getFullYear()}-${String(memberAttendanceMonth.getMonth() + 1).padStart(2, '0')}`;

  const records = memberAttendance.filter(record => String(record.classDate || '').startsWith(key));

  $('#member-attendance-month').textContent = memberAttendanceMonth.toLocaleDateString([], { month: 'long', year: 'numeric' });

  $('#member-attendance-count').textContent = String(records.length);

  const now = new Date();

  $('#attendance-next-month').disabled = memberAttendanceMonth.getFullYear() === now.getFullYear() && memberAttendanceMonth.getMonth() === now.getMonth();

  if (!records.length) {

    list.innerHTML = '<p class="portal-muted">No check-ins recorded for this month.</p>';

    return;

  }

  list.innerHTML = records.map(record => {

    const date = record.checkedInAt?.toDate?.();

    return `<div class="member-attendance-item"><strong>${esc(record.className || 'Class')}</strong><span>${esc(date ? date.toLocaleString([], { month:'short', day:'numeric', year:'numeric', hour:'numeric', minute:'2-digit' }) : record.classDate || '—')}</span></div>`;

  }).join('');

}



function setupMemberPage() {

  const form = $('#member-login-form');

  if (!form || showSetupIfNeeded()) return;



  const loginView = $('#member-login-view');

  const dashboard = $('#member-dashboard');

  const email = $('#member-email');

  const password = $('#member-password');

  const message = $('#member-login-message');



  listenAsync(form, 'submit', async event => {

    event.preventDefault();

    clearFlash(message);

    try {

      const credential = await signInWithEmailAndPassword(auth, normalizedEmail(email.value), password.value);

      await openMemberForUser(credential.user);

    } catch (error) {

      flash(message, friendlyError(error), 'error');

    }

  });



  setupEmailInvitation();

  listenAsync($('#member-reset'), 'click', async () => {

    clearFlash(message);

    const memberEmail = normalizedEmail(email.value);

    if (!memberEmail) {

      flash(message, 'Enter your email first, then press Forgot password.', 'error');

      return;

    }

    try {

      await sendPasswordResetEmail(auth, memberEmail);

      flash(message, 'Password reset email sent.');

    } catch (error) {

      flash(message, friendlyError(error), 'error');

    }

  });



  listenAsync($('#member-logout'), 'click', async () => {

    invalidateReport();

    await signOut(auth).catch(() => {});

    dashboard.hidden = true;

    loginView.hidden = false;

    password.value = '';

    currentMember = null;

    memberAttendance = [];

  });



  listenAsync($('#toggle-member-attendance'), 'click', async () => {

    const panel = $('#member-attendance-panel');

    panel.hidden = !panel.hidden;

    $('#toggle-member-attendance').setAttribute('aria-expanded', String(!panel.hidden));

    if (!panel.hidden && currentMember) {

      memberAttendanceMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);

      panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

      try { await loadMemberAttendance(currentMember.email); }

      catch (error) { $('#member-attendance-list').innerHTML = '<p class="portal-muted">Attendance could not be loaded. Please try again.</p>'; }

    }

  });



  $('#attendance-prev-month')?.addEventListener('click', () => { memberAttendanceMonth.setMonth(memberAttendanceMonth.getMonth() - 1); renderMemberAttendanceMonth(); });

  $('#attendance-next-month')?.addEventListener('click', () => { if (!$('#attendance-next-month').disabled) { memberAttendanceMonth.setMonth(memberAttendanceMonth.getMonth() + 1); renderMemberAttendanceMonth(); } });



  $('#toggle-member-profile')?.addEventListener('click', () => {

    const panel = $('#member-profile-panel');

    panel.hidden = !panel.hidden;

    $('#toggle-member-profile').setAttribute('aria-expanded', String(!panel.hidden));

  });



  listenAsync($('#member-profile-form'), 'submit', async event => {

    event.preventDefault();

    if (!currentMember) return;

    const dashboardMessage = $('#member-dashboard-message');

    clearFlash(dashboardMessage);

    const fd = new FormData(event.currentTarget);

    const updated = {

      ...currentMember,

      phone: clean(fd.get('phone'), 40),
      selfReportedRank: clean(fd.get('selfReportedRank'), 80),

      address: clean(fd.get('address'), 240),

      emergencyName: clean(fd.get('emergencyName'), 160),

      emergencyPhone: clean(fd.get('emergencyPhone'), 40),

      guardianName: clean(fd.get('guardianName'), 160),

      householdEmail: normalizedEmail(fd.get('householdEmail')),

      updatedAt: serverTimestamp()

    };

    try {

      const profileUpdate = {

        phone: updated.phone,
        selfReportedRank: updated.selfReportedRank,

        address: updated.address,

        emergencyName: updated.emergencyName,

        emergencyPhone: updated.emergencyPhone,

        guardianName: updated.guardianName,

        householdEmail: updated.householdEmail,

        updatedAt: updated.updatedAt

      };

      await setDoc(doc(db, 'members', normalizedEmail(currentMember.email)), profileUpdate, { merge: true });

      Object.assign(currentMember, updated);

      $('#member-profile-panel').hidden = true;

      $('#toggle-member-profile').setAttribute('aria-expanded', 'false');

      flash(dashboardMessage, 'Contact and emergency information updated.');

    } catch (error) {

      flash(dashboardMessage, friendlyError(error), 'error');

    }

  });



  listenAsync($('#member-view-waiver'), 'click', async () => {

    if (!currentMember) return;

    const dashboardMessage = $('#member-dashboard-message');

    clearFlash(dashboardMessage);

    try {

      const record = await loadWaiverRecord(currentMember.email);

      if (!record) return flash(dashboardMessage, 'The signed waiver record could not be found.', 'error');

      renderWaiverDetails(record, $('#member-waiver-details'));

      $('#member-waiver-panel').hidden = false;

      $('#member-waiver-panel').scrollIntoView({ behavior: 'smooth', block: 'nearest' });

    } catch (error) {

      flash(dashboardMessage, friendlyError(error), 'error');

    }

  });



  $('#close-member-waiver')?.addEventListener('click', () => { $('#member-waiver-panel').hidden = true; });



  onAuthStateChanged(auth, async user => {

    if (isAccountSetupOpen() || memberRestoreAttempted) return;

    memberRestoreAttempted = true;

    if (user) await openMemberForUser(user);

  });

}



function isPaymentExempt(member) {

  return member.coachAccess === true || member.paymentExempt === true;

}



function isPaymentCurrent(member) {

  return memberBilling(member).current;

}



function memberPayloadFromForm(form, previous = null) {

  const fd = new FormData(form);

  const email = normalizedEmail(fd.get('email') || previous?.email);

  const coachAccess = fd.get('coachAccess') === 'on';
  const rank = String(fd.get('rank') || PENDING_RANK);
  const stripes = rank === PENDING_RANK ? 0 : stripeCount(fd.get('stripes'));
  const metadata = assignRank(previous, rank, stripes, normalizedEmail(auth.currentUser?.email));

  return {

    email,

    name: String(fd.get('name') || '').trim(),

    rank,
    ...metadata,

    stripes,

    plan: String(fd.get('plan') || 'Adult'),

    paid: coachAccess || fd.get('paid') === 'on',

    paymentExempt: coachAccess || fd.get('paymentExempt') === 'on',

    coachAccess,

    active: fd.get('active') === 'on',

    enabled: fd.get('enabled') === 'on',

    archived: previous?.archived === true,

    joinedAt: String(fd.get('joinedAt') || previous?.joinedAt || todayIso()),

    waiverSigned: previous?.waiverSigned === true,

    waiverSignedAt: String(previous?.waiverSignedAt || ''),

    waiverReceiptId: String(previous?.waiverReceiptId || ''),

    phone: clean(fd.has('phone') ? fd.get('phone') : previous?.phone, 40),

    address: clean(fd.has('address') ? fd.get('address') : previous?.address, 240),

    emergencyName: clean(fd.has('emergencyName') ? fd.get('emergencyName') : previous?.emergencyName, 160),

    emergencyPhone: clean(fd.has('emergencyPhone') ? fd.get('emergencyPhone') : previous?.emergencyPhone, 40),

    guardianName: clean(fd.has('guardianName') ? fd.get('guardianName') : previous?.guardianName, 160),

    householdEmail: normalizedEmail(fd.has('householdEmail') ? fd.get('householdEmail') : previous?.householdEmail),

    kioskPin: clean(fd.get('kioskPin'), 4),

    createdAt: previous?.createdAt || serverTimestamp(),

    updatedAt: serverTimestamp()

  };

}



function visibleRoster() {

  const queryText = String($('#owner-search')?.value || '').trim().toLowerCase();

  const status = $('#owner-status-filter')?.value || 'all';

  const plan = $('#owner-plan-filter')?.value || 'all';

  return ownerMembers

    .filter(member => {

      const searchable = [member.name, member.email, member.phone, member.guardianName, member.householdEmail]

        .some(value => String(value || '').toLowerCase().includes(queryText));

      if (queryText && !searchable) return false;

      if (plan === 'service' && !['First Responder', 'Military / First Responder'].includes(member.plan)) return false;

      if (plan !== 'all' && plan !== 'service' && member.plan !== plan) return false;

      if (status === 'pending' && !(member.waiverSigned === true && member.active !== true && member.archived !== true)) return false;

      if (status === 'active' && !(member.active === true && member.archived !== true)) return false;

      if (status === 'past-due' && !(member.active === true && !isPaymentCurrent(member) && member.archived !== true)) return false;

      if (status === 'missing-waiver' && !(member.waiverSigned !== true && member.archived !== true)) return false;

      if (status === 'inactive' && !(member.active !== true && member.archived !== true)) return false;

      if (status === 'archived' && member.archived !== true) return false;

      return true;

    })

    .sort((a, b) => {

      const aPending = a.waiverSigned === true && a.active !== true && a.archived !== true;

      const bPending = b.waiverSigned === true && b.active !== true && b.archived !== true;

      if (aPending !== bPending) return Number(bPending) - Number(aPending);

      return a.archived === b.archived ? String(a.name).localeCompare(String(b.name)) : Number(a.archived) - Number(b.archived);

    });

}



function renderOwnerStats() {

  const roster = ownerMembers.filter(m => m.archived !== true);

  const total = roster.length;

  const active = roster.filter(m => m.active === true);

  const billable = active.filter(m => !isPaymentExempt(m));

  const paid = billable.filter(m => isPaymentCurrent(m));

  const pastDue = billable.filter(m => !isPaymentCurrent(m));

  const waivers = roster.filter(m => m.waiverSigned === true);

  const pending = roster.filter(m => m.waiverSigned === true && m.active !== true);

  const activePercent = total ? Math.round((active.length / total) * 100) : 0;

  const paidPercent = billable.length ? Math.round((paid.length / billable.length) * 100) : 100;



  $('#stat-members').textContent = String(total);

  $('#stat-pending').textContent = String(pending.length);

  $('#stat-pending-note').textContent = pending.length === 1 ? '1 signup to review' : `${pending.length} signups to review`;

  $('#stat-active-percent').textContent = `${activePercent}%`;

  $('#stat-active-count').textContent = `${active.length} active`;

  $('#stat-paid-percent').textContent = `${paidPercent}%`;

  $('#stat-paid-count').textContent = `${paid.length} current`;

  $('#stat-past-due').textContent = String(pastDue.length);

  $('#stat-waiver-percent').textContent = `${total ? Math.round((waivers.length / total) * 100) : 0}%`;

  if (!billingReady) { $('#stat-paid-percent').textContent = '—'; $('#stat-paid-count').textContent = (ownerBillingLoading ? 'Loading payment status…' : 'Billing unavailable'); $('#stat-past-due').textContent = '—'; }

  if (!ownerRosterLoaded) {

    ['stat-members','stat-pending','stat-active-percent','stat-paid-percent','stat-past-due','stat-waiver-percent'].forEach(id => { $('#'+id).textContent = '—'; });

    ['stat-pending-note','stat-active-count','stat-paid-count'].forEach(id => { $('#'+id).textContent = 'Roster not loaded'; });

  }

  $('#stat-waiver-count').textContent = ownerRosterLoaded ? `${waivers.length} signed` : 'Roster not loaded';

  const newTrials = ownerTrials.filter(trial => trial.status === 'new' && (!trial.trialExpiresOn || trial.trialExpiresOn >= todayIso())).length;

  $('#stat-trials').textContent = ownerTrialsLoaded ? String(ownerTrials.length) : '—';

  $('#stat-trials-note').textContent = ownerTrialsLoaded ? (newTrials === 1 ? '1 new request' : `${newTrials} new requests`) : 'Trials not loaded';

}



function statusPills(member) {

  const pills = [];

  if (member.waiverSigned === true && member.active !== true && member.archived !== true) pills.push('<span class="status-chip pending">Pending Approval</span>');

  pills.push(`<span class="status-chip ${member.active ? 'active' : 'paused'}">${member.active ? 'Active' : 'Inactive'}</span>`);

  pills.push(`<span class="status-chip ${!billingReady ? 'pending' : isPaymentCurrent(member) ? 'active' : 'past-due'}">${esc(billingReady ? billingText(member) : (ownerBillingLoading ? 'Loading payment status…' : 'Billing unavailable'))}</span>`);

  if (member.coachAccess === true) pills.push('<span class="status-chip active">Coach</span>');

  pills.push(`<span class="status-chip ${member.enabled ? 'active' : 'paused'}">${member.enabled ? 'Portal On' : 'Portal Off'}</span>`);

  pills.push(`<span class="status-chip ${member.waiverSigned ? 'active' : 'past-due'}">${member.waiverSigned ? 'Waiver Signed' : 'Waiver Missing'}</span>`);

  if (kioskModeEnabled) pills.push(`<span class="status-chip ${member.kioskReady ? 'active' : 'paused'}">${member.kioskReady ? 'Kiosk Ready' : member.kioskReady === false ? 'Set Check-In PIN' : 'Check PIN Setup'}</span>`);

  if (member.archived) pills.push('<span class="status-chip archived">Archived</span>');

  return pills.join('');

}



// Roster grouping only: a Coach program does not grant staff permissions.
function belongsInCoaches(member) {
  return member.coachAccess === true || String(member.plan || '').trim().toLowerCase() === 'coach';
}

function renderOwnerList(coaches = false) {
  coaches = coaches === true;

  const list = $(coaches ? '#owner-coach-list' : '#owner-member-list');

  const members = coaches ? ownerMembers.filter(belongsInCoaches).sort((a,b) => String(a.name||'').localeCompare(String(b.name||''))) : visibleRoster().filter(m => !belongsInCoaches(m));

  const note = $(coaches ? '#owner-coach-note' : '#owner-load-note');

  if (note) note.textContent = `Showing ${members.length} ${coaches ? 'coaches' : 'members'} · ${ownerMembers.length} total roster records loaded.`;

  if (!members.length) {

    list.innerHTML = coaches ? '<div class="owner-empty">No coaches in the loaded roster.</div>' : '<div class="owner-empty">No members match this view.</div>';

    return;

  }

  const canManage = ownerIdentity?.role === 'developer' || ownerIdentity?.role === 'owner';

  list.innerHTML = members.map(member => `

    <article class="member-row launch-member-row ${member.archived ? 'is-archived' : ''} ${member.waiverSigned === true && member.active !== true && member.archived !== true ? 'is-pending' : ''}" data-member-id="${esc(member.id || normalizedEmail(member.email))}" data-member-email="${esc(member.email)}">

      <div class="member-row-main"><strong>${esc(member.name)}</strong><span>${esc(member.email)}</span></div>

      <div class="member-row-meta"><span>${esc(formatRank(member))}</span><span>${esc(member.plan)}</span>${member.householdEmail ? `<span>Household: ${esc(member.householdEmail)}</span>` : ''}<div class="member-pills">${statusPills(member)}</div></div>

      <div class="member-row-actions">

        ${canManage ? '<button class="btn btn-mini btn-dark" type="button" data-action="edit">Edit</button>' : ''}
        ${canManage && !isPaymentExempt(member) && member.archived !== true && profiles.get(member.email)?.category !== 'family-covered' ? `<button class="btn btn-mini btn-dark" style="background:transparent;border-color:${isPaymentCurrent(member) ? '#28613f' : '#71313b'};color:${isPaymentCurrent(member) ? '#a9d8b6' : '#ffb1bb'};box-shadow:none" type="button" data-action="quick-paid" ${!billingReady || quickPaymentBusy ? 'disabled' : ''} title="${isPaymentCurrent(member) ? 'Click to mark unpaid.' : 'Click to mark paid. Use Edit to set a Paid on date for month-end expiry.'}" aria-label="${isPaymentCurrent(member) ? 'Paid. Click to mark unpaid.' : 'Unpaid. Click to mark paid.'}">${!billingReady ? (ownerBillingLoading ? 'Loading…' : 'Unavailable') : isPaymentCurrent(member) ? 'Paid' : 'Unpaid'}</button>` : ''}

        ${member.waiverSigned ? '<button class="btn btn-mini btn-dark" type="button" data-action="view-waiver">Waiver</button>' : ''}

        ${canManage ? '<button class="btn btn-mini btn-dark" type="button" data-action="reset-password">Reset Password</button>' : ''}

        ${canManage ? `<button class="btn btn-mini btn-dark" type="button" data-action="toggle-enabled">${member.enabled ? 'Disable' : 'Enable'}</button>` : ''}

        ${canManage ? '<button class="btn btn-mini btn-quiet" type="button" data-action="remove">Remove</button>' : ''}

      </div>

    </article>`).join('');

}



function renderPaymentAlerts() {

  const panel = $('#staff-payment-alerts');

  if (!panel) return;

  const allowed = ['owner','developer'].includes(ownerIdentity?.role);

  panel.hidden = !allowed;

  $('#staff-alerts-link').hidden = !allowed;

  const list = $('#payment-alert-list'), summary = $('#payment-alert-summary');

  list.replaceChildren();

  $('#payment-alert-more').hidden = !allowed || !waiverPages.members.more;

  if (!allowed) { summary.textContent = ''; return; }

  if (!ownerRosterLoaded || !billingReady) {

    summary.textContent = ownerBillingLoading ? 'Loading payment status…' : 'Payment alerts are unavailable until the roster and billing load. Use Refresh to retry.';

    return;

  }

  const alerts = activePaymentAlerts(ownerMembers, profiles);

  summary.textContent = alerts.length

    ? `${alerts.length} active account${alerts.length === 1 ? '' : 's'} need payment attention in the loaded roster.`

    : 'No active unpaid accounts in the loaded roster.';

  if (waiverPages.members.more) summary.textContent += ' More members are available; load more below to include them.';

  list.innerHTML = alerts.map(item => `<article class="member-row payment-alert-row">

    <div class="member-row-main"><strong>${esc(item.name)}</strong><span>${esc(item.email)}</span></div>

    <div class="member-row-meta"><span>${esc(item.category)}</span><span>${esc(item.description)}</span>${item.paidThrough ? `<span>Paid through ${esc(item.paidThrough)}</span>` : ''}${item.covered ? `<span>Family payer: ${esc(item.editEmail)}</span>` : ''}</div>

    <div class="member-row-actions"><button class="btn btn-dark btn-mini" type="button" data-alert-email="${esc(item.editEmail)}">${item.covered ? 'Edit Family Payer' : 'Edit Member'}</button></div>

  </article>`).join('');

}



function renderOwner() {

  displayedBillingDate=gymDate();

  renderPaymentAlerts();

  renderOwnerStats();

  renderOwnerList();
  renderOwnerList(true);

  renderWaiverLibrary();

}

let displayedBillingDate='';
function refreshBillingStatusForDateChange() {
  if (!document.querySelector('#owner-member-list') || !ownerIdentity) return;
  const today=gymDate();
  if (today!==displayedBillingDate) renderOwner();
}
setInterval(refreshBillingStatusForDateChange,60_000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshBillingStatusForDateChange();});



async function loadOwnerMembers(append = false) {

  // The roster remains usable during a rules rollout; kiosk readiness is an

  // optional second bounded read until the prod40 rules are deployed.

  const page = waiverPages.members;

  // Start independent reads together; optional kiosk data must not delay the roster.
  const directoryRead = getDocs(query(collection(db, 'checkInDirectory'), limit(MAX_OWNER_MEMBERS))).catch(() => null);
  ownerBillingLoading = true;
  const billingRead = loadBillingProfiles().catch(() => {}).finally(() => { ownerBillingLoading = false; });
  const loadingIdentity = ownerIdentity;
  const snap = await getDocsFromServer(query(collection(db, 'members'), ...(append && page.cursor ? [startAfter(page.cursor)] : []), limit(MAX_OWNER_MEMBERS)));
  if (!loadingIdentity || ownerIdentity !== loadingIdentity) return;

  const kioskReady = new Set();
  const directoryComplete = false;

  const records = snap.docs.map(d => { const data = d.data(); return { ...data, id: d.id, stripes: stripeCount(data.stripes), kioskReady: kioskReady.has(normalizedEmail(d.id)) ? true : directoryComplete ? false : null }; });

  ownerMembers = append ? [...new Map([...ownerMembers, ...records].map(m => [m.email, m])).values()] : records;



  ownerRosterLoaded = true;

  page.cursor = snap.docs.at(-1) || page.cursor;

  page.more = snap.docs.length === MAX_OWNER_MEMBERS;

  renderOwner();

  $('#owner-member-list').setAttribute('aria-busy', 'false');
  // Enrich kiosk readiness after the usable roster is visible. Do not overwrite
  // a newer roster or touch the page after this staff session has ended.
  const loadedRoster = ownerMembers;
  const loadedIdentity = ownerIdentity;
  directoryRead.then(directorySnap => {
    if (!directorySnap || !loadedIdentity || ownerIdentity !== loadedIdentity || ownerMembers !== loadedRoster) return;
    const ready = new Set(directorySnap.docs.map(item => normalizedEmail(item.id)));
    const complete = directorySnap.docs.length < MAX_OWNER_MEMBERS;
    ownerMembers.forEach(member => { member.kioskReady = ready.has(normalizedEmail(member.id)) ? true : complete ? false : null; });
    renderOwner();
  });


  // Names and membership details are already visible. Billing updates them
  // when ready; payment edits remain disabled until the authoritative read ends.
  await billingRead;
  if (ownerIdentity !== loadingIdentity || ownerMembers !== loadedRoster) return;
  renderOwner();
  fillBillingForm($('#add-member-form'),{paid:false,plan:$('#owner-plan').value},ownerMembers);
}



async function saveMember(member, previous = null, intent = null) {

  const email = normalizedEmail(member.email);

  if (!email) throw new Error('Member email is required.');



  // IMPORTANT: only persist fields explicitly allowed by firestore.rules.

  // Roster objects also carry local UI helpers such as `id`; those must never

  // be written back to Firestore or the rules will (correctly) reject them.

  const payload = {

    email,

    name: String(member.name || '').trim(),

    rank: String(member.rank || PENDING_RANK),
    ...rankMetadata(member),

    stripes: stripeCount(member.stripes),

    plan: String(member.plan || 'Adult'),

    paid: member.coachAccess === true || member.paid === true,

    paymentExempt: isPaymentExempt(member),

    coachAccess: member.coachAccess === true,

    active: member.active === true,

    enabled: member.enabled === true,

    archived: member.archived === true,

    joinedAt: String(member.joinedAt || previous?.joinedAt || todayIso()),

    waiverSigned: member.waiverSigned === true,

    waiverSignedAt: String(member.waiverSignedAt || previous?.waiverSignedAt || ''),

    waiverReceiptId: String(member.waiverReceiptId || previous?.waiverReceiptId || ''),

    phone: clean(member.phone, 40),

    address: clean(member.address, 240),

    emergencyName: clean(member.emergencyName, 160),

    emergencyPhone: clean(member.emergencyPhone, 40),

    guardianName: clean(member.guardianName, 160),

    householdEmail: normalizedEmail(member.householdEmail),

    createdAt: previous?.createdAt || member.createdAt || serverTimestamp(),

    updatedAt: member.updatedAt || serverTimestamp()

  };



  if (!kioskModeEnabled) {

    if (intent) await saveWithBilling(payload, previous, intent);

    else await setDoc(doc(db, 'members', email), payload, { merge: false });

    member.kioskReady = null;

    member.kioskPin = '';

    return;

  }



  const pin = String(member.kioskPin || '');

  if (pin && !/^\d{4}$/.test(pin)) throw new Error('Check-in PIN must be exactly four digits.');

  const directoryRef = doc(db, 'checkInDirectory', email);

  const existingDirectory = await getDoc(directoryRef);

  const existingData = existingDirectory.exists() ? existingDirectory.data() : null;

  const pinHash = pin ? await sha256(`${email}|${pin}`) : String(existingData?.pinHash || '');

  const shouldList = payload.active === true && payload.archived !== true && Boolean(pinHash);

  const directoryData = shouldList ? {memberEmail:email,displayName:payload.name,plan:payload.plan,pinHash,active:true,updatedAt:serverTimestamp()} : null;

  if (intent) {

    await saveWithBilling(payload, previous, intent, shouldList || existingDirectory.exists() ? {ref:directoryRef,data:directoryData} : null);

  } else {

    const batch = writeBatch(db);

    batch.set(doc(db,'members',email),payload,{merge:false});

    if(shouldList)batch.set(directoryRef,directoryData,{merge:false});

    else if(existingDirectory.exists())batch.delete(directoryRef);

    await batch.commit();

  }

  member.kioskReady = shouldList;

  member.kioskPin = '';

}



function openEditMember(member) {
  if (!billingReady) return flash($('#owner-message'), ownerBillingLoading ? 'Payment details are still loading. Please try Edit in a moment.' : 'Payment details could not load. Refresh before editing.', 'error');

  const panel = $('#edit-member-panel');

  panel.hidden = false;

  $('#edit-member-title').textContent = member.name || member.email;

  $('#edit-member-email').value = member.email;

  $('#edit-member-name').value = member.name || '';

  $('#edit-member-plan').value = member.plan || 'Adult';

  const rankSelect = $('#edit-member-rank');
  const currentRank = member.rank || PENDING_RANK;
  if (![...rankSelect.options].some(option => option.value === currentRank)) {
    rankSelect.add(new Option(currentRank, currentRank));
  }
  rankSelect.value = currentRank;
  const rankReview = $('#edit-rank-review');
  if (rankReview) rankReview.textContent = [
    member.selfReportedRank ? `Self-reported: ${member.selfReportedRank}.` : 'No self-reported rank.',
    member.rankVerifiedBy ? `Last rank assignment: ${member.rankVerifiedBy} on ${member.rankVerifiedAt}.` : 'Select the confirmed belt and stripes to assign rank.',
    ...(member.rankHistory || []).map(item => `${item.at}: ${item.from} (${item.fromStripes} stripes) → ${item.to} (${item.stripes} stripes), by ${item.by}.`)
  ].join('\n');

  $('#edit-member-stripes').value = String(stripeCount(member.stripes));

  $('#edit-member-joined').value = member.joinedAt || '';

  $('#edit-member-phone').value = member.phone || '';

  $('#edit-member-address').value = member.address || '';

  $('#edit-member-emergency-name').value = member.emergencyName || '';

  $('#edit-member-emergency-phone').value = member.emergencyPhone || '';

  $('#edit-member-guardian-name').value = member.guardianName || '';

  $('#edit-member-household-email').value = member.householdEmail || '';

  $('#edit-member-paid').checked = member.coachAccess === true || member.paid === true;

  $('#edit-member-payment-exempt').checked = isPaymentExempt(member);

  $('#edit-member-coach-access').checked = member.coachAccess === true;

  $('#edit-member-active').checked = member.active === true;

  $('#edit-member-enabled').checked = member.enabled === true;

  $('#edit-member-kiosk-pin').value = '';

  fillBillingForm($('#edit-member-form'),member,ownerMembers);

  panel.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });

  $('#edit-member-name').focus({ preventScroll: true });

}



function renderOwnerAccess() {

  const list = $('#owner-access-list');

  if (!list) return;

  if (!ownerAccess.length) {

    list.innerHTML = '<div class="owner-empty">No owners configured yet.</div>';

    return;

  }

  list.innerHTML = ownerAccess

    .sort((a, b) => String(a.name || a.email).localeCompare(String(b.name || b.email)))

    .map(person => `

      <article class="member-row launch-member-row" data-owner-email="${esc(person.email)}">

        <div class="member-row-main"><strong>${esc(person.name || 'Owner')}</strong><span>${esc(person.email)}</span></div>

        <div class="member-row-meta"><div class="member-pills"><span class="status-chip ${person.enabled ? 'active' : 'paused'}">${person.enabled ? 'Enabled' : 'Disabled'}</span><span class="status-chip">Owner</span></div></div>

        <div class="member-row-actions"><button class="btn btn-mini btn-dark" type="button" data-owner-action="toggle">${person.enabled ? 'Disable' : 'Enable'}</button></div>

      </article>`).join('');

}



async function loadOwnerAccess() {

  if (ownerIdentity?.role !== 'developer') return;

  const q = query(collection(db, 'owners'), limit(50));

  const snap = await getDocs(q);

  ownerAccess = snap.docs.map(d => ({ id: d.id, ...d.data() }));

  renderOwnerAccess();

}



async function saveOwnerAccess(person, previous = null) {

  if (ownerIdentity?.role !== 'developer') throw new Error('Developer access required.');

  const email = normalizedEmail(person.email);

  if (!email) throw new Error('Owner email is required.');

  const payload = {

    email,

    name: String(person.name || '').trim(),

    enabled: person.enabled === true,

    createdAt: previous?.createdAt || serverTimestamp(),

    updatedAt: serverTimestamp()

  };

  await setDoc(doc(db, 'owners', email), payload, { merge: false });

}



function renderKioskAccess() {

  const list = $('#kiosk-access-list');

  if (!list) return;

  if (!kioskAccess.length) {

    list.innerHTML = '<div class="owner-empty">No iPad kiosk approved yet.</div>';

    return;

  }

  list.innerHTML = kioskAccess

    .sort((a, b) => String(a.name || a.email).localeCompare(String(b.name || b.email)))

    .map(device => `

      <article class="member-row launch-member-row" data-kiosk-email="${esc(device.email)}">

        <div class="member-row-main"><strong>${esc(device.name || 'Check-In iPad')}</strong><span>${esc(device.email)}</span></div>

        <div class="member-row-meta"><div class="member-pills"><span class="status-chip ${device.enabled ? 'active' : 'paused'}">${device.enabled ? 'Enabled' : 'Disabled'}</span><span class="status-chip">Kiosk Only</span></div></div>

        <div class="member-row-actions"><button class="btn btn-mini btn-dark" type="button" data-kiosk-action="toggle">${device.enabled ? 'Disable' : 'Enable'}</button></div>

      </article>`).join('');

}



async function loadKioskAccess() {

  if (ownerIdentity?.role !== 'developer') return;

  const snap = await getDocs(query(collection(db, 'kiosks'), limit(50)));

  kioskAccess = snap.docs.map(item => ({ id: item.id, ...item.data() }));

  renderKioskAccess();

}



async function saveKioskAccess(device, previous = null) {

  if (ownerIdentity?.role !== 'developer') throw new Error('Developer access required.');

  const email = normalizedEmail(device.email);

  if (!email) throw new Error('Kiosk email is required.');

  await setDoc(doc(db, 'kiosks', email), {

    email,

    name: clean(device.name, 120),

    enabled: device.enabled === true,

    createdAt: previous?.createdAt || serverTimestamp(),

    updatedAt: serverTimestamp()

  }, { merge: false });

}



function renderAttendance() {

  const list = $('#attendance-list');

  if (!list) return;

  const today = localDateKey();

  const records = ownerAttendance.filter(record => record.classDate === today);

  $('#attendance-today-count').textContent = String(records.length);

  const last = records[0]?.checkedInAt?.toDate?.();

  $('#attendance-last-time').textContent = last ? last.toLocaleTimeString([], { hour:'numeric', minute:'2-digit' }) : '—';

  if (!records.length) {

    list.innerHTML = '<div class="owner-empty">No one has checked in today yet.</div>';

    return;

  }

  list.innerHTML = records.map(record => {

    const time = record.checkedInAt?.toDate?.();

    return `<article class="member-row attendance-row" data-attendance-id="${esc(record.id)}"><div class="member-row-main"><strong>${esc(record.memberName || 'Member')}</strong><span>${esc(record.memberEmail || '')}</span></div><div class="member-row-meta"><strong>${esc(record.className || 'Class')}</strong><time>${esc(time ? time.toLocaleTimeString([], { hour:'numeric', minute:'2-digit' }) : 'Time pending')}</time></div><div class="member-row-actions"><button class="btn btn-mini btn-quiet" data-attendance-action="remove" type="button">Undo</button></div></article>`;

  }).join('');

}



async function loadAttendance() {
  void loadTopAttendance();

  const snap = await getDocs(query(collection(db, 'attendance'), orderBy('checkedInAt', 'desc'), limit(250)));

  ownerAttendance = snap.docs.map(item => ({ id: item.id, ...item.data() }));

  renderAttendance();

}



function renderTrialRequests() {

  renderWaiverLibrary();

  const list = $('#trial-request-list');

  if (!list) return;

  if (!ownerTrials.length) {

    list.innerHTML = '<div class="owner-empty">No free-trial requests yet.</div>';

    renderOwnerStats();

    return;

  }

  list.innerHTML = ownerTrials.map(trial => {

    const submitted = trial.createdAt?.toDate?.();

    const status = String(trial.status || 'new');

    const expired = Boolean(trial.trialExpiresOn && trial.trialExpiresOn < todayIso());

    const photoRelease = trial.photoVideoReleaseAccepted === true

      ? `Photo Release: Yes (${esc(trial.photoVideoInitials || 'initialed')})`

      : 'Photo Release: No';

    return `<article class="member-row launch-member-row trial-request-row" data-trial-id="${esc(trial.id)}">

      <div class="member-row-main"><strong>${esc(trial.participantName || 'Trial Visitor')}</strong><span>${esc(trial.email || '')} · ${esc(trial.phone || '')}</span></div>

      <div class="member-row-meta"><span>${esc(trial.trialProgram || 'Trial Class')} · ${esc(trial.trialDate || 'Date not selected')}</span><span>Trial valid through ${esc(trial.trialExpiresOn || '—')}</span><span>${photoRelease}</span><span>${esc(submitted ? submitted.toLocaleString() : trial.signedAt || '')}</span><div class="member-pills"><span class="status-chip ${expired ? 'past-due' : status === 'new' ? 'pending' : 'active'}">${expired ? 'expired' : esc(status)}</span><span class="status-chip active">Waiver Signed</span></div></div>

      <div class="member-row-actions">

        <button class="btn btn-mini btn-dark" type="button" data-trial-action="view">Waiver</button>

        <button class="btn btn-mini btn-dark" type="button" data-trial-action="advance">${status === 'new' ? 'Mark Contacted' : status === 'contacted' ? 'Mark Completed' : 'Reopen'}</button>

        <button class="btn btn-mini btn-quiet" type="button" data-trial-action="remove">Remove</button>

      </div>

    </article>`;

  }).join('');

  renderOwnerStats();

}



async function loadTrialRequests(append = false) {

  const page = waiverPages.trials;

  const snap = await getDocs(query(collection(db, 'trialWaivers'), orderBy('createdAt', 'desc'), ...(append && page.cursor ? [startAfter(page.cursor)] : []), limit(250)));

  const records = snap.docs.map(item => ({ id: item.id, ...item.data() }));

  ownerTrials = append ? [...ownerTrials, ...records] : records;

  ownerTrialsLoaded = true;

  page.cursor = snap.docs.at(-1) || page.cursor;

  page.more = snap.docs.length === 250;

  renderTrialRequests();

}



function waiverLibraryEntries() {

  return [

    ...ownerMembers.filter(member=>member.waiverSigned).map(member=>({key:`member:${member.email}`,name:member.name,email:member.email,date:member.waiverSignedAt,receipt:member.waiverReceiptId,type:'Member'})),

    ...ownerTrials.map(record=>({key:`trial:${record.id}`,name:record.participantName,email:record.email,date:record.signedAt,receipt:record.receiptId,type:'Trial',record})),

    ...standaloneWaivers.map(record=>({key:`standalone:${record.id}`,name:record.participantName,email:record.email,date:record.signedAt,receipt:record.receiptId,type:'Waiver only',record:{...record,standalone:true}}))

  ].sort((a,b)=>String(b.date||'').localeCompare(String(a.date||'')));

}



function renderWaiverLibrary() {

  const list=$('#signed-waiver-list');

  if(!list)return;

  $('#waiver-load-more').hidden = !Object.values(waiverPages).some(page => page.more);

  const term=String($('#waiver-search')?.value||'').trim().toLowerCase();

  const records=waiverLibraryEntries().filter(record=>[record.name,record.email,record.receipt].some(value=>String(value||'').toLowerCase().includes(term)));

  $('#signed-waiver-count').textContent=`${records.length} saved ${records.length===1?'record':'records'} in loaded lists`;

  list.innerHTML=records.length?records.map(record=>`<article class="member-row launch-member-row"><div class="member-row-main"><strong>${esc(record.name||'Participant')}</strong><span>${esc(record.email)}</span></div><div class="member-row-meta"><span>${esc(record.type)} · ${esc(record.date?String(record.date).slice(0,10):'Date not recorded')}</span><span>Receipt ${esc(record.receipt||'Not recorded')}</span></div><div class="member-row-actions"><button type="button" class="btn btn-dark btn-mini" data-waiver-key="${esc(record.key)}">View / Print</button></div></article>`).join(''):'<div class="owner-empty">No signed waivers match the loaded records.</div>';

}



async function loadStandaloneWaivers(append = false) {

  const page = waiverPages.standalone;

  const snap=await getDocs(query(collection(db,'waiverSubmissions'),orderBy('createdAt','desc'),...(append && page.cursor ? [startAfter(page.cursor)] : []),limit(250)));

  const records=snap.docs.map(item=>({id:item.id,...item.data()}));

  standaloneWaivers=append ? [...standaloneWaivers,...records] : records;

  page.cursor=snap.docs.at(-1) || page.cursor;

  page.more=snap.docs.length===250;

  $('#waiver-library-message').hidden=true;

  renderWaiverLibrary();

}



function csvCell(value) {

  let text = String(value ?? '');

  if (/^[\s]*[=+\-@]|^[\t\r\n]/.test(text)) text = `'${text}`;

  return `"${text.replace(/"/g, '""')}"`;

}



function exportRosterCsv() {

  const columns = ['Name','Email','Phone','Plan','Rank','Stripes','Active','Paid','Payment Exempt','Coach Access','Waiver','Guardian','Household Email','Emergency Contact','Emergency Phone','Joined'];

  const rows = visibleRoster().map(member => [

    member.name, member.email, member.phone, member.plan, member.rank, member.stripes,

    member.active ? 'Yes' : 'No', isPaymentCurrent(member) ? 'Yes' : 'No', isPaymentExempt(member) ? 'Yes' : 'No', member.coachAccess ? 'Yes' : 'No', member.waiverSigned ? 'Yes' : 'No',

    member.guardianName, member.householdEmail, member.emergencyName, member.emergencyPhone,

    member.joinedAt

  ]);

  const csv = [columns, ...rows].map(row => row.map(csvCell).join(',')).join('\r\n');

  const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' }));

  const link = document.createElement('a');

  link.href = url;

  link.download = `red-road-members-${todayIso()}.csv`;

  document.body.append(link);

  link.click();

  link.remove();

  setTimeout(() => URL.revokeObjectURL(url), 1000);

}



function authorizeStaff(user) {

  const email = normalizedEmail(user.email);

  if (staffAuthorization?.email === email) return staffAuthorization.promise;

  const entry = { email, promise: null };

  entry.promise = authorizeStaffOnce(user).finally(() => { if (staffAuthorization === entry) staffAuthorization = null; });

  staffAuthorization = entry;

  return entry.promise;

}



async function authorizeStaffOnce(user) {

  const access = await getStaffAccess(user.email);

  if (!access) return null;

  ownerIdentity = { email: normalizedEmail(user.email), ...access };

  const developer = access.role === 'developer';

  const coach = access.role === 'coach';

  const roleName = developer ? 'Developer' : (coach ? 'Coach' : 'Owner');

  $('#owner-welcome').textContent = access.name ? `Welcome, ${access.name}.` : `Red Road ${roleName}`;

  $('#owner-email-display').textContent = user.email;

  $('#staff-role-brand').textContent = roleName;

  $('#staff-role-kicker').textContent = roleName;

  $('#dashboard-role-label').textContent = `${roleName} Dashboard`;

  const developerCard = $('#developer-access-card');

  if (developerCard) developerCard.hidden = !developer;

  const developerLink = $('#staff-developer-link');

  if (developerLink) developerLink.hidden = !developer;

  const addMemberButton = $('#toggle-add-member');

  if (addMemberButton) addMemberButton.hidden = coach;

  $('#owner-login-view').hidden = true;

  $('#owner-app').hidden = false;

  ownerRosterLoaded = false;

  ownerTrialsLoaded = false;

  $('#attendance-today-count').textContent = '—';

  $('#attendance-last-time').textContent = '—';

  renderOwnerStats();

  const loadStatus = $('#dashboard-load-status');

  flash(loadStatus, 'Loading your dashboard…');
  $('#owner-member-list').innerHTML = '<div class="owner-empty" role="status">Loading members and payment status…</div>';
  $('#owner-member-list').setAttribute('aria-busy', 'true');
  $('#owner-coach-list').textContent = 'Loading coaches…';

  const extraData = Promise.allSettled([
    loadTrialRequests().catch(() => {
      $('#trial-request-list').textContent = 'Trial requests could not load. Use Refresh Trials to retry.';
      $('#stat-trials').textContent = '—';
      $('#stat-trials-note').textContent = 'Not loaded';
    }),
    loadAttendance().catch(() => {
      $('#attendance-list').textContent = 'Attendance could not load. Use Refresh Attendance to retry.';
      $('#attendance-today-count').textContent = '—';
      $('#attendance-last-time').textContent = '—';
    }),
    loadStandaloneWaivers().catch(() => flash($('#waiver-library-message'),'Waivers could not load. Use Refresh Waivers to retry.','error')),
    (async () => {
      await loadAttendanceOptions().catch(() => { kioskModeEnabled = FEATURES.kioskAttendance === true; renderKioskMode(); });
      if (developer) await Promise.allSettled([loadOwnerAccess(), ...(kioskModeEnabled ? [loadKioskAccess()] : [])]);
    })()
  ]);

  let rosterError = null;

  try {

    try { await loadOwnerMembers(); }

    catch (error) {

      const code = String(error?.code || '');

      if (!/unavailable|deadline-exceeded|network-request-failed/.test(code)) throw error;

      flash(loadStatus, 'Connection interrupted. Retrying dashboard load once…');

      await loadOwnerMembers();

    }

  } catch (error) {

    rosterError = error;

    $('#owner-member-list').innerHTML = '<div class="owner-empty" role="status">The roster could not be loaded. Use Refresh to try again.</div>';
    $('#owner-coach-list').textContent = 'Coaches could not load. Use Refresh to try again.';

    flash(loadStatus, 'Dashboard data could not be loaded. ' + friendlyError(error) + ' Use Refresh to retry.', 'error');

  }

  $('#owner-member-list').setAttribute('aria-busy', 'false');

  setupBillingReport(!coach);
  if (!rosterError) clearFlash(loadStatus);
  await extraData;

  return access;

}



function setupOwnerPage() {

  const form = $('#owner-login-form');

  if (!form || showSetupIfNeeded()) return;

  renderKioskMode();



  const email = $('#owner-login-email');

  const password = $('#owner-login-password');

  const loginMessage = $('#owner-login-message');

  const ownerMessage = $('#owner-message');

  listenAsync($('#payment-alert-list'),'click',async event=>{

    const button = event.target.closest('button[data-alert-email]');

    if (!button || !['owner','developer'].includes(ownerIdentity?.role)) return;

    try {

      const email = normalizedEmail(button.dataset.alertEmail);

      let member = ownerMembers.find(m=>normalizedEmail(m.email)===email);

      if (!member) {

        const snap = await getDocFromServer(doc(db,'members',email));

        if (!snap.exists()) throw new Error('The family payer account was not found. Edit the covered member to assign a current family payer.');

        member = {...snap.data(),id:snap.id}; ownerMembers.push(member);

      }

      openEditMember(member);

    } catch (error) { flash(ownerMessage,friendlyError(error),'error'); }

  });

  listenAsync($('#payment-alert-more'),'click',async()=>{

    if (!['owner','developer'].includes(ownerIdentity?.role)) return;

    try { await loadOwnerMembers(true); }

    catch(error){ flash(ownerMessage,friendlyError(error),'error'); }

  });





  listenAsync($('#attendance-options-form'), 'submit', async event => {

    event.preventDefault();

    const message = $('#attendance-options-message');

    clearFlash(message);

    if (!['owner', 'developer'].includes(ownerIdentity?.role)) return flash(message, 'Owner access is required to change attendance options.', 'error');

    const enabled = $('#kiosk-mode-select').value === 'enabled';

    try {

      await setDoc(doc(db, 'appSettings', 'attendance'), {

        kioskEnabled: enabled,

        updatedAt: serverTimestamp(),

        updatedBy: normalizedEmail(auth.currentUser?.email)

      }, { merge: false });

      kioskModeEnabled = enabled;

      renderKioskMode();

      if (enabled && ownerIdentity?.role === 'developer') await loadKioskAccess().catch(() => {});

      flash(message, enabled ? 'Kiosk mode enabled. The shared-device setup is now available.' : 'Kiosk mode disabled. QR phone check-in remains active.');

    } catch (error) {

      flash(message, friendlyError(error), 'error');

    }

  });



  listenAsync(form, 'submit', async event => {

    event.preventDefault();

    clearFlash(loginMessage);

    try {

      const credential = await signInWithEmailAndPassword(auth, normalizedEmail(email.value), password.value);

      const owner = await authorizeStaff(credential.user);

      if (!owner) {

        await signOut(auth);

        flash(loginMessage, 'This email is not enabled as Red Road staff.', 'error');

      }

    } catch (error) {

      flash(loginMessage, friendlyError(error), 'error');

    }

  });



  listenAsync($('#owner-activate'), 'click', async () => {

    clearFlash(loginMessage);

    const ownerEmail = normalizedEmail(email.value);

    const ownerPassword = password.value;

    if (!ownerEmail || ownerPassword.length < 6) {

      flash(loginMessage, 'Enter the approved staff email and a password of at least 6 characters first.', 'error');

      return;

    }

    let credential = null;

    try {

      credential = await createUserWithEmailAndPassword(auth, ownerEmail, ownerPassword);

      const owner = await authorizeStaff(credential.user);

      if (!owner) {

        await deleteUser(credential.user).catch(() => {});

        flash(loginMessage, 'That email has not been approved as a Red Road Owner or Developer yet.', 'error');

      }

    } catch (error) {

      flash(loginMessage, friendlyError(error), 'error');

    }

  });



  listenAsync($('#owner-reset'), 'click', async () => {

    clearFlash(loginMessage);

    const ownerEmail = normalizedEmail(email.value);

    if (!ownerEmail) {

      flash(loginMessage, 'Enter your owner email first.', 'error');

      return;

    }

    try {

      await sendPasswordResetEmail(auth, ownerEmail);

      flash(loginMessage, 'Password reset email sent.');

    } catch (error) {

      flash(loginMessage, friendlyError(error), 'error');

    }

  });



  listenAsync($('#owner-logout'), 'click', async () => {

    invalidateReport();

    await signOut(auth).catch(() => {});

    ownerMembers = [];

    ownerAccess = [];

    kioskAccess = [];

    ownerAttendance = [];

    ownerTrials = [];

    standaloneWaivers = [];

    Object.values(waiverPages).forEach(page => { page.cursor = null; page.more = false; });

    $('#owner-waiver-details').replaceChildren();

    $('#owner-waiver-panel').hidden = true;

    $('#signed-waiver-list').replaceChildren();

    clearTopAttendance();
    ownerIdentity = null;

    renderPaymentAlerts();

    $('#owner-app').hidden = true;

    $('#owner-login-view').hidden = false;

    password.value = '';

  });



  $('#toggle-change-password')?.addEventListener('click', () => {

    const panel = $('#change-password-panel');

    panel.hidden = !panel.hidden;

    $('#toggle-change-password').setAttribute('aria-expanded', String(!panel.hidden));

    if (!panel.hidden) $('#staff-current-password')?.focus();

  });



  listenAsync($('#change-password-form'), 'submit', async event => {

    event.preventDefault();

    const form = event.currentTarget;

    clearFlash(ownerMessage);

    const currentPassword = String($('#staff-current-password')?.value || '');

    const newPassword = String($('#staff-new-password')?.value || '');

    const confirmPassword = String($('#staff-confirm-password')?.value || '');

    if (newPassword.length < 8) {

      flash(ownerMessage, 'Use a new password with at least 8 characters.', 'error');

      return;

    }

    if (newPassword !== confirmPassword) {

      flash(ownerMessage, 'The new passwords do not match.', 'error');

      return;

    }

    const user = auth.currentUser;

    if (!user?.email) {

      flash(ownerMessage, 'Sign in again before changing your password.', 'error');

      return;

    }

    try {

      const credential = EmailAuthProvider.credential(user.email, currentPassword);

      await reauthenticateWithCredential(user, credential);

      await updatePassword(user, newPassword);

      form.reset();

      $('#change-password-panel').hidden = true;

      $('#toggle-change-password').setAttribute('aria-expanded', 'false');

      flash(ownerMessage, 'Password updated successfully.');

    } catch (error) {

      flash(ownerMessage, friendlyError(error), 'error');

    }

  });



  listenAsync($('#owner-refresh'), 'click', async () => {

    clearFlash(ownerMessage);

    flash($('#dashboard-load-status'), 'Refreshing your dashboard…');

    try {

      await loadOwnerMembers();

      await loadTrialRequests();

      await loadAttendance();

      await loadStandaloneWaivers();

      if (ownerIdentity?.role === 'developer') await Promise.all([loadOwnerAccess(), ...(kioskModeEnabled ? [loadKioskAccess()] : [])]);

      flash(ownerMessage, ownerIdentity?.role === 'developer' ? 'Members and owner access refreshed once.' : 'Member list refreshed once.');

      clearFlash($('#dashboard-load-status'));

    } catch (error) {

      flash($('#dashboard-load-status'), 'Dashboard refresh could not finish. ' + friendlyError(error), 'error');

      flash(ownerMessage, friendlyError(error), 'error');

    }

  });



  listenAsync($('#attendance-refresh'), 'click', async () => {

    clearFlash(ownerMessage);

    try {

      await loadAttendance();

      flash(ownerMessage, 'Today’s attendance refreshed once.');

    } catch (error) {

      flash(ownerMessage, friendlyError(error), 'error');

    }

  });



  listenAsync($('#trial-refresh'), 'click', async () => {

    clearFlash(ownerMessage);

    try {

      await loadTrialRequests();

      flash(ownerMessage, 'Free-trial requests refreshed once.');

    } catch (error) {

      flash(ownerMessage, friendlyError(error), 'error');

    }

  });



  listenAsync($('#trial-request-list'), 'click', async event => {

    const button = event.target.closest('button[data-trial-action]');

    if (!button) return;

    const row = button.closest('[data-trial-id]');

    const trial = ownerTrials.find(item => item.id === row?.dataset.trialId);

    if (!trial) return;

    const action = button.dataset.trialAction;

    if (action === 'view') {

      $('#owner-waiver-title').textContent = `${trial.participantName || 'Trial Visitor'} · Free-Trial Waiver`;

      renderWaiverDetails(trial, $('#owner-waiver-details'));

      $('#owner-waiver-panel').hidden = false;

      $('#owner-waiver-panel').scrollIntoView({ behavior: 'smooth', block: 'nearest' });

      return;

    }

    if (action === 'remove') {

      if (!window.confirm(`Remove ${trial.participantName || 'this visitor'}'s trial request? The signed trial record will be deleted.`)) return;

      try {

        await deleteDoc(doc(db, 'trialWaivers', trial.id));

        ownerTrials = ownerTrials.filter(item => item.id !== trial.id);

        renderTrialRequests();

        flash(ownerMessage, 'Trial request removed.');

      } catch (error) {

        flash(ownerMessage, friendlyError(error), 'error');

      }

      return;

    }

    if (action === 'advance') {

      const status = trial.status === 'new' ? 'contacted' : trial.status === 'contacted' ? 'completed' : 'new';

      try {

        await setDoc(doc(db, 'trialWaivers', trial.id), { status, updatedAt: serverTimestamp() }, { merge: true });

        trial.status = status;

        renderTrialRequests();

        flash(ownerMessage, `${trial.participantName || 'Trial visitor'} marked ${status}.`);

      } catch (error) {

        flash(ownerMessage, friendlyError(error), 'error');

      }

    }

  });



  listenAsync($('#attendance-list'), 'click', async event => {

    const button = event.target.closest('[data-attendance-action="remove"]');

    if (!button) return;

    const row = button.closest('[data-attendance-id]');

    const record = ownerAttendance.find(item => item.id === row?.dataset.attendanceId);

    if (!record || !window.confirm(`Undo ${record.memberName}'s ${record.className} check-in?`)) return;

    try {

      await deleteDoc(doc(db, 'attendance', record.id));

      ownerAttendance = ownerAttendance.filter(item => item.id !== record.id);
      void loadTopAttendance();

      renderAttendance();

      flash(ownerMessage, `${record.memberName}'s check-in was removed.`);

    } catch (error) {

      flash(ownerMessage, friendlyError(error), 'error');

    }

  });



  $('#toggle-add-owner')?.addEventListener('click', () => {

    if (ownerIdentity?.role !== 'developer') return;

    const panel = $('#add-owner-panel');

    panel.hidden = !panel.hidden;

    $('#toggle-add-owner').setAttribute('aria-expanded', String(!panel.hidden));

  });



  listenAsync($('#add-owner-form'), 'submit', async event => {

    event.preventDefault();

    const form = event.currentTarget;

    clearFlash(ownerMessage);

    if (ownerIdentity?.role !== 'developer') {

      flash(ownerMessage, 'Developer access required.', 'error');

      return;

    }

    const fd = new FormData(form);

    const person = {

      name: String(fd.get('name') || '').trim(),

      email: normalizedEmail(fd.get('email')),

      enabled: fd.get('enabled') === 'on'

    };

    if (!person.name || !person.email) {

      flash(ownerMessage, 'Name and email are required.', 'error');

      return;

    }

    if (ownerAccess.some(item => normalizedEmail(item.email) === person.email)) {

      flash(ownerMessage, 'That owner email already exists.', 'error');

      return;

    }

    try {

      await saveOwnerAccess(person);

      ownerAccess.push({ ...person, createdAt: new Date(), updatedAt: new Date() });

      renderOwnerAccess();

      form.reset();

      form.querySelector('[name="enabled"]').checked = true;

      $('#add-owner-panel').hidden = true;

      $('#toggle-add-owner').setAttribute('aria-expanded', 'false');

      flash(ownerMessage, `${person.name} can now activate an Owner account with ${person.email}.`);

    } catch (error) {

      flash(ownerMessage, friendlyError(error), 'error');

    }

  });



  listenAsync($('#owner-access-list'), 'click', async event => {

    const button = event.target.closest('button[data-owner-action]');

    if (!button || ownerIdentity?.role !== 'developer') return;

    const row = button.closest('[data-owner-email]');

    const person = ownerAccess.find(item => normalizedEmail(item.email) === normalizedEmail(row?.dataset.ownerEmail));

    if (!person) return;

    const updated = { ...person, enabled: !person.enabled };

    try {

      await saveOwnerAccess(updated, person);

      person.enabled = updated.enabled;

      renderOwnerAccess();

      flash(ownerMessage, `${person.name || person.email} owner access ${person.enabled ? 'enabled' : 'disabled'}.`);

    } catch (error) {

      flash(ownerMessage, friendlyError(error), 'error');

    }

  });



  $('#toggle-add-kiosk')?.addEventListener('click', () => {

    if (ownerIdentity?.role !== 'developer') return;

    const panel = $('#add-kiosk-panel');

    panel.hidden = !panel.hidden;

    $('#toggle-add-kiosk').setAttribute('aria-expanded', String(!panel.hidden));

  });



  listenAsync($('#add-kiosk-form'), 'submit', async event => {

    event.preventDefault();

    const form = event.currentTarget;

    clearFlash(ownerMessage);

    const fd = new FormData(form);

    const device = { name: clean(fd.get('name'), 120), email: normalizedEmail(fd.get('email')), enabled: fd.get('enabled') === 'on' };

    if (!device.name || !device.email) return flash(ownerMessage, 'Kiosk device name and email are required.', 'error');

    if (kioskAccess.some(item => normalizedEmail(item.email) === device.email)) return flash(ownerMessage, 'That kiosk email is already approved.', 'error');

    try {

      await saveKioskAccess(device);

      kioskAccess.push({ ...device, createdAt: new Date(), updatedAt: new Date() });

      renderKioskAccess();

      form.reset();

      form.querySelector('[name="enabled"]').checked = true;

      $('#add-kiosk-panel').hidden = true;

      $('#toggle-add-kiosk').setAttribute('aria-expanded', 'false');

      flash(ownerMessage, `${device.name} approved. Open kiosk.html on the iPad and activate it with ${device.email}.`);

    } catch (error) {

      flash(ownerMessage, friendlyError(error), 'error');

    }

  });



  listenAsync($('#kiosk-access-list'), 'click', async event => {

    const button = event.target.closest('[data-kiosk-action="toggle"]');

    if (!button || ownerIdentity?.role !== 'developer') return;

    const row = button.closest('[data-kiosk-email]');

    const device = kioskAccess.find(item => normalizedEmail(item.email) === normalizedEmail(row?.dataset.kioskEmail));

    if (!device) return;

    const updated = { ...device, enabled: !device.enabled };

    try {

      await saveKioskAccess(updated, device);

      device.enabled = updated.enabled;

      renderKioskAccess();

      flash(ownerMessage, `${device.name} ${device.enabled ? 'enabled' : 'disabled'}.`);

    } catch (error) {

      flash(ownerMessage, friendlyError(error), 'error');

    }

  });



  $('#owner-search')?.addEventListener('input', renderOwnerList);

  $('#waiver-search')?.addEventListener('input',renderWaiverLibrary);

  listenAsync($('#waiver-load-more'),'click',async()=>{

    const results = await Promise.allSettled([

      waiverPages.members.more && loadOwnerMembers(true),

      waiverPages.trials.more && loadTrialRequests(true),

      waiverPages.standalone.more && loadStandaloneWaivers(true)

    ]);

    renderWaiverLibrary();

    if(results.some(result=>result.status==='rejected')) flash($('#waiver-library-message'),'Some older records could not be loaded. The records already shown are unchanged; use Load More to retry.','error');

  });

  listenAsync($('#waiver-refresh'),'click',async()=>{

    try { await Promise.all([loadOwnerMembers(),loadTrialRequests(),loadStandaloneWaivers()]);renderWaiverLibrary(); }

    catch(error){flash($('#waiver-library-message'),friendlyError(error),'error');}

  });

  listenAsync($('#signed-waiver-list'),'click',async event=>{

    const button=event.target.closest('[data-waiver-key]');if(!button)return;

    const item=waiverLibraryEntries().find(record=>record.key===button.dataset.waiverKey);if(!item)return;

    try {

      const record=item.record||await loadWaiverRecord(item.email);

      if(!record)throw new Error('The signed record could not be found.');

      $('#owner-waiver-title').textContent=`${item.name||'Participant'} · Signed Waiver`;

      renderWaiverDetails(record,$('#owner-waiver-details'));

      $('#owner-waiver-panel').hidden=false;

      $('#owner-waiver-panel').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'});

    }catch(error){flash($('#waiver-library-message'),friendlyError(error),'error');}

  });

  $('#owner-status-filter')?.addEventListener('change', renderOwnerList);

  $('#owner-plan-filter')?.addEventListener('change', renderOwnerList);

  $('#owner-export')?.addEventListener('click', () => {

    exportRosterCsv();

    flash(ownerMessage, `Exported ${visibleRoster().length} matching member records.`);

  });



  $('#toggle-add-member')?.addEventListener('click', () => {
    if (!billingReady) return flash(ownerMessage, 'Wait for payment details to load before adding a member. Use Refresh if needed.', 'error');

    if (ownerIdentity?.role === 'coach') return;

    const panel = $('#add-member-panel');

    panel.hidden = !panel.hidden;

    $('#toggle-add-member').setAttribute('aria-expanded', String(!panel.hidden));

    if (!panel.hidden && !$('#owner-joined').value) $('#owner-joined').value = todayIso();

  });



  document.querySelectorAll('input[name="coachAccess"]').forEach(input => {

    const coachForm = input.closest('form');

    coachForm?.querySelectorAll('input[name="paid"], input[name="paymentExempt"]').forEach(field => {

      field.addEventListener('change', () => {

        if (input.checked) field.checked = true;

      });

    });

    input.addEventListener('change', () => {

      if (!input.checked) return;

      const form = input.closest('form');

      const exempt = form?.querySelector('input[name="paymentExempt"]');

      const paid = form?.querySelector('input[name="paid"]');

      const active = form?.querySelector('input[name="active"]');

      const enabled = form?.querySelector('input[name="enabled"]');

      if (exempt) exempt.checked = true;

      if (paid) paid.checked = true;

      if (active) active.checked = true;

      if (enabled) enabled.checked = true;

    });

  });



  listenAsync($('#add-member-form'), 'submit', async event => {

    event.preventDefault();

    const form = event.currentTarget;

    clearFlash(ownerMessage);

    if (ownerIdentity?.role === 'coach') return flash(ownerMessage, 'Owner access required.', 'error');

    const member = memberPayloadFromForm(form);

    if (kioskModeEnabled && !/^\d{4}$/.test(member.kioskPin)) {

      flash(ownerMessage, 'Enter a four-digit check-in PIN for the new member.', 'error');

      return;

    }

    if (ownerMembers.some(m => normalizedEmail(m.email) === member.email)) {

      flash(ownerMessage, 'That member email already exists. Use Edit instead.', 'error');

      return;

    }

    try {

      await saveMember(member,null,billingIntent(form));

      invalidateReport();

      ownerMembers.push({ ...member, createdAt: new Date(), updatedAt: new Date() });

      form.reset();

      $('#owner-joined').value = todayIso();

      $('#add-member-panel').hidden = true;

      $('#toggle-add-member').setAttribute('aria-expanded', 'false');

      renderOwner();

      await loadOwnerMembers();

      flash(ownerMessage, 'Member added. They can now activate their account with this email.');

    } catch (error) {

      flash(ownerMessage, friendlyError(error), 'error');

    }

  });



  listenAsync($('#owner-app'), 'click', async event => {
    if (!event.target.closest('#owner-member-list, #owner-coach-list')) return;

    const button = event.target.closest('button[data-action]');

    if (!button) return;

    const row = button.closest('[data-member-email]');

    const member = ownerMembers.find(m => (m.id || normalizedEmail(m.email)) === row?.dataset.memberId);

    if (!member) return;



    if (button.dataset.action === 'quick-paid') {
      if (!['owner','developer'].includes(ownerIdentity?.role) || quickPaymentBusy) return;
      quickPaymentBusy = true;
      button.disabled = true; button.textContent = 'Saving…';
      try {
        const result = await toggleMemberPaid(member,ownerIdentity.role);
        Object.assign(member,result.member);
        invalidateReport();
        flash(ownerMessage,result.wantsPaid ? 'Marked paid. Use Edit to set the Paid on date for automatic month-end expiry.' : 'Marked unpaid.');
      } catch(error) { flash(ownerMessage,error.message || 'Could not update payment status. Refresh and try again.','error'); }
      finally { quickPaymentBusy=false;renderOwner(); }
      return;
    }

    if (button.dataset.action === 'edit') {

      openEditMember(member);

      return;

    }



    if (button.dataset.action === 'view-waiver') {

      try {

        const record = await loadWaiverRecord(member.email);

        if (!record) return flash(ownerMessage, 'The signed waiver record could not be found.', 'error');

        $('#owner-waiver-title').textContent = `${member.name} · Signed Waiver`;

        renderWaiverDetails(record, $('#owner-waiver-details'));

        $('#owner-waiver-panel').hidden = false;

        $('#owner-waiver-panel').scrollIntoView({ behavior: 'smooth', block: 'nearest' });

      } catch (error) {

        flash(ownerMessage, friendlyError(error), 'error');

      }

      return;

    }



    if (button.dataset.action === 'reset-password') {

      try {

        await sendPasswordResetEmail(auth, member.email);

        flash(ownerMessage, `Password reset email sent to ${member.email}.`);

      } catch (error) {

        flash(ownerMessage, friendlyError(error), 'error');

      }

      return;

    }



    if (button.dataset.action === 'remove') {

      const confirmed = window.confirm(

        `Permanently remove ${member.name} from Red Road?\n\nThis deletes the membership record, kiosk entry and attached waiver. Disable should be used when you only want to block access.`

      );

      if (!confirmed) return;

      let removalStatus = row.querySelector('.member-removal-status');

      if (!removalStatus) {

        removalStatus = document.createElement('p');

        removalStatus.className = 'flash-message member-removal-status';

        removalStatus.setAttribute('role', 'status');

        row.append(removalStatus);

      }

      flash(removalStatus, 'Deleting and confirming with the server…');

      try {

        await permanentlyRemoveMember(member);

        const deletedId = member.id || normalizedEmail(member.email);

        ownerMembers = ownerMembers.filter(m => (m.id || normalizedEmail(m.email)) !== deletedId);

        if ($('#edit-member-email')?.value === member.email) $('#edit-member-panel').hidden = true;

        renderOwner();

        flash(ownerMessage, `${member.name} permanently removed. Their roster record, kiosk entry and waiver are gone.`);

      } catch (error) {

        flash(removalStatus, friendlyError(error), 'error');

        flash(ownerMessage, friendlyError(error), 'error');

      }

      return;

    }



    const updated = { ...member, updatedAt: serverTimestamp() };

    if (button.dataset.action === 'toggle-enabled') updated.enabled = !member.enabled;



    try {

      await saveMember(updated, member);

      Object.assign(member, updated);

      renderOwner();

      flash(ownerMessage, `${member.name} portal access ${member.enabled ? 'enabled' : 'disabled'}.`);

    } catch (error) {

      flash(ownerMessage, friendlyError(error), 'error');

    }

  });



  listenAsync($('#edit-member-form'), 'submit', async event => {

    event.preventDefault();

    clearFlash(ownerMessage);

    if (ownerIdentity?.role === 'coach') return flash(ownerMessage, 'Owner access required.', 'error');

    const memberEmail = normalizedEmail($('#edit-member-email').value);

    const previous = ownerMembers.find(m => normalizedEmail(m.email) === memberEmail);

    if (!previous) return;

    const updated = memberPayloadFromForm(event.currentTarget, previous);

    updated.email = previous.email; // email/document ID is intentionally immutable in edit UI

    updated.archived = previous.archived === true;

    try {

      await saveMember(updated, previous, billingIntent(event.currentTarget));

      invalidateReport();

      Object.assign(previous, updated);

      await loadOwnerMembers();

      $('#edit-member-panel').hidden = true;

      renderOwner();

      flash(ownerMessage, `${updated.name} updated.`);

    } catch (error) {

      flash(ownerMessage, friendlyError(error), 'error');

    }

  });



  $('#close-edit-member')?.addEventListener('click', () => {

    $('#edit-member-panel').hidden = true;

  });

  $('#close-owner-waiver')?.addEventListener('click', () => { $('#owner-waiver-panel').hidden = true; });



  onAuthStateChanged(auth, async user => {

    if (ownerRestoreAttempted) return;

    ownerRestoreAttempted = true;

    if (!user) return;

    try {

      const owner = await authorizeStaff(user);

      if (!owner) await signOut(auth);

    } catch (error) {

      flash($('#owner-app').hidden ? loginMessage : $('#dashboard-load-status'), 'Sign-in could not finish. ' + friendlyError(error), 'error');

    }

  });

}



async function permanentlyRemoveMember(member) {

  if (!['owner', 'developer'].includes(ownerIdentity?.role)) throw new Error('Owner access required.');

  const email = normalizedEmail(member.email);

  await ensureNoCoveredMembers(email);

  const id = member.id || email;

  if (!email || !id) throw new Error('This record is missing its identity. Refresh the roster before deleting.');

  const refs = [doc(db, 'members', id), doc(db, 'checkInDirectory', email), doc(db, 'waivers', email)];

  const batch = writeBatch(db);

  refs.forEach(ref => batch.delete(ref));

  await batch.commit();

  let results;

  try { results = await Promise.all(refs.map(ref => getDocFromServer(ref))); }

  catch (_) { throw new Error('The delete was submitted, but server verification failed. Reconnect and Refresh before trying again.'); }

  if (results.some(snapshot => snapshot.exists())) throw new Error('A record is still present on the server. Refresh the roster; deletion could not be confirmed.');

}



document.addEventListener('visibilitychange',()=>{

  if(document.hidden)return;

  if(currentMember && !$('#member-dashboard')?.hidden)renderMemberDashboard(currentMember,currentMember.email);

  if(ownerIdentity && !$('#owner-app')?.hidden)renderOwner();

});

setupMemberPage();

setupOwnerPage();

if (firebaseConfigured) document.querySelectorAll('form[data-service-form]').forEach(form => { form.dataset.serviceReady = 'true'; });

