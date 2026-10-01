import {auth,db,doc,getDocFromServer,getDocsFromServer,collection,query,where,limit,serverTimestamp} from './firebase-client.js?v=54-member-nav';
import {runTransaction} from 'https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js';
import {currentClass} from './class-schedule.js?v=54-member-nav';
export const normalize=value=>String(value||'').trim().toLowerCase();
export function requireParent(){const user=auth?.currentUser;if(!user?.emailVerified||user.isAnonymous)throw Error('Sign in with a verified email first.');return user;}
export async function childLogin(email){const snap=await getDocFromServer(doc(db,'childLogins',normalize(email)));return snap.exists()?snap.data():null;}
export async function myChildren(user=requireParent()){
 const snapshots=await getDocsFromServer(query(collection(db,'children'),where('guardianUid','==',user.uid),limit(50)));
 return snapshots.docs.map(s=>({...s.data(),id:s.id}));
}
export async function childKey(uid,name,dob){const bytes=new TextEncoder().encode(uid+'|'+normalize(name).replace(/\s+/g,' ')+'|'+dob);const hash=await crypto.subtle.digest('SHA-256',bytes);return 'child-'+[...new Uint8Array(hash)].map(x=>x.toString(16).padStart(2,'0')).join('');}
export async function saveChildAndWaiver(draft,waiver){
 const user=requireParent();if(draft.guardianUid!==user.uid||normalize(waiver.email)!==normalize(user.email))throw Error('The parent sign-in changed. Return to My Family.');
 if(!waiver.minor||waiver.participantName!==draft.name||waiver.dob!==draft.dob)throw Error('The waiver must match the child you are adding.');
 if(normalize(waiver.electronicSignature)!==normalize(waiver.guardianName))throw Error('The signature must match the parent or guardian name.');
 const id=await childKey(user.uid,draft.name,draft.dob);
 await runTransaction(db,async tx=>{const ref=doc(db,'children',id);const existing=await tx.get(ref);if(existing.exists())throw Error('This child already has a profile. Open My Family to continue.');
 tx.set(ref,{name:draft.name,dob:draft.dob,guardianUid:user.uid,guardianEmail:normalize(user.email),requestedLoginEmail:normalize(draft.loginEmail),loginEmail:'',status:'pending',payerEmail:'',plan:'Kids',rank:'Rank pending',stripes:0,waiverReceiptId:waiver.receiptId,createdAt:serverTimestamp(),updatedAt:serverTimestamp(),reviewedBy:''});
 tx.set(doc(db,'childWaivers',id),{...waiver,signerUid:user.uid,createdAt:serverTimestamp()});});return id;
}
export async function checkInChild(child){const user=requireParent(),slot=currentClass({plan:'Kids'});if(!slot)throw Error('Kids check-in opens at 5:45 PM and closes at 7:00 PM, Monday–Friday, Central time.');
 const attendanceId=slot.classDate+'_'+child.id+'_'+slot.classKey;
 return runTransaction(db,async tx=>{const ref=doc(db,'attendance',attendanceId),existing=await tx.get(ref);if(existing.exists())return false;tx.set(ref,{memberEmail:child.id,memberName:child.name,childId:child.id,className:slot.className,classDate:slot.classDate,checkedInAt:serverTimestamp(),checkedInBy:normalize(user.email),source:'guardian'});return true;});
}
export async function approveChild(child,{payerEmail,loginEmail,rank,stripes,status}){
 const user=requireParent(),payer=normalize(payerEmail),login=normalize(loginEmail);if(status==='active'&&!payer)throw Error('Select the approved family payer.');
 return runTransaction(db,async tx=>{const ref=doc(db,'children',child.id);const current=await tx.get(ref);if(!current.exists())throw Error('Child profile was removed. Refresh.');const live=current.data();
 if(live.updatedAt?.toMillis?.()!==child.updatedAt?.toMillis?.())throw Error('This child was changed in another session. Refresh before saving.');
 if(live.loginEmail&&live.loginEmail!==login)throw Error('The approved login cannot be changed here. Keep it to preserve account access.');
 if(status==='active'){const billing=await tx.get(doc(db,'billingProfiles',payer)),member=await tx.get(doc(db,'members',payer));if(!billing.exists()||billing.data().category!=='family-payer'||!member.exists()||!member.data().active||!member.data().enabled||member.data().archived)throw Error('The payer must be an active member with Family Plan — Payer billing.');}
 if(login){if(login===live.guardianEmail)throw Error('Leave child login blank when sharing the parent’s phone.');const existingMember=await tx.get(doc(db,'members',login)),link=await tx.get(doc(db,'childLogins',login));if(existingMember.exists())throw Error('This email already has a member profile. Keep that record and use its existing Family-covered billing; do not duplicate it here.');if(link.exists()&&link.data().childId!==child.id)throw Error('This login is already linked to another child.');}
 tx.set(ref,{...live,payerEmail:payer,loginEmail:login,status,rank,stripes:Number(stripes),reviewedBy:normalize(user.email),updatedAt:serverTimestamp()});if(login)tx.set(doc(db,'childLogins',login),{childId:child.id});});
}
