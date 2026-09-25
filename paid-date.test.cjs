// Run with: node --experimental-vm-modules --test tests/paid-date.test.cjs
// Firebase is replaced by an in-memory transaction; never connects to production.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=process.env.REDROAD_SITE || path.resolve(__dirname,'..');
const read=name=>fs.readFileSync(path.join(root,name),'utf8');
const email='member@example.invalid';
const standard={email,name:'Test Member',plan:'Adult',paid:false,active:true,enabled:true,waiverSigned:true,rank:'Blue Belt',stripes:2};
const profileFor=(extra={})=>({category:'adult',payerEmail:'',paid:false,paidOn:'',paidThrough:'',nextDue:'',manualStatusOnly:true,sequence:0,revision:0,...extra});
async function harness({member={...standard},profile=null,cached=profile,billingReady=true,actor='admin@example.invalid',fail=false,cacheRevision}={}){
 const profiles=new Map(cached?[[email,cached]]:[]),records=new Map();
 if(member)records.set('members/'+email,member);
 if(profile)records.set('billingProfiles/'+email,profile);
 const calls={transactions:0,writes:[]};
 const context=vm.createContext({console,Intl,Date,Map,Error});
 const firebase={auth:{currentUser:actor?{email:actor}:null},db:{},doc:(_,group,id)=>group+'/'+id,serverTimestamp:()=>({timestamp:true})};
 function synthetic(values){return new vm.SyntheticModule(Object.keys(values),function(){for(const [k,v] of Object.entries(values))this.setExport(k,v);},{context});}
 const dependencies={
  './firebase-client.js?v=52':synthetic(firebase),
  './billing-store.js?v=2':synthetic({profiles,billingReady}),
  './billing-model.js?v=2':new vm.SourceTextModule(read('billing-model.js'),{context}),
  'https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js':synthetic({runTransaction:async(_,callback)=>{
   calls.transactions++;const pending=[];
   const result=await callback({get:async key=>({exists:()=>records.has(key),data:()=>records.get(key)}),set:(ref,data,options)=>pending.push({ref,data,options})});
   if(fail)throw Error('Test permission denied');
   for(const write of pending){records.set(write.ref,write.options?.merge?{...records.get(write.ref),...write.data}:write.data);calls.writes.push(write);}
   return result;
  }})
 };
 const module=new vm.SourceTextModule(read('paid-date.js'),{context});
 await module.link(spec=>{assert.ok(dependencies[spec],spec);return dependencies[spec];});
 await module.evaluate();
 return {save:module.namespace.saveMemberPaidDate,model:dependencies['./billing-model.js?v=2'].namespace,profiles,records,calls,member};
}
test('undated unpaid member: atomic dated payment, correct month-end, no unrelated field writes',async()=>{
 const h=await harness();const result=await h.save(h.member,'owner','2026-09-25');
 assert.equal(result.profile.paidThrough,'2026-09-30');assert.equal(result.profile.nextDue,'2026-10-01');
 assert.equal(result.profile.paid,true);assert.equal(result.profile.manualStatusOnly,false);
 assert.equal(result.receipt.amountCents,13500);assert.equal(result.receipt.paidOn,'2026-09-25');
 assert.equal(h.calls.writes.length,3);
 assert.deepEqual(Object.keys(h.calls.writes[0].data).sort(),['paid','updatedAt']);
 assert.equal(h.calls.writes[0].options.merge,true);
 for(const key of ['name','plan','rank','stripes','enabled','waiverSigned'])assert.equal(h.records.get('members/'+email)[key],standard[key]);
 assert.equal(h.profiles.get(email),result.profile);
});
test('same saved date does not append another payment',async()=>{
 const profile=profileFor({paid:true,paidOn:'2026-09-25',paidThrough:'2026-09-30',nextDue:'2026-10-01',manualStatusOnly:false,sequence:3,revision:4});
 const h=await harness({member:{...standard,paid:true},profile});const r=await h.save(h.member,'developer','2026-09-25');
 assert.equal(r.receipt,null);assert.equal(r.profile.sequence,3);assert.equal(r.profile.revision,5);assert.equal(h.calls.writes.length,2);
});
test('different saved date follows existing Edit receipt behavior, not an extra duplicate write',async()=>{
 const profile=profileFor({paid:true,paidOn:'2026-08-10',sequence:4,revision:4});
 const h=await harness({member:{...standard,paid:true},profile});const r=await h.save(h.member,'owner','2026-09-25');
 assert.equal(r.profile.sequence,5);assert.equal(h.calls.writes.filter(w=>w.ref.startsWith('payments/')).length,1);
 assert.equal(h.calls.writes[2].ref,'payments/'+email+'_000005');
});
test('existing legacy mid-month coverage normalizes to month-end without duplicating same-date receipt',async()=>{
 const profile=profileFor({paid:true,paidOn:'2026-09-16',paidThrough:'2026-10-15',nextDue:'2026-10-16',sequence:1,revision:1});
 const h=await harness({member:{...standard,paid:true},profile});const r=await h.save(h.member,'owner','2026-09-16');
 assert.equal(r.profile.paidThrough,'2026-09-30');assert.equal(r.receipt,null);
});
test('February leap/non-leap and December boundaries use existing billing model',async()=>{
 for(const [date,end,due] of [['2028-02-29','2028-02-29','2028-03-01'],['2027-02-10','2027-02-28','2027-03-01'],['2026-12-31','2026-12-31','2027-01-01']]){
  const h=await harness();const r=await h.save(h.member,'owner',date);assert.equal(r.profile.paidThrough,end);assert.equal(r.profile.nextDue,due);
 }
});
test('backdated payment remains past due and expires on Central calendar rollover',async()=>{
 const h=await harness();const r=await h.save(h.member,'owner','2026-08-15');
 assert.equal(h.model.status(h.member,r.profile,null,'2026-09-25').current,false);
 assert.equal(h.model.gymDate(new Date('2026-10-01T04:59:59Z')),'2026-09-30');
 assert.equal(h.model.gymDate(new Date('2026-10-01T05:00:00Z')),'2026-10-01');
 const s=profileFor({paid:true,paidThrough:'2026-09-30',manualStatusOnly:false});
 assert.equal(h.model.status({},s,null,'2026-09-30').current,true);assert.equal(h.model.status({},s,null,'2026-10-01').current,false);
});
test('invalid or missing dates cause no transaction',async()=>{
 for(const date of ['',undefined,'2026-02-30','09/25/2026','2026-13-01']){
  const h=await harness();await assert.rejects(h.save(h.member,'owner',date));assert.equal(h.calls.transactions,0);
 }
});
test('coach/member roles and missing sign-in cause no writes',async()=>{
 for(const role of ['coach','member',null]){const h=await harness();await assert.rejects(h.save(h.member,role,'2026-09-25'),/access/);assert.equal(h.calls.transactions,0);}
 const h=await harness({actor:null});await assert.rejects(h.save(h.member,'owner','2026-09-25'),/sign in/);assert.equal(h.calls.transactions,0);
});
test('billing unavailable and deleted records fail safely',async()=>{
 let h=await harness({billingReady:false});await assert.rejects(h.save(h.member,'owner','2026-09-25'),/Refresh/);assert.equal(h.calls.transactions,0);
 h=await harness({member:null});await assert.rejects(h.save(standard,'owner','2026-09-25'),/removed/);assert.equal(h.calls.writes.length,0);
});
test('archived and exempt member checks use fresh server values',async()=>{
 for(const extra of [{archived:true},{paymentExempt:true},{coachAccess:true}]){
  const h=await harness({member:{...standard,...extra}});await assert.rejects(h.save(standard,'owner','2026-09-25'),/Exempt or archived/);assert.equal(h.calls.writes.length,0);
 }
});
test('family covered members cannot create individual payments',async()=>{
 const h=await harness({profile:profileFor({category:'family-covered',payerEmail:'payer@example.invalid'})});
 await assert.rejects(h.save(h.member,'owner','2026-09-25'),/family payer/);assert.equal(h.calls.writes.length,0);
});
test('family payer charges once and covered members inherit the new dates',async()=>{
 const h=await harness({profile:profileFor({category:'family-payer'})});const r=await h.save(h.member,'owner','2026-09-25');
 assert.equal(r.receipt.amountCents,30000);
 assert.equal(h.model.status({}, {category:'family-covered'},r.profile,'2026-09-25').current,true);
 assert.equal(h.model.status({}, {category:'family-covered'},r.profile,'2026-10-01').current,false);
});
test('kids and service categories retain their existing monthly rate',async()=>{
 for(const [category,cents] of [['kids',9000],['service',10000]]){const h=await harness({profile:profileFor({category})});const r=await h.save(h.member,'owner','2026-09-25');assert.equal(r.receipt.amountCents,cents);}
});
test('stale dialog revision or changed paid flag cannot overwrite newer payment',async()=>{
 let h=await harness({profile:profileFor({revision:3})});await assert.rejects(h.save(h.member,'owner','2026-09-25',2),/changed/);assert.equal(h.calls.writes.length,0);
 h=await harness({member:{...standard,paid:true}});await assert.rejects(h.save(standard,'owner','2026-09-25'),/changed/);assert.equal(h.calls.writes.length,0);
});
test('legacy Family class program must be configured before quick dating',async()=>{
 const h=await harness({member:{...standard,plan:'Family'}});await assert.rejects(h.save(h.member,'owner','2026-09-25'),/Use Edit once/);assert.equal(h.calls.writes.length,0);
});
test('failed commit leaves cached profile/member/receipts untouched',async()=>{
 const profile=profileFor({revision:2});const h=await harness({profile,fail:true});
 await assert.rejects(h.save(h.member,'owner','2026-09-25'),/permission denied/);
 assert.equal(h.profiles.get(email),profile);assert.equal(h.records.get('members/'+email).paid,false);assert.equal(h.calls.writes.length,0);
});
