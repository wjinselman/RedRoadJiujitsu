import {runTransaction} from 'https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js';
import {
  firebaseConfigured,
  auth,
  db,
  signInAnonymously,
  doc,
  writeBatch,
  serverTimestamp,
  sendEmailVerification,
  signOut
} from './firebase-client.js?v=52';
import { localDate } from './ui-utils.js?v=49';
import { attachWaiverPrint } from './waiver-pdf.js?v=49';

const form = document.querySelector('#waiver-form');
if (!form) throw new Error('Waiver form not found.');

const dob = document.querySelector('#dob');
const minorFields = document.querySelector('#minor-fields');
const guardianName = document.querySelector('#guardianName');
const relationship = document.querySelector('#relationship');
const signatureName = document.querySelector('#signatureName');
const signaturePreview = document.querySelector('#signaturePreview');
const signatureDate = document.querySelector('#signatureDate');
const success = document.querySelector('#waiver-success');
const photoVideoRelease = document.querySelector('#photoVideoRelease');
const photoVideoInitials = document.querySelector('#photoVideoInitials');
const photoInitialsField = document.querySelector('#photo-initials-field');
const trialFields = document.querySelector('#trial-class-fields');
const trialProgram = document.querySelector('#trialProgram');
const trialDate = document.querySelector('#trialDate');
const submitButton = document.querySelector('#waiver-submit');
const params = new URLSearchParams(location.search);
const enrollmentMode = params.get('enrollment') === '1';
const trialMode = params.get('trial') === '1';
let submitting = false;
let completed = false;
let receiptForDownload = null;
let pendingEnrollment = null;
try { pendingEnrollment = JSON.parse(sessionStorage.getItem('redroad:pendingEnrollment') || 'null'); } catch (_) {}

signatureDate.value = localDate();
dob.max = localDate();
if (trialMode) {
  trialFields.hidden = false;
  trialProgram.required = true;
  trialDate.required = true;
  trialDate.min = localDate();
  document.querySelector('#waiver-kicker').textContent = 'Your First Class Is Free';
  document.querySelector('#waiver-title').innerHTML = 'Try One Class. <span class="red">No Account Needed.</span>';
  document.querySelector('#waiver-intro').textContent = 'Choose a class, read the complete waiver and sign online. Red Road staff will receive your trial request.';
  document.querySelector('#waiver-steps').innerHTML = '<span class="current"><b>1</b>Choose Class</span><span><b>2</b>Sign Waiver</span><span><b>3</b>Visit Red Road</span>';
  document.querySelector('#waiver-storage-note').innerHTML = '<strong>No membership account:</strong> Your trial request and signed waiver will be securely saved for Red Road staff review. You will not create a password or member profile.';
  submitButton.textContent = 'Submit Free Trial & Waiver';
} else if (enrollmentMode) {
  document.querySelector('#waiver-intro').textContent = 'Review the complete liability waiver and sign below to complete your membership enrollment.';
  const backLink = document.querySelector('#waiver-back-link');
  backLink.href = 'enroll.html?continue=1';
  backLink.textContent = 'Back to Member Information';
  submitButton.textContent = 'Sign Waiver & Complete Enrollment';
} else {
  document.querySelector('#waiver-steps').hidden = true;
}
[['participantName','name'],['dob','dob'],['email','email'],['phone','phone']].forEach(([id,key]) => {
  const element = document.getElementById(id);
  const value = enrollmentMode ? pendingEnrollment?.[key] : params.get(key);
  if (element && value) element.value = value;
});
// Clean legacy enrollment links after extracting the non-sensitive mode flags.
if (enrollmentMode && ['name','dob','email','phone'].some(key => params.has(key))) {
  history.replaceState(null, '', 'waiver.html?enrollment=1');
}
const receiptButton = document.createElement('button');
receiptButton.type = 'button'; receiptButton.className = 'btn btn-dark receipt-download';
receiptButton.textContent = 'Download original record (JSON)'; receiptButton.hidden = true;
success.after(receiptButton);
receiptButton.addEventListener('click', () => { if (receiptForDownload) downloadReceipt(receiptForDownload); });

function ageFromDob(value) {
  if (!value) return null;
  const birth = new Date(`${value}T12:00:00`);
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const month = now.getMonth() - birth.getMonth();
  if (month < 0 || (month === 0 && now.getDate() < birth.getDate())) age--;
  return age;
}

