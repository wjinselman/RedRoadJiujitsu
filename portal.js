/*
  Red Road Jiu Jitsu — production portal
  ---------------------------------------
  Deliberately bounded Firestore usage:
    - Member page: one getDoc on login/session restore.
    - Staff page: Developer check (and Owner check if needed) + one bounded member query. Developer additionally loads a bounded owner list.
    - Refresh happens ONLY when the owner presses Refresh.
    - Writes happen ONLY when the owner presses Add/Save/Enable/Disable/Archive.
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
  updatePassword,
  reauthenticateWithCredential,
  EmailAuthProvider,
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
} from './firebase-client.js';
import { PRIMARY_OWNER, DEVELOPER } from './launch-config.js';

const MAX_OWNER_MEMBERS = 250;
let ownerMembers = [];
let ownerAccess = [];
let ownerIdentity = null;
let memberRestoreAttempted = false;
let ownerRestoreAttempted = false;

const $ = selector => document.querySelector(selector);
const esc = value => String(value ?? '').replace(/[&<>'"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));
const normalizedEmail = value => String(value || '').trim().toLowerCase();
const todayIso = () => new Date().toISOString().slice(0, 10);

const stripeCount = value => {
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 && n <= 4 ? n : 0;
};
const formatRank = member => {
  const belt = String(member?.rank || 'White Belt');
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

function friendlyError(error) {
  const code = error?.code || '';
  if (code.includes('invalid-credential') || code.includes('wrong-password') || code.includes('user-not-found')) return 'Email or password is incorrect.';
  if (code.includes('email-already-in-use')) return 'That email already has an account. Use Sign In instead.';
  if (code.includes('weak-password')) return 'Use a password with at least 6 characters.';
  if (code.includes('too-many-requests')) return 'Too many attempts. Wait a moment and try again.';
  if (code.includes('requires-recent-login')) return 'For security, sign out and sign back in before changing the password.';
  if (code.includes('permission-denied')) return 'This account does not have permission for that action.';
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

async function getStaffAccess(email) {
  const cleanEmail = normalizedEmail(email);

  // Developer is checked first. Developer access itself is console-managed only.
  const developerSnap = await getDoc(doc(db, 'developers', cleanEmail));
  if (developerSnap.exists() && developerSnap.data()?.enabled === true) {
    return { id: developerSnap.id, role: 'developer', ...developerSnap.data() };
  }

  const ownerSnap = await getDoc(doc(db, 'owners', cleanEmail));
  if (ownerSnap.exists() && ownerSnap.data()?.enabled === true) {
    return { id: ownerSnap.id, role: 'owner', ...ownerSnap.data() };
  }

  return null;
}

async function getMemberRecord(email) {
  const ref = doc(db, 'members', normalizedEmail(email));
  const snap = await getDoc(ref); // exactly one Firestore document read
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

function renderMemberDashboard(member, userEmail) {
  $('#member-login-view').hidden = true;
  $('#member-dashboard').hidden = false;
  $('#member-name').textContent = member.name || 'Member';
  $('#member-email-display').textContent = userEmail || member.email || '';
  $('#member-rank').textContent = formatRank(member);
  $('#member-plan').textContent = member.plan || '—';
  $('#member-joined').textContent = member.joinedAt || '—';

  const membershipActive = member.active === true && member.archived !== true;
  const portalEnabled = member.enabled === true && member.archived !== true;
  const paid = member.paid === true;

  const activeLabel = $('#member-active-label');
  const paidLabel = $('#member-paid-label');
  activeLabel.textContent = membershipActive ? 'Active' : 'Inactive';
  paidLabel.textContent = paid ? 'Paid / Current' : 'Past Due';
  activeLabel.dataset.state = membershipActive ? 'good' : 'bad';
  paidLabel.dataset.state = paid ? 'good' : 'bad';

  const note = $('#member-access-note');
  if (!portalEnabled) {
    note.hidden = false;
    note.textContent = 'Portal access has been disabled by Red Road. Contact the academy if you believe this is an error.';
    $('#member-dashboard').dataset.disabled = 'true';
  } else {
    note.hidden = true;
    delete $('#member-dashboard').dataset.disabled;
  }
}

async function openMemberForUser(user) {
  const message = $('#member-login-message');
  clearFlash(message);
  try {
    const member = await getMemberRecord(user.email);
    if (!member) {
      await signOut(auth);
      flash(message, 'Red Road has not added this email to the member roster yet.', 'error');
      return;
    }
    renderMemberDashboard(member, user.email);
  } catch (error) {
    flash(message, friendlyError(error), 'error');
  }
}

function setupMemberPage() {
  const form = $('#member-login-form');
  if (!form || showSetupIfNeeded()) return;

  const loginView = $('#member-login-view');
  const dashboard = $('#member-dashboard');
  const email = $('#member-email');
  const password = $('#member-password');
  const message = $('#member-login-message');

  form.addEventListener('submit', async event => {
    event.preventDefault();
    clearFlash(message);
    try {
      const credential = await signInWithEmailAndPassword(auth, normalizedEmail(email.value), password.value);
      await openMemberForUser(credential.user);
    } catch (error) {
      flash(message, friendlyError(error), 'error');
    }
  });

  $('#member-activate')?.addEventListener('click', async () => {
    clearFlash(message);
    const memberEmail = normalizedEmail(email.value);
    const memberPassword = password.value;
    if (!memberEmail || memberPassword.length < 6) {
      flash(message, 'Enter your member email and a password of at least 6 characters first.', 'error');
      return;
    }
    let credential = null;
    try {
      credential = await createUserWithEmailAndPassword(auth, memberEmail, memberPassword);
      const member = await getMemberRecord(credential.user.email);
      if (!member) {
        await deleteUser(credential.user).catch(() => {});
        flash(message, 'That email is not on the Red Road member roster yet. Ask the owner to add it first.', 'error');
        return;
      }
      renderMemberDashboard(member, credential.user.email);
    } catch (error) {
      flash(message, friendlyError(error), 'error');
    }
  });

  $('#member-reset')?.addEventListener('click', async () => {
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

  $('#member-logout')?.addEventListener('click', async () => {
    await signOut(auth).catch(() => {});
    dashboard.hidden = true;
    loginView.hidden = false;
    password.value = '';
  });

  onAuthStateChanged(auth, async user => {
    if (memberRestoreAttempted) return;
    memberRestoreAttempted = true;
    if (user) await openMemberForUser(user);
  });
}

function memberPayloadFromForm(form, previous = null) {
  const fd = new FormData(form);
  const email = normalizedEmail(fd.get('email') || previous?.email);
  return {
    email,
    name: String(fd.get('name') || '').trim(),
    rank: String(fd.get('rank') || 'White Belt'),
    stripes: stripeCount(fd.get('stripes')),
    plan: String(fd.get('plan') || 'Adult'),
    paid: fd.get('paid') === 'on',
    active: fd.get('active') === 'on',
    enabled: fd.get('enabled') === 'on',
    archived: previous?.archived === true,
    joinedAt: String(fd.get('joinedAt') || previous?.joinedAt || todayIso()),
    createdAt: previous?.createdAt || serverTimestamp(),
    updatedAt: serverTimestamp()
  };
}

function visibleRoster() {
  const search = normalizedEmail($('#owner-search')?.value);
  const queryText = String($('#owner-search')?.value || '').trim().toLowerCase();
  return ownerMembers
    .filter(member => !queryText || member.name?.toLowerCase().includes(queryText) || member.email?.toLowerCase().includes(queryText))
    .sort((a, b) => (a.archived === b.archived ? String(a.name).localeCompare(String(b.name)) : Number(a.archived) - Number(b.archived)));
}

function renderOwnerStats() {
  const roster = ownerMembers.filter(m => m.archived !== true);
  const total = roster.length;
  const active = roster.filter(m => m.active === true);
  const paid = active.filter(m => m.paid === true);
  const pastDue = active.filter(m => m.paid !== true);
  const activePercent = total ? Math.round((active.length / total) * 100) : 0;
  const paidPercent = active.length ? Math.round((paid.length / active.length) * 100) : 0;

  $('#stat-members').textContent = String(total);
  $('#stat-active-percent').textContent = `${activePercent}%`;
  $('#stat-active-count').textContent = `${active.length} active`;
  $('#stat-paid-percent').textContent = `${paidPercent}%`;
  $('#stat-paid-count').textContent = `${paid.length} current`;
  $('#stat-past-due').textContent = String(pastDue.length);
}

function statusPills(member) {
  const pills = [];
  pills.push(`<span class="status-chip ${member.active ? 'active' : 'paused'}">${member.active ? 'Active' : 'Inactive'}</span>`);
  pills.push(`<span class="status-chip ${member.paid ? 'active' : 'past-due'}">${member.paid ? 'Paid' : 'Past Due'}</span>`);
  pills.push(`<span class="status-chip ${member.enabled ? 'active' : 'paused'}">${member.enabled ? 'Portal On' : 'Portal Off'}</span>`);
  if (member.archived) pills.push('<span class="status-chip archived">Archived</span>');
  return pills.join('');
}

function renderOwnerList() {
  const list = $('#owner-member-list');
  const members = visibleRoster();
  if (!members.length) {
    list.innerHTML = '<div class="owner-empty">No members match this view.</div>';
    return;
  }
  list.innerHTML = members.map(member => `
    <article class="member-row launch-member-row ${member.archived ? 'is-archived' : ''}" data-member-email="${esc(member.email)}">
      <div class="member-row-main"><strong>${esc(member.name)}</strong><span>${esc(member.email)}</span></div>
      <div class="member-row-meta"><span>${esc(formatRank(member))}</span><span>${esc(member.plan)}</span><div class="member-pills">${statusPills(member)}</div></div>
      <div class="member-row-actions">
        <button class="btn btn-mini btn-dark" type="button" data-action="edit">Edit</button>
        <button class="btn btn-mini btn-dark" type="button" data-action="reset-password">Reset Password</button>
        <button class="btn btn-mini btn-dark" type="button" data-action="toggle-enabled">${member.enabled ? 'Disable' : 'Enable'}</button>
        <button class="btn btn-mini btn-quiet" type="button" data-action="archive">${member.archived ? 'Restore' : 'Remove'}</button>
      </div>
    </article>`).join('');
}

function renderOwner() {
  renderOwnerStats();
  renderOwnerList();
}

async function loadOwnerMembers() {
  // ONE bounded query. No listener. No auto-refresh.
  const q = query(collection(db, 'members'), limit(MAX_OWNER_MEMBERS));
  const snap = await getDocs(q);
  ownerMembers = snap.docs.map(d => { const data = d.data(); return { id: d.id, ...data, stripes: stripeCount(data.stripes) }; });
  renderOwner();
}

async function saveMember(member, previous = null) {
  const email = normalizedEmail(member.email);
  if (!email) throw new Error('Member email is required.');

  // IMPORTANT: only persist fields explicitly allowed by firestore.rules.
  // Roster objects also carry local UI helpers such as `id`; those must never
  // be written back to Firestore or the rules will (correctly) reject them.
  const payload = {
    email,
    name: String(member.name || '').trim(),
    rank: String(member.rank || 'White Belt'),
    stripes: stripeCount(member.stripes),
    plan: String(member.plan || 'Adult'),
    paid: member.paid === true,
    active: member.active === true,
    enabled: member.enabled === true,
    archived: member.archived === true,
    joinedAt: String(member.joinedAt || previous?.joinedAt || todayIso()),
    createdAt: previous?.createdAt || member.createdAt || serverTimestamp(),
    updatedAt: member.updatedAt || serverTimestamp()
  };

  await setDoc(doc(db, 'members', email), payload, { merge: false }); // exactly one explicit write
}

function openEditMember(member) {
  const panel = $('#edit-member-panel');
  panel.hidden = false;
  $('#edit-member-title').textContent = member.name || member.email;
  $('#edit-member-email').value = member.email;
  $('#edit-member-name').value = member.name || '';
  $('#edit-member-plan').value = member.plan || 'Adult';
  $('#edit-member-rank').value = member.rank || 'White Belt';
  $('#edit-member-stripes').value = String(stripeCount(member.stripes));
  $('#edit-member-joined').value = member.joinedAt || '';
  $('#edit-member-paid').checked = member.paid === true;
  $('#edit-member-active').checked = member.active === true;
  $('#edit-member-enabled').checked = member.enabled === true;
  panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function renderOwnerAccess() {
  const list = $('#owner-access-list');
  if (!list) return;
  if (!ownerAccess.length) {
    list.innerHTML = '<div class="owner-empty">No owners or coaches configured yet.</div>';
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

async function authorizeStaff(user) {
  const access = await getStaffAccess(user.email);
  if (!access) return null;
  ownerIdentity = { email: normalizedEmail(user.email), ...access };
  const developer = access.role === 'developer';
  $('#owner-welcome').textContent = access.name ? `Welcome, ${access.name}.` : (developer ? 'Red Road Developer' : 'Red Road Owner');
  $('#owner-email-display').textContent = user.email;
  $('#staff-role-brand').textContent = developer ? 'Developer' : 'Owner';
  $('#staff-role-kicker').textContent = developer ? 'Developer' : 'Owner';
  $('#dashboard-role-label').textContent = developer ? 'Developer Dashboard' : 'Owner Dashboard';
  const developerCard = $('#developer-access-card');
  if (developerCard) developerCard.hidden = !developer;
  $('#owner-login-view').hidden = true;
  $('#owner-app').hidden = false;
  await loadOwnerMembers();
  if (developer) await loadOwnerAccess();
  return access;
}

function setupOwnerPage() {
  const form = $('#owner-login-form');
  if (!form || showSetupIfNeeded()) return;

  const email = $('#owner-login-email');
  const password = $('#owner-login-password');
  const loginMessage = $('#owner-login-message');
  const ownerMessage = $('#owner-message');

  // Convenience only — security comes from Firestore rules, not this prefill.
  if (email && !email.value && PRIMARY_OWNER?.email) email.value = PRIMARY_OWNER.email;

  form.addEventListener('submit', async event => {
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

  $('#owner-activate')?.addEventListener('click', async () => {
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

  $('#owner-reset')?.addEventListener('click', async () => {
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

  $('#owner-logout')?.addEventListener('click', async () => {
    await signOut(auth).catch(() => {});
    ownerMembers = [];
    ownerAccess = [];
    ownerIdentity = null;
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

  $('#change-password-form')?.addEventListener('submit', async event => {
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

  $('#owner-refresh')?.addEventListener('click', async () => {
    clearFlash(ownerMessage);
    try {
      await loadOwnerMembers();
      if (ownerIdentity?.role === 'developer') await loadOwnerAccess();
      flash(ownerMessage, ownerIdentity?.role === 'developer' ? 'Members and owner access refreshed once.' : 'Member list refreshed once.');
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

  $('#add-owner-form')?.addEventListener('submit', async event => {
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

  $('#owner-access-list')?.addEventListener('click', async event => {
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

  $('#owner-search')?.addEventListener('input', renderOwnerList);

  $('#toggle-add-member')?.addEventListener('click', () => {
    const panel = $('#add-member-panel');
    panel.hidden = !panel.hidden;
    $('#toggle-add-member').setAttribute('aria-expanded', String(!panel.hidden));
    if (!panel.hidden && !$('#owner-joined').value) $('#owner-joined').value = todayIso();
  });

  $('#add-member-form')?.addEventListener('submit', async event => {
    event.preventDefault();
    const form = event.currentTarget;
    clearFlash(ownerMessage);
    const member = memberPayloadFromForm(form);
    if (ownerMembers.some(m => normalizedEmail(m.email) === member.email)) {
      flash(ownerMessage, 'That member email already exists. Use Edit instead.', 'error');
      return;
    }
    try {
      await saveMember(member);
      ownerMembers.push({ ...member, createdAt: new Date(), updatedAt: new Date() });
      form.reset();
      $('#owner-joined').value = todayIso();
      $('#add-member-panel').hidden = true;
      $('#toggle-add-member').setAttribute('aria-expanded', 'false');
      renderOwner();
      flash(ownerMessage, 'Member added. They can now activate their account with this email.');
    } catch (error) {
      flash(ownerMessage, friendlyError(error), 'error');
    }
  });

  $('#owner-member-list')?.addEventListener('click', async event => {
    const button = event.target.closest('button[data-action]');
    if (!button) return;
    const row = button.closest('[data-member-email]');
    const member = ownerMembers.find(m => normalizedEmail(m.email) === normalizedEmail(row?.dataset.memberEmail));
    if (!member) return;

    if (button.dataset.action === 'edit') {
      openEditMember(member);
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

    const updated = { ...member, updatedAt: serverTimestamp() };
    if (button.dataset.action === 'toggle-enabled') updated.enabled = !member.enabled;
    if (button.dataset.action === 'archive') {
      updated.archived = !member.archived;
      if (updated.archived) {
        updated.enabled = false;
        updated.active = false;
      }
    }

    try {
      await saveMember(updated, member);
      Object.assign(member, updated);
      renderOwner();
      flash(ownerMessage, button.dataset.action === 'archive'
        ? `${member.name} ${member.archived ? 'removed from the active roster' : 'restored'}.`
        : `${member.name} portal access ${member.enabled ? 'enabled' : 'disabled'}.`);
    } catch (error) {
      flash(ownerMessage, friendlyError(error), 'error');
    }
  });

  $('#edit-member-form')?.addEventListener('submit', async event => {
    event.preventDefault();
    clearFlash(ownerMessage);
    const memberEmail = normalizedEmail($('#edit-member-email').value);
    const previous = ownerMembers.find(m => normalizedEmail(m.email) === memberEmail);
    if (!previous) return;
    const updated = memberPayloadFromForm(event.currentTarget, previous);
    updated.email = previous.email; // email/document ID is intentionally immutable in edit UI
    updated.archived = previous.archived === true;
    try {
      await saveMember(updated, previous);
      Object.assign(previous, updated);
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

  onAuthStateChanged(auth, async user => {
    if (ownerRestoreAttempted) return;
    ownerRestoreAttempted = true;
    if (!user) return;
    try {
      const owner = await authorizeStaff(user);
      if (!owner) await signOut(auth);
    } catch (_) {
      // Stop here. No retry loop.
    }
  });
}

setupMemberPage();
setupOwnerPage();
