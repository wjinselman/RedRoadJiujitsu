// FIRESTORE_EMULATOR_HOST must point at an isolated emulator; never production.
const {test,before,after}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');
const {initializeTestEnvironment,assertSucceeds,assertFails}=require('@firebase/rules-unit-testing');
const {doc,setDoc,getDoc,getDocs,collection,query,limit,where,updateDoc,deleteDoc,serverTimestamp,Timestamp,writeBatch}=require('firebase/firestore');
let env;const now=Timestamp.now();
const member=(email,extra={})=>({email,name:'Sample Member',rank:'Rank pending',stripes:0,plan:'Adult',paid:false,paymentExempt:false,coachAccess:false,active:true,enabled:true,archived:false,joinedAt:'2026-09-01',waiverSigned:true,waiverSignedAt:'2026-09-01T00:00:00Z',waiverReceiptId:'RR-TEST',phone:'5550100',address:'Test address',emergencyName:'Sample',emergencyPhone:'5550101',guardianName:'',householdEmail:'',createdAt:now,updatedAt:now,selfReportedRank:'',rankVerifiedBy:'',rankVerifiedAt:'',rankHistory:[],...extra});
const bill=(extra={})=>({category:'adult',payerEmail:'',paid:false,paidOn:'',paidThrough:'',nextDue:'',manualStatusOnly:true,sequence:0,revision:1,updatedAt:now,updatedBy:'owner@test.invalid',...extra});
const waiver=(uid,email,extra={})=>({receiptId:'RR-TEST',waiverVersion:'Test version',signedAt:'2026-09-01T00:00:00Z',participantName:'Sample Member',dob:'1990-01-01',email,phone:'5550100',address:'Test address',emergencyName:'Sample',emergencyPhone:'5550101',minor:false,guardianName:'',relationship:'',electronicSignature:'Sample Member',signatureDate:'2026-09-01',photoVideoReleaseAccepted:false,photoVideoInitials:'',signerUid:uid,createdAt:serverTimestamp(),...extra});
const auth=(name,verified=true)=>env.authenticatedContext(name,{email:name+'@test.invalid',email_verified:verified}).firestore();
const diagnostic=(uid,extra={})=>({uid,slot:'0',code:'permission-denied',kind:'Error',operation:'portal',page:'owner.html',device:'Desktop',browser:'Chrome',version:'54-diagnostics',line:0,count:1,status:'open',updatedAt:serverTimestamp(),...extra});
before(async()=>{
 assert.equal(process.env.FIRESTORE_EMULATOR_HOST,'127.0.0.1:8080','explicit isolated emulator required');
 env=await initializeTestEnvironment({projectId:'demo-redroad-audit',firestore:{host:'127.0.0.1',port:8080,rules:fs.readFileSync(path.join(__dirname,'../firestore.rules'),'utf8')}});
 await env.clearFirestore();await env.withSecurityRulesDisabled(async c=>{const db=c.firestore();const records={
 'developers/dev@test.invalid':{enabled:true},'owners/owner@test.invalid':{email:'owner@test.invalid',name:'Owner',enabled:true,createdAt:now,updatedAt:now},'kiosks/kiosk@test.invalid':{enabled:true},
 'members/member@test.invalid':member('member@test.invalid'),'members/other@test.invalid':member('other@test.invalid'),'members/coach@test.invalid':member('coach@test.invalid',{coachAccess:true}),
 'members/disabled@test.invalid':member('disabled@test.invalid',{enabled:false}),
 'members/child@test.invalid':member('child@test.invalid'),'members/payer@test.invalid':member('payer@test.invalid'),
 'billingProfiles/member@test.invalid':bill(),'billingProfiles/payer@test.invalid':bill({category:'family-payer'}),'billingProfiles/child@test.invalid':bill({category:'family-covered',payerEmail:'payer@test.invalid'}),
 'checkInDirectory/member@test.invalid':{memberEmail:'member@test.invalid',displayName:'Sample',plan:'Adult',pinHash:'a'.repeat(64),active:true,updatedAt:now},
 'waivers/member@test.invalid':{...waiver('member','member@test.invalid'),createdAt:now},
 'clientDiagnostics/other_0':{...diagnostic('other'),updatedAt:Timestamp.fromMillis(Date.now()-120000)},
 'attendance/2026-09-30_member@test.invalid_adult-jiu-jitsu':{memberEmail:'member@test.invalid',memberName:'Sample',className:'Adult Jiu Jitsu',classDate:'2026-09-30',checkedInAt:now,checkedInBy:'member@test.invalid',source:'member'}
 };for(const [key,value]of Object.entries(records))await setDoc(doc(db,key),value);});
});
after(async()=>{if(env)await env.cleanup();});
for(const role of ['dev','owner','coach'])test(`${role}: bounded roster permitted`,()=>assertSucceeds(getDocs(query(collection(auth(role),'members'),limit(250)))));
for(const role of ['member','kiosk','disabled'])test(`${role}: roster listing denied`,()=>assertFails(getDocs(query(collection(auth(role),'members'),limit(250)))));
test('anonymous roster denied',()=>assertFails(getDocs(query(collection(env.unauthenticatedContext().firestore(),'members'),limit(250)))));
for(const role of ['dev','owner','coach'])test(`${role}: unbounded roster denied`,()=>assertFails(getDocs(collection(auth(role),'members'))));
for(const role of ['dev','owner','kiosk'])test(`${role}: unverified privileged read denied`,()=>assertFails(getDocs(query(collection(auth(role,false),role==='kiosk'?'checkInDirectory':'members'),limit(100)))));
test('member can read self',()=>assertSucceeds(getDoc(doc(auth('member'),'members/member@test.invalid'))));
test('member cannot read another member',()=>assertFails(getDoc(doc(auth('member'),'members/other@test.invalid'))));
test('disabled member cannot read self',()=>assertFails(getDoc(doc(auth('disabled'),'members/disabled@test.invalid'))));
test('member cannot grant coach access',()=>assertFails(updateDoc(doc(auth('member'),'members/member@test.invalid'),{coachAccess:true})));
test('member can edit contact field',()=>assertSucceeds(updateDoc(doc(auth('member'),'members/member@test.invalid'),{phone:'5550200',updatedAt:serverTimestamp()})));
test('member cannot grant developer access',()=>assertFails(setDoc(doc(auth('member'),'developers/member@test.invalid'),{enabled:true})));
test('developer records immutable to developer client',()=>assertFails(setDoc(doc(auth('dev'),'developers/new@test.invalid'),{enabled:true})));
test('owner cannot add another owner',()=>assertFails(setDoc(doc(auth('owner'),'owners/new@test.invalid'),{email:'new@test.invalid',name:'New',enabled:true,createdAt:serverTimestamp(),updatedAt:serverTimestamp()})));
test('developer can add schema-valid owner',()=>assertSucceeds(setDoc(doc(auth('dev'),'owners/new@test.invalid'),{email:'new@test.invalid',name:'New',enabled:true,createdAt:serverTimestamp(),updatedAt:serverTimestamp()})));
for(const role of ['dev','owner'])test(`${role}: malformed member rejected`,()=>assertFails(setDoc(doc(auth(role),'members/bad@test.invalid'),{email:'bad@test.invalid',name:'Bad'})));
test('member reads own billing',()=>assertSucceeds(getDoc(doc(auth('member'),'billingProfiles/member@test.invalid'))));
test('covered member reads linked payer billing',()=>assertSucceeds(getDoc(doc(auth('child'),'billingProfiles/payer@test.invalid'))));
test('member cannot read unrelated billing',()=>assertFails(getDoc(doc(auth('member'),'billingProfiles/payer@test.invalid'))));
test('member cannot list billing',()=>assertFails(getDocs(query(collection(auth('member'),'billingProfiles'),limit(250)))));
test('member cannot write billing',()=>assertFails(setDoc(doc(auth('member'),'billingProfiles/member@test.invalid'),bill({updatedAt:serverTimestamp(),updatedBy:'member@test.invalid'}))));
test('owner valid billing write',()=>assertSucceeds(setDoc(doc(auth('owner'),'billingProfiles/new@test.invalid'),bill({updatedAt:serverTimestamp()}))));
test('owner malformed billing denied',()=>assertFails(setDoc(doc(auth('owner'),'billingProfiles/bad@test.invalid'),{paid:true})));
const receipt=()=>({payerEmail:'member@test.invalid',payerName:'Sample',category:'adult',amountCents:13500,paidOn:'2026-09-30',periodStart:'2026-09-01',paidThrough:'2026-09-30',nextDue:'2026-10-01',sequence:1,createdAt:serverTimestamp(),recordedBy:'owner@test.invalid'});
test('owner can append payment',()=>assertSucceeds(setDoc(doc(auth('owner'),'payments/test'),receipt())));
test('owner cannot rewrite payment',()=>assertFails(setDoc(doc(auth('owner'),'payments/test'),receipt())));
test('owner cannot delete payment',()=>assertFails(deleteDoc(doc(auth('owner'),'payments/test'))));
test('negative amount denied',()=>assertFails(setDoc(doc(auth('owner'),'payments/negative'),{...receipt(),amountCents:-1})));
const attendance=(who,source='member')=>({memberEmail:who+'@test.invalid',memberName:source==='developer-test'?'Developer Test':'Sample',className:'Adult No-Gi',classDate:'2026-10-02',checkedInAt:serverTimestamp(),checkedInBy:who+'@test.invalid',source});
test('out-of-window future member attendance rejected',()=>assertFails(setDoc(doc(auth('member'),'attendance/2026-10-02_member@test.invalid_adult-no-gi'),attendance('member'))));
test('duplicate member attendance rejected',()=>assertFails(setDoc(doc(auth('member'),'attendance/2026-10-02_member@test.invalid_adult-no-gi'),attendance('member'))));
test('random duplicate attendance ID rejected',()=>assertFails(setDoc(doc(auth('member'),'attendance/random'),attendance('member'))));
test('another member attendance rejected',()=>assertFails(setDoc(doc(auth('other'),'attendance/2026-10-02_member@test.invalid_adult-no-gi'),attendance('member'))));
test('disabled member attendance rejected',()=>assertFails(setDoc(doc(auth('disabled'),'attendance/2026-10-02_disabled@test.invalid_adult-no-gi'),attendance('disabled'))));
test('out-of-window future developer test rejected',()=>assertFails(setDoc(doc(auth('dev'),'attendance/2026-10-02_dev@test.invalid_adult-no-gi'),attendance('dev','developer-test'))));
test('member cannot forge developer test',()=>assertFails(setDoc(doc(auth('member'),'attendance/2026-10-02_member@test.invalid_adult-no-gi'),attendance('member','developer-test'))));
test('own bounded attendance query permitted',()=>assertSucceeds(getDocs(query(collection(auth('member'),'attendance'),where('memberEmail','==','member@test.invalid'),limit(250)))));
test('all attendance query denied for member',()=>assertFails(getDocs(query(collection(auth('member'),'attendance'),limit(250)))));
test('own waiver readable',()=>assertSucceeds(getDoc(doc(auth('member'),'waivers/member@test.invalid'))));
test('other waiver denied',()=>assertFails(getDoc(doc(auth('other'),'waivers/member@test.invalid'))));
test('waiver overwrite denied',()=>assertFails(setDoc(doc(auth('member'),'waivers/member@test.invalid'),waiver('member','member@test.invalid'))));
test('self signup and waiver atomic commit',async()=>{const db=auth('signup'),batch=writeBatch(db);batch.set(doc(db,'members/signup@test.invalid'),member('signup@test.invalid',{createdAt:serverTimestamp(),updatedAt:serverTimestamp()}));batch.set(doc(db,'waivers/signup@test.invalid'),waiver('signup','signup@test.invalid'));await assertSucceeds(batch.commit());});
test('diagnostic report written by verified user',()=>assertSucceeds(setDoc(doc(auth('member'),'clientDiagnostics/member_0'),diagnostic('member'))));
test('diagnostic write throttled by server',()=>assertFails(setDoc(doc(auth('member'),'clientDiagnostics/member_0'),diagnostic('member',{count:2}))));
test('diagnostic other UID denied',()=>assertFails(setDoc(doc(auth('member'),'clientDiagnostics/other_1'),diagnostic('other',{slot:'1'}))));
test('diagnostic extra raw message rejected',()=>assertFails(setDoc(doc(auth('member'),'clientDiagnostics/member_1'),diagnostic('member',{slot:'1',message:'private'}))));
test('diagnostic unbounded slot denied',()=>assertFails(setDoc(doc(auth('member'),'clientDiagnostics/member_999'),diagnostic('member',{slot:'999'}))));
for(const role of ['owner','coach','member','kiosk'])test(`${role}: error board denied`,()=>assertFails(getDocs(query(collection(auth(role),'clientDiagnostics'),limit(100)))));
test('developer error board readable',()=>assertSucceeds(getDocs(query(collection(auth('dev'),'clientDiagnostics'),limit(100)))));
test('developer unbounded error query denied',()=>assertFails(getDocs(collection(auth('dev'),'clientDiagnostics'))));
test('developer can resolve report',()=>assertSucceeds(updateDoc(doc(auth('dev'),'clientDiagnostics/member_0'),{status:'resolved'})));
test('owner cannot resolve report',()=>assertFails(updateDoc(doc(auth('owner'),'clientDiagnostics/member_0'),{status:'resolved'})));
test('developer cannot inject raw details through resolve',()=>assertFails(updateDoc(doc(auth('dev'),'clientDiagnostics/member_0'),{status:'resolved',message:'private'})));

