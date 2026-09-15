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
} from './firebase-client.js';

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

signatureDate.value = new Date().toISOString().slice(0, 10);
if (trialMode) {
  trialFields.hidden = false;
  trialProgram.required = true;
  trialDate.required = true;
  trialDate.min = new Date().toISOString().slice(0, 10);
  document.querySelector('#waiver-kicker').textContent = 'Your First Class Is Free';
  document.querySelector('#waiver-title').innerHTML = 'Try One Class. <span class="red">No Account Needed.</span>';
  document.querySelector('#waiver-intro').textContent = 'Choose a class, read the complete waiver and sign online. Red Road staff will receive your trial request.';
  document.querySelector('#waiver-steps').innerHTML = '<span class="current"><b>1</b>Choose Class</span><span><b>2</b>Sign Waiver</span><span><b>3</b>Visit Red Road</span>';
  document.querySelector('#waiver-storage-note').innerHTML = '<strong>No membership account:</strong> Your trial request and signed waiver will be securely saved for Red Road staff review. You will not create a password or member profile.';
  submitButton.textContent = 'Submit Free Trial & Waiver';
}
[['participantName','name'],['dob','dob'],['email','email'],['phone','phone']].forEach(([id,key]) => {
  const element = document.getElementById(id);
  const value = params.get(key);
  if (element && value) element.value = value;
});

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
  return date.toISOString().slice(0, 10);
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
  syncMinor();
  if (!form.reportValidity()) return;

  const fd = new FormData(form);
  const age = ageFromDob(fd.get('dob'));
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
      if (startedAnonymousSession) await signOut(auth).catch(() => {});
      downloadReceipt({ ...record, trialClass: true, trialProgram: trialRecord.trialProgram, trialDate: trialRecord.trialDate });
      success.hidden = false;
      delete success.dataset.tone;
      success.innerHTML = `<strong>Your free trial request is in.</strong><br>Red Road staff received your signed waiver for ${trialRecord.trialProgram} on ${trialRecord.trialDate}. Your trial pass is valid through ${trialRecord.trialExpiresOn}. Your receipt is ${receiptId}. No membership account was created.`;
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
        active: false,
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
      const batch = writeBatch(db);
      batch.set(doc(db, 'members', email), member);
      batch.set(doc(db, 'waivers', email), waiver);
      await batch.commit();
      await sendEmailVerification(user).catch(() => {});
      await signOut(auth).catch(() => {});
      sessionStorage.removeItem('redroad:pendingEnrollment');
      sessionStorage.removeItem('redroad:enrollmentUid');
      downloadReceipt(record);
      success.hidden = false;
      delete success.dataset.tone;
      success.innerHTML = `<strong>Signup and waiver complete.</strong><br>Your account is pending staff activation. Check your email, verify your address, then use <a class="waiver-inline-link" href="members.html">Member Login</a> to view your active and waiver status.`;
    } else {
      localStorage.setItem('redroad:lastWaiver', JSON.stringify(record));
      downloadReceipt(record);
      success.hidden = false;
      delete success.dataset.tone;
      success.innerHTML = `<strong>Waiver receipt created.</strong><br>Receipt ${receiptId} was saved on this device and downloaded. To attach a waiver automatically to a member account, use <a class="waiver-inline-link" href="enroll.html">New Member Signup</a>.`;
    }
    success.scrollIntoView({ behavior: 'smooth', block: 'center' });
  } catch (error) {
    showError(String(error?.message || 'The waiver could not be saved.'));
  } finally {
    submit.disabled = false;
      submit.textContent = trialMode ? 'Submit Free Trial & Waiver' : 'Sign & Create Receipt';
  }
});