function addDaysIso(value, days) {
  const date = new Date(`${value}T12:00:00`);
  date.setDate(date.getDate() + days);
  return localDate(date);
}

function syncMinor() {
  const age = ageFromDob(dob.value);
  const minor = age !== null && age < 18;
  minorFields.hidden = !minor;
  guardianName.required = minor;
  relationship.required = minor;
}

function syncPhotoRelease() {
  const accepted = photoVideoRelease.checked;
  photoInitialsField.hidden = !accepted;
  photoVideoInitials.required = accepted;
  if (!accepted) photoVideoInitials.value = '';
}

function downloadReceipt(record) {
  const blob = new Blob([JSON.stringify(record, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `red-road-waiver-${record.receiptId}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function showError(message) {
  success.hidden = false;
  success.dataset.tone = 'error';
  success.textContent = message;
  success.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

dob.addEventListener('change', syncMinor);
photoVideoRelease.addEventListener('change', syncPhotoRelease);
signatureName.addEventListener('input', () => {
  signaturePreview.textContent = signatureName.value.trim() || 'Your signature';
});
syncMinor();
syncPhotoRelease();

form.addEventListener('submit', async event => {
  event.preventDefault();
  if (submitting || completed) return;
  syncMinor();
  if (!form.reportValidity()) return;

  const fd = new FormData(form);
  const age = ageFromDob(fd.get('dob'));
  if (!Number.isFinite(age) || age < 0) return showError('Enter a valid date of birth that is not in the future.');
  const signer = String(fd.get('signatureName') || '').trim();
  const participant = String(fd.get('participantName') || '').trim();
  const email = String(fd.get('email') || '').trim().toLowerCase();
  if (age >= 18 && signer.toLowerCase() !== participant.toLowerCase()) {
    if (!confirm('The participant and signature names are different. Continue only if this is intentional.')) return;
  }

  const signedAt = new Date().toISOString();
  const receiptId = `RR-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2,7).toUpperCase()}`;
  const record = {
    receiptId,
    waiverVersion: 'Red Road Liability Waiver PDF supplied 2026-09-14',
    signedAt,
    participantName: participant,
    dob: String(fd.get('dob') || ''),
    email,
    phone: String(fd.get('phone') || '').trim(),
    address: String(fd.get('address') || '').trim(),
    emergencyName: String(fd.get('emergencyName') || '').trim(),
    emergencyPhone: String(fd.get('emergencyPhone') || '').trim(),
    minor: age < 18,
    guardianName: String(fd.get('guardianName') || '').trim(),
    relationship: String(fd.get('relationship') || '').trim(),
    photoVideoReleaseAccepted: fd.get('photoVideoRelease') === 'on',
    photoVideoInitials: String(fd.get('photoVideoInitials') || '').trim().slice(0, 12),
    electronicSignature: signer,
    signatureDate: String(fd.get('signatureDate') || '')
  };

  const submit = form.querySelector('button[type="submit"]');
  submitting = true;
  form.setAttribute('aria-busy', 'true');
  submit.disabled = true;
  submit.textContent = 'Saving Waiver…';

  try {
    if (trialMode) {
      if (!firebaseConfigured || !auth || !db) {
        throw new Error('Free-trial requests are not connected yet. Firebase configuration is required.');
      }
      let user = auth.currentUser;
      const startedAnonymousSession = !user || user.isAnonymous === true;
      if (!user) user = (await signInAnonymously(auth)).user;
      const trialRecord = {
        ...record,
        trialClass: true,
        trialProgram: String(fd.get('trialProgram') || '').trim(),
        trialDate: String(fd.get('trialDate') || ''),
        trialExpiresOn: addDaysIso(String(fd.get('trialDate') || ''), 30),
        status: 'new',
        submitterUid: user.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };
      const batch = writeBatch(db);
      batch.set(doc(db, 'trialWaivers', receiptId), trialRecord);
      await batch.commit();
      completed = true;
      if (startedAnonymousSession) await signOut(auth).catch(() => {});
      receiptForDownload = { ...record, trialClass: true, trialProgram: trialRecord.trialProgram, trialDate: trialRecord.trialDate };
      success.hidden = false;
      delete success.dataset.tone;
      success.textContent = `Your free trial request is in. Red Road staff received your signed waiver for ${trialRecord.trialProgram} on ${trialRecord.trialDate}. Your trial pass is valid through ${trialRecord.trialExpiresOn}. Your receipt is ${receiptId}. No membership account was created.`;
    } else if (enrollmentMode) {
      const pending = JSON.parse(sessionStorage.getItem('redroad:pendingEnrollment') || 'null');
      const user = auth?.currentUser;
      if (!firebaseConfigured || !user || user.email?.toLowerCase() !== email || !pending) {
        throw new Error('Your signup session expired. Return to enrollment and begin again so the waiver can be attached to your account.');
      }

      const member = {
        email,
        name: participant,
        rank: 'White Belt',
        stripes: 0,
        plan: String(pending.program || 'Adult'),
        paid: false,
        paymentExempt: false,
        coachAccess: false,
        active: true,
        enabled: true,
        archived: false,
        joinedAt: signedAt.slice(0, 10),
        waiverSigned: true,
        waiverSignedAt: signedAt,
        waiverReceiptId: receiptId,
        phone: record.phone,
        address: record.address,
        emergencyName: record.emergencyName,
        emergencyPhone: record.emergencyPhone,
        guardianName: record.guardianName,
        householdEmail: record.minor ? email : '',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };
      const waiver = { ...record, signerUid: user.uid, createdAt: serverTimestamp() };
      await runTransaction(db, async transaction => {
        const memberRef = doc(db, 'members', email);
        const existing = await transaction.get(memberRef);
        if (existing.exists()) throw Error('Your membership already exists. Open Member Login; your existing member details have not been changed.');
        transaction.set(memberRef, member);
        transaction.set(doc(db, 'waivers', email), waiver);
      });
      completed = true;
      let verificationSent = true;
      if (!user.emailVerified) await sendEmailVerification(user).catch(() => { verificationSent = false; });
      await signOut(auth).catch(() => {});
      try {
        sessionStorage.removeItem('redroad:pendingEnrollment');
        sessionStorage.removeItem('redroad:enrollmentUid');
      } catch (_) {}
      receiptForDownload = record;
      success.hidden = false;
      delete success.dataset.tone;
      success.innerHTML = `<strong>Signup and waiver complete.</strong><br>Your membership is active. Staff record payments separately. ${user.emailVerified ? 'Your email is already verified.' : verificationSent ? 'Check your email and verify your address.' : 'The verification email could not be sent. Sign in at Member Login to request another verification email.'} Then use <a class="waiver-inline-link" href="members.html">Member Login</a> to view your status.`;
    } else {
      if (!firebaseConfigured || !auth || !db) throw new Error('Waiver storage is not connected. Nothing has been submitted. Ask Red Road staff for help.');
      let user = auth.currentUser;
      const startedAnonymousSession = !user || user.isAnonymous === true;
      if (!user) user = (await signInAnonymously(auth)).user;
      const batch = writeBatch(db);
      batch.set(doc(db, 'waiverSubmissions', receiptId), { ...record, signerUid: user.uid, createdAt: serverTimestamp() });
      await batch.commit();
      completed = true;
      if (startedAnonymousSession) await signOut(auth).catch(() => {});
      receiptForDownload = { ...record, standalone: true };
      success.hidden = false;
      delete success.dataset.tone;
      success.textContent = `Your signed waiver is saved with Red Road. Receipt ${receiptId}. Staff can review or print it whenever needed. You do not need to email or download anything.`;
    }
    receiptButton.hidden = !receiptForDownload;
    const delivery=document.createElement('div');
    delivery.className='waiver-copy-delivery';
    success.after(delivery);
    attachWaiverPrint(receiptForDownload,delivery);
    success.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'center' });
  } catch (error) {
    showError(String(error?.code || '').includes('permission-denied') ? 'Your waiver was not saved. Ask Red Road staff to check the waiver-storage setup before trying again.' : String(error?.message || 'The waiver could not be saved.'));
  } finally {
    submitting = false;
    form.removeAttribute('aria-busy');
    receiptButton.hidden = !receiptForDownload;
    submit.disabled = completed;
    submit.textContent = completed ? 'Completed' : trialMode ? 'Submit Free Trial & Waiver' : enrollmentMode ? 'Sign Waiver & Complete Enrollment' : 'Sign & Save Waiver';
  }
});
form.dataset.serviceReady = 'true';