test('unverified user cannot read an existing own waiver',()=>assertFails(getDoc(doc(auth('member',false),'waivers/member@test.invalid'))));
test('self signup cannot claim a waiver without saving one',()=>assertFails(setDoc(doc(auth('nowaiver'),'members/nowaiver@test.invalid'),member('nowaiver@test.invalid'))));
test('unverified self signup and waiver denied atomically',async()=>{const db=auth('unverified',false),batch=writeBatch(db);batch.set(doc(db,'members/unverified@test.invalid'),member('unverified@test.invalid'));batch.set(doc(db,'waivers/unverified@test.invalid'),waiver('unverified','unverified@test.invalid'));await assertFails(batch.commit());});
async function shippedPayments(email,role='owner'){
 const vm=require('node:vm');const F=require('firebase/firestore');
 await env.withSecurityRulesDisabled(async c=>{await setDoc(doc(c.firestore(),'members',email),member(email));await setDoc(doc(c.firestore(),'billingProfiles',email),bill());});
 const context=vm.createContext({console,Intl,Date,Map,Error,window:{}}),cache=new Map();
 const values={...F,runTransaction:(db,fn)=>F.runTransaction(db,tx=>fn({get:ref=>tx.get(ref),set:(ref,data,options)=>options?tx.set(ref,{...data},{...options}):tx.set(ref,{...data}),delete:ref=>tx.delete(ref)})),auth:{currentUser:{uid:role,email:role+'@test.invalid',emailVerified:true}},db:auth(role),onAuthStateChanged:()=>()=>{}};
 const sdk=new vm.SyntheticModule(Object.keys(values),function(){for(const[k,v]of Object.entries(values))this.setExport(k,v);},{context});
 function get(spec){if(spec.includes('firebase-client')||spec.startsWith('https:'))return sdk;const name=spec.replace(/^\.\//,'').split('?')[0];if(cache.has(name))return cache.get(name);const m=new vm.SourceTextModule(fs.readFileSync(path.join(__dirname,'..',name),'utf8'),{context,identifier:name});cache.set(name,m);return m;}
 const module=get('paid-date.js');await module.link(get);await module.evaluate();
 const store=cache.get('billing-store.js').namespace;await store.loadBillingProfiles();
 return {save:module.namespace.saveMemberPaidDate,member:member(email),store};
}
test('shipped payment function commits member, coverage and receipt against real rules',async()=>{
 const email='realpayment@test.invalid',h=await shippedPayments(email);await h.save(h.member,'owner','2026-09-30');
 const profile=await getDoc(doc(auth('owner'),'billingProfiles',email));assert.equal(profile.data().sequence,1);assert.equal(profile.data().paidThrough,'2026-09-30');
 const payment=await getDoc(doc(auth('owner'),'payments',email+'_000001'));assert.equal(payment.data().amountCents,13500);
});
test('two competing shipped payment transactions create only one receipt',async()=>{
 const email='concurrent@test.invalid',h=await shippedPayments(email);const results=await Promise.allSettled([h.save(h.member,'owner','2026-09-30'),h.save(h.member,'owner','2026-09-30')]);
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.filter(r=>r.status==='rejected').length,1);
 assert.equal((await getDoc(doc(auth('owner'),'billingProfiles',email))).data().sequence,1);
 assert.equal((await getDoc(doc(auth('owner'),'payments',email+'_000002'))).exists(),false);
});
test('reopening and saving same date through shipped function produces no extra receipt',async()=>{
 const email='repeat@test.invalid',h=await shippedPayments(email);await h.save(h.member,'owner','2026-09-30');await h.store.loadBillingProfiles();
 const live=(await getDoc(doc(auth('owner'),'members',email))).data();const again=await h.save(live,'owner','2026-09-30');assert.equal(again.receipt,null);assert.equal(again.profile.sequence,1);
});
test('real batch with forbidden receipt rewrite rolls back member change',async()=>{
 const db=auth('owner'),before=(await getDoc(doc(db,'members/member@test.invalid'))).data().paid;
 const batch=writeBatch(db);batch.update(doc(db,'members/member@test.invalid'),{paid:!before});batch.set(doc(db,'payments/test'),receipt());await assertFails(batch.commit());
 assert.equal((await getDoc(doc(db,'members/member@test.invalid'))).data().paid,before);
});

test('invalid enrollment relationship rolls back both member and waiver',async()=>{
 const db=auth('badlink'),batch=writeBatch(db);batch.set(doc(db,'members/badlink@test.invalid'),member('badlink@test.invalid',{waiverReceiptId:'WRONG'}));batch.set(doc(db,'waivers/badlink@test.invalid'),waiver('badlink','badlink@test.invalid'));await assertFails(batch.commit());
 await env.withSecurityRulesDisabled(async c=>{assert.equal((await getDoc(doc(c.firestore(),'members/badlink@test.invalid'))).exists(),false);assert.equal((await getDoc(doc(c.firestore(),'waivers/badlink@test.invalid'))).exists(),false);});
});
