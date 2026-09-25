/* Red Road roster paid-date shortcut. No new collections or rules. */
import {auth,db,doc,serverTimestamp} from './firebase-client.js?v=52';
import {runTransaction} from 'https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js';
import {profiles,billingReady} from './billing-store.js?v=2';
import {defaultCategory,exempt,gymDate,paymentPeriod,planSave} from './billing-model.js?v=2';

/** Record a date using Edit's existing billing model, without touching other member fields. */
export async function saveMemberPaidDate(member,role,paidOn,expectedRevision=profiles.get(member?.email)?.revision||0){
  if(!['owner','developer'].includes(role))throw Error('Owner or Developer access is required.');
  if(!billingReady)throw Error('Refresh the roster before setting a payment date.');
  if(!member?.email)throw Error('This member was not found. Refresh the roster.');
  paymentPeriod(paidOn); // Validate before any network request; do not silently select today.
  const email=member.email;
  const actor=auth.currentUser?.email?.toLowerCase();
  if(!actor)throw Error('Please sign in again.');
  const result=await runTransaction(db,async tx=>{
    const memberRef=doc(db,'members',email),profileRef=doc(db,'billingProfiles',email);
    const fresh=await tx.get(memberRef),billing=await tx.get(profileRef);
    if(!fresh.exists())throw Error('This member was removed. Refresh the roster.');
    const live=fresh.data(),profile=billing.exists()?billing.data():null;
    if((profile?.revision||0)!==expectedRevision || live.paid!==member.paid){
      throw Error('Payment details changed in another session. Cancel, refresh the roster, and try again.');
    }
    if(live.archived===true||exempt(live))throw Error('Exempt or archived accounts do not need a payment date.');
    const category=profile?.category||defaultCategory(live);
    if(category==='family-covered')throw Error('Set the date on the family payer. This member is covered automatically.');
    if(live.plan==='Family'&&!profile)throw Error('Use Edit once to choose the class program and family billing category.');
    // The same planSave used by Edit preserves month-end coverage and receipt rules.
    const planned=planSave({member:{...live,email,paid:true},oldMember:live,profile,payer:null,
      category,payerEmail:'',wantsPaid:true,paidOn,today:gymDate()});
    const next={...planned.profile,updatedAt:serverTimestamp(),updatedBy:actor};
    // Read first, then commit the member status, billing profile and optional receipt together.
    // No name, belt, waiver, access, attendance, PIN or directory fields are overwritten.
    tx.set(memberRef,{paid:true,updatedAt:serverTimestamp()},{merge:true});
    tx.set(profileRef,next);
    if(planned.receipt){
      const receiptId=email+'_'+String(next.sequence).padStart(6,'0');
      tx.set(doc(db,'payments',receiptId),{...planned.receipt,createdAt:serverTimestamp(),recordedBy:actor});
    }
    return {profile:next,member:{...live,paid:true},receipt:planned.receipt};
  });
  // A failed transaction must never make the roster look successfully saved.
  profiles.set(email,result.profile);
  return result;
}

/** Bind once. Opening/choosing/cancelling never writes; only Save calls onSave. */
export function createPaidDatePicker({onSave,restoreFocus=()=>{}}){
  const dialog=document.querySelector('#paid-date-dialog');
  if(!dialog)return null;
  const form=dialog.querySelector('form');
  const date=form.elements.paidOn;
  const save=dialog.querySelector('#paid-date-save');
  const cancel=dialog.querySelector('#paid-date-cancel');
  const name=dialog.querySelector('#paid-date-member');
  const coverage=dialog.querySelector('#paid-date-coverage');
  const message=dialog.querySelector('#paid-date-message');
  let selection=null,busy=false,opener=null;

  function preview(){
    message.textContent='';message.removeAttribute('data-error');
    if(!date.value){coverage.textContent='Choose a date. Nothing changes until you press Save date.';save.disabled=true;return;}
    try{
      const period=paymentPeriod(date.value);
      coverage.textContent=`Paid through ${period.paidThrough} · Due ${period.nextDue}`;
      if(period.paidThrough<gymDate())coverage.textContent+=' — this month has ended, so the member will still show Past Due.';
      save.disabled=busy;
    }catch(error){coverage.textContent=error.message;save.disabled=true;}
  }
  function showCalendar(){
    // Keep this inside the user's click/keyboard gesture. Unsupported browsers
    // retain a normal, focused date input with their own calendar affordance.
    if(typeof date.showPicker==='function'){try{date.showPicker();}catch(_){/* Native input remains usable. */}}
  }
  function setBusy(value){
    busy=value;date.disabled=value;cancel.disabled=value;save.disabled=value||!date.value;
    save.textContent=value?'Saving…':'Save date';
    form.setAttribute('aria-busy',String(value));
  }
  date.addEventListener('input',preview);
  date.addEventListener('change',preview);
  date.addEventListener('click',showCalendar);
  cancel.addEventListener('click',()=>{if(!busy)dialog.close();});
  dialog.addEventListener('cancel',event=>{if(busy)event.preventDefault();});
  dialog.addEventListener('close',()=>{
    const email=selection?.email;
    selection=null;
    if(opener?.isConnected)opener.focus({preventScroll:true});
    else if(email)restoreFocus(email);
    opener=null;
  });
  form.addEventListener('submit',async event=>{
    event.preventDefault();
    if(busy||!selection||!form.reportValidity())return;
    try{paymentPeriod(date.value);}catch(error){message.textContent=error.message;message.dataset.error='true';return;}
    const intent={email:selection.email,expectedRevision:selection.expectedRevision,paidOn:date.value};
    setBusy(true);message.removeAttribute('data-error');message.textContent='Saving payment date…';
    try{
      await onSave(intent);
      setBusy(false);
      dialog.close();
    }catch(error){
      setBusy(false);
      message.textContent=error?.message||'Could not save the date. Please try again.';
      message.dataset.error='true';
    }
  });
  return {
    open({email,memberName,currentDate='',expectedRevision=0,trigger=null}){
      if(busy||dialog.open)return;
      selection={email,expectedRevision};opener=trigger;
      form.reset();name.textContent=memberName||email;date.value=currentDate;
      setBusy(false);preview();
      dialog.showModal();
      date.focus({preventScroll:true});
      showCalendar();
    }
  };
}
