import {auth,db,doc,serverTimestamp} from './firebase-client.js?v=52';
import {runTransaction} from 'https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js';
import {profiles,billingReady,memberBilling} from './billing-store.js?v=2';
import {defaultCategory,exempt} from './billing-model.js?v=2';
export async function toggleMemberPaid(member,role){
  if(!['owner','developer'].includes(role))throw Error('Owner or Developer access is required.');
  if(!billingReady)throw Error('Refresh the roster before changing payment status.');
  const email=member.email,expected=profiles.get(email),expectedRevision=expected?.revision||0;
  const wantsPaid=!memberBilling(member).current;
  const actor=auth.currentUser?.email?.toLowerCase();if(!actor)throw Error('Sign in again.');
  const result=await runTransaction(db,async tx=>{
    const memberRef=doc(db,'members',email),profileRef=doc(db,'billingProfiles',email);
    const fresh=await tx.get(memberRef),billing=await tx.get(profileRef);
    if(!fresh.exists())throw Error('This member was removed. Refresh the roster.');
    const live=fresh.data(),profile=billing.exists()?billing.data():null;
    if((profile?.revision||0)!==expectedRevision || live.paid!==member.paid)throw Error('Payment status changed in another session. Refresh before trying again.');
    if(live.archived===true||exempt(live))throw Error('Exempt or archived accounts do not need a payment toggle.');
    const category=profile?.category||defaultCategory(live);
    if(category==='family-covered')throw Error('Update the family payer; this member is covered automatically.');
    if(live.plan==='Family'&&!profile)throw Error('Use Edit once to choose the class program and family billing category.');
    const next={...(profile||{}),category,payerEmail:'',paid:wantsPaid,paidOn:'',paidThrough:'',nextDue:'',manualStatusOnly:true,
      sequence:profile?.sequence||0,revision:(profile?.revision||0)+1,updatedAt:serverTimestamp(),updatedBy:actor};
    tx.set(memberRef,{paid:wantsPaid,updatedAt:serverTimestamp()},{merge:true});
    tx.set(profileRef,next);
    return {profile:next,member:{...live,paid:wantsPaid},wantsPaid};
  });
  profiles.set(email,result.profile);return result;
}
