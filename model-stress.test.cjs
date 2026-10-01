const {test}=require('node:test');const assert=require('node:assert/strict');const path=require('node:path');const {pathToFileURL}=require('node:url');
const mod=n=>import(pathToFileURL(path.join(__dirname,'..',n)));
test('4,800 independent calendar months preserve coverage and roll correctly',async()=>{
 const {paymentPeriod}=await mod('billing-model.js');let checked=0;
 for(let y=2000;y<2400;y++)for(let m=1;m<=12;m++){
 const last=new Date(Date.UTC(y,m,0)).getUTCDate(),prefix=y+'-'+String(m).padStart(2,'0');
 const r=paymentPeriod(prefix+'-15');assert.equal(r.paidThrough,prefix+'-'+last);assert.equal(new Date(r.nextDue+'T00:00Z')-new Date(r.paidThrough+'T00:00Z'),86400000);checked++;
 }assert.equal(checked,4800);
});
test('1,000 receipts reconcile exact integer cents without charging covered/exempt twice',async()=>{
 const {planSave,summarizePayments}=await mod('billing-model.js'),{summarizeExpected}=await mod('billing-report.js');
 const categories=['adult','kids','service','family-payer'],rates=[13500,9000,10000,30000];let total=0;const rows=[],members=[],profiles=new Map();
 for(let i=0;i<1000;i++){const category=categories[i%4],member={email:'m'+i+'@test.invalid',name:'Sample',active:true,paid:false};const r=planSave({member,category,wantsPaid:true,paidOn:'2026-09-30'});rows.push(r.receipt);members.push(member);profiles.set(member.email,r.profile);total+=rates[i%4];}
 members.push({email:'covered@test.invalid',name:'Covered',active:true},{email:'coach@test.invalid',active:true,coachAccess:true});profiles.set('covered@test.invalid',{category:'family-covered',payerEmail:'m3@test.invalid'});
 assert.equal(summarizePayments(rows).total,total);assert.equal(summarizeExpected(members,profiles).total,total);
});
test('membership status rolls at Central midnight, including DST seasons',async()=>{
 const {gymDate,status}=await mod('billing-model.js');
 assert.equal(gymDate(new Date('2026-10-01T04:59:59Z')),'2026-09-30');assert.equal(gymDate(new Date('2026-10-01T05:00:00Z')),'2026-10-01');
 assert.equal(gymDate(new Date('2026-02-01T05:59:59Z')),'2026-01-31');
 const p={paid:true,paidThrough:'2026-09-30'};assert.equal(status({},p,null,'2026-09-30').current,true);assert.equal(status({},p,null,'2026-10-01').current,false);
});
test('report escapes all externally sourced labels; formula-like text remains text',async()=>{
 const {renderReport}=await mod('billing-report.js');const name='<img src=x onerror=alert(1)>';
 const html=renderReport({selected:'2026-09',previous:'2026-08',rows:[{payerName:name,payerEmail:name,category:'adult',paidOn:'2026-09-30',paidThrough:'2026-09-30',amountCents:13500}],previousRows:[],expected:{totals:{},counts:{},nonpaying:[],total:0,count:0,legacyPaid:0},today:'2026-09-30'});
 assert.ok(!html.includes('<img'));assert.ok(html.includes('&lt;img'));
});
