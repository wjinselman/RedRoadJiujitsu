import {db,auth,doc,getDocFromServer,getDocsFromServer,collection,query,where,limit,startAfter,serverTimestamp} from './firebase-client.js?v=52';
import {runTransaction} from 'https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js';
import {status,planSave,gymDate} from './billing-model.js?v=2';
export const profiles=new Map();
export let billingReady=false;
export async function loadBillingProfiles(){
  billingReady=false;profiles.clear();
  const result=new Map();let cursor;
  for(;;){
    const page=await getDocsFromServer(query(collection(db,'billingProfiles'),...(cursor?[startAfter(cursor)]:[]),limit(250)));
    page.docs.forEach(s=>result.set(s.id,s.data()));
    if(page.docs.length<250)break;
    cursor=page.docs.at(-1);
  }
  for(const [k,v] of result)profiles.set(k,v);
  billingReady=true;
}
export async function loadMyBilling(email){
  const snap=await getDocFromServer(doc(db,'billingProfiles',email));
  if(!snap.exists()){profiles.delete(email);return;}
  const profile=snap.data();profiles.set(email,profile);
  if(profile.category==='family-covered' && profile.payerEmail){
    const payer=await getDocFromServer(doc(db,'billingProfiles',profile.payerEmail));
    if(payer.exists())profiles.set(profile.payerEmail,payer.data());else profiles.delete(profile.payerEmail);
  }
}
export function memberBilling(member){
  const p=profiles.get(member.email);
  return status(member,p,profiles.get(p?.payerEmail));
}
export async function ensureNoCoveredMembers(email){
  const linked=[...profiles.entries()].filter(([,p])=>p.category==='family-covered'&&p.payerEmail===email);
  for(const [child] of linked){
    if((await getDocFromServer(doc(db,'members',child))).exists())throw Error('Reassign covered family members before changing or removing their payer.');
  }
}
export async function saveWithBilling(payload,previous,intent,directoryChange){
  if(!billingReady)throw Error('Billing could not load. Refresh the roster before saving a payment.');
  const email=payload.email,memberRef=doc(db,'members',email),profileRef=doc(db,'billingProfiles',email);
  const expectedRevision=profiles.get(email)?.revision||0;
  if(intent.category.startsWith('family-') && payload.plan==='Family')throw Error('Choose Adult or Kids as this member’s class program. Family billing is selected separately.');
  if(intent.category!=='family-payer')await ensureNoCoveredMembers(email);
  const actor=auth.currentUser?.email?.toLowerCase();
  if(!actor)throw Error('Please sign in again.');
  let writtenProfile;
  const result=await runTransaction(db,async tx=>{
    const fresh=await tx.get(memberRef);
    const profileSnap=await tx.get(profileRef);
    const profile=profileSnap.exists()?profileSnap.data():null;
    if((profile?.revision||0)!==expectedRevision)throw Error('Payment details changed in another session. Refresh the roster and review before saving again.');
    if(!previous && fresh.exists())throw Error('This member already exists. Refresh the roster and use Edit.');
    if(previous && !fresh.exists())throw Error('This member was removed. Refresh the roster.');
    const live=fresh.exists()?fresh.data():null;
    const changes={};
    for(const [key,value] of Object.entries(payload)){
      if(key==='createdAt' && live)continue;
      if(key==='updatedAt'){changes[key]=serverTimestamp();continue;}
      if(!previous || JSON.stringify(value)!==JSON.stringify(previous[key])){
        if(previous && JSON.stringify(live[key])!==JSON.stringify(previous[key]))throw Error('This member changed in another session. Refresh the roster before saving.');
        changes[key]=value;
      }
    }
    let payer=null;
    if(intent.category==='family-covered'){
      const payerSnap=await tx.get(doc(db,'billingProfiles',intent.payerEmail));
      const payerMember=await tx.get(doc(db,'members',intent.payerEmail));
      if(!payerMember.exists() || payerMember.data().archived===true)throw Error('The family payer must be an existing, unarchived member.');
      payer=payerSnap.exists()?payerSnap.data():null;
    }
    const planned=planSave({member:payload,oldMember:live,profile,payer,...intent,today:gymDate()});
    const newProfile={...planned.profile,updatedAt:serverTimestamp(),updatedBy:actor};
    const receiptId=email+'_'+String(newProfile.sequence).padStart(6,'0');
    // All reads precede writes. Member status, coverage dates and the receipt
    // commit together; failed or competing saves cannot create partial payments.
    tx.set(memberRef,changes,{merge:true});
    tx.set(profileRef,newProfile);
    if(planned.receipt)tx.set(doc(db,'payments',receiptId),{...planned.receipt,createdAt:serverTimestamp(),recordedBy:actor});
    if(directoryChange){if(directoryChange.data)tx.set(directoryChange.ref,directoryChange.data);else tx.delete(directoryChange.ref);}
    writtenProfile=newProfile;
    return planned.receipt;
  });
  profiles.set(email,writtenProfile);
  return result;
}
export async function paymentsForMonth(month){
  if(!/^\d{4}-\d{2}$/.test(month))throw Error('Choose a report month.');
  const [y,m]=month.split('-').map(Number);
  if(m<1||m>12)throw Error('Choose a valid month.');
  const end=new Date(Date.UTC(y,m,1)).toISOString().slice(0,10);
  const rows=[];let cursor;
  for(;;){
    const page=await getDocsFromServer(query(collection(db,'payments'),where('paidOn','>=',month+'-01'),where('paidOn','<',end),...(cursor?[startAfter(cursor)]:[]),limit(250)));
    page.docs.forEach(s=>rows.push({id:s.id,...s.data()}));
    if(page.docs.length<250)break;
    cursor=page.docs.at(-1);
  }
  return rows;
}
