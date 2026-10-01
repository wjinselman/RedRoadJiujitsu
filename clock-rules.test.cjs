// Exercise the shipped classWindow helper at fixed dates through an emulator-only test endpoint.
// Production rules are read unchanged; only this harness appends a read-only test match.
const {test,before,after}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');
const {initializeTestEnvironment,assertSucceeds,assertFails}=require('@firebase/rules-unit-testing');
const {doc,setDoc,getDoc,Timestamp}=require('firebase/firestore');let env;
before(async()=>{assert.equal(process.env.FIRESTORE_EMULATOR_HOST,'127.0.0.1:8080');const rules=fs.readFileSync(path.join(__dirname,'../firestore.rules'),'utf8').replace('    // Explicit deny-by-default',`    match /clockTests/{id} { allow get: if classWindow(resource.data,resource.data.clock); }\n    // Explicit deny-by-default`);env=await initializeTestEnvironment({projectId:'demo-redroad-clock',firestore:{host:'127.0.0.1',port:8080,rules}});});
after(async()=>env&&env.cleanup());
const cases=[
 ['summer kids start','2026-09-30T22:45:00Z','2026-09-30','Kids Jiu Jitsu',true],
 ['summer kids early','2026-09-30T22:44:59Z','2026-09-30','Kids Jiu Jitsu',false],
 ['summer kids end','2026-10-01T00:00:00Z','2026-09-30','Kids Jiu Jitsu',false],
 ['summer adult start','2026-09-30T23:45:00Z','2026-09-30','Adult Jiu Jitsu',true],
 ['summer adult end','2026-10-01T01:00:00Z','2026-09-30','Adult Jiu Jitsu',false],
 ['winter adult start','2026-01-06T00:45:00Z','2026-01-05','Adult Jiu Jitsu',true],
 ['winter adult early','2026-01-05T23:45:00Z','2026-01-05','Adult Jiu Jitsu',false],
 ['Tuesday no gi','2026-09-15T23:50:00Z','2026-09-15','Adult No-Gi',true],
 ['Tuesday wrong class','2026-09-15T23:50:00Z','2026-09-15','Adult Jiu Jitsu',false],
 ['Friday no gi','2026-09-18T23:50:00Z','2026-09-18','Adult No-Gi',true],
 ['Saturday closed','2026-09-19T23:50:00Z','2026-09-19','Adult Jiu Jitsu',false],
 ['wrong date','2026-09-30T23:50:00Z','2026-10-01','Adult Jiu Jitsu',false],
 ['spring DST Monday','2026-03-09T23:45:00Z','2026-03-09','Adult Jiu Jitsu',true],
 ['before spring DST Friday','2026-03-07T00:45:00Z','2026-03-06','Adult No-Gi',true],
 ['fall DST Monday','2026-11-03T00:45:00Z','2026-11-02','Adult Jiu Jitsu',true],
 ['before fall DST Friday','2026-10-30T23:45:00Z','2026-10-30','Adult No-Gi',true],
 ['2027 summer','2027-06-01T23:50:00Z','2027-06-01','Adult No-Gi',true],
];
for(const [name,iso,classDate,className,allowed]of cases)test(name,async()=>{
 await env.withSecurityRulesDisabled(c=>setDoc(doc(c.firestore(),'clockTests',name),{clock:Timestamp.fromDate(new Date(iso)),classDate,className}));
 const operation=getDoc(doc(env.unauthenticatedContext().firestore(),'clockTests',name));await (allowed?assertSucceeds:assertFails)(operation);
});
