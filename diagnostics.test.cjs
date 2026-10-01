const {test,after}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const {JSDOM}=require('jsdom');
const envs=[];after(()=>envs.forEach(d=>d.window.close()));const tick=()=>new Promise(r=>setImmediate(r));
function setup(){
 const d=new JSDOM(fs.readFileSync(path.join(__dirname,'../owner.html'),'utf8'),{url:'https://test.invalid/owner.html?email=secret@example.invalid',runScripts:'outside-only'});envs.push(d);
 const w=d.window;const calls=[];let observer;let rows=[];let readFailure=false;let pending;
 w.eval(fs.readFileSync(path.join(__dirname,'../diagnostics.js'),'utf8'));
 const sdk={auth:{},db:{},onAuthStateChanged:(_,cb)=>observer=cb,doc:(_,g,id)=>({g,id}),collection:(_,g)=>({g}),query:(q,...c)=>({...q,c}),orderBy:(...v)=>v,limit:n=>n,serverTimestamp:()=>({stamp:true}),setDoc:async(ref,data,opts)=>{calls.push({ref,data,opts});if(sdk.fail)throw Error('fail');},getDocsFromServer:async()=>{if(pending)await pending;if(readFailure)throw Error('failed');return {docs:rows.map((r,i)=>({id:'row'+i,data:()=>r}))};}};
 w.RRDiagnostics.connect(sdk);observer({uid:'user',email:'user@test.invalid',emailVerified:true});
 return {w,calls,sdk,observer,api:w.RRDiagnostics,setRows:r=>rows=r,setFail:()=>readFailure=true,setPending:p=>pending=p};
}
const row={code:'permission-denied',kind:'Error',operation:'portal',page:'owner.html',device:'Desktop',browser:'Chrome',version:'54-diagnostics',count:1,status:'open',line:0,updatedAt:{toDate:()=>new Date()}};
test('allowlisted telemetry excludes messages, stack, email, query strings, arbitrary properties',()=>{
 const e=setup();e.api.report({name:'TypeError',code:'firestore/permission-denied',message:'secret@example.invalid password123',stack:'private',value:'signature'},'portal');
 assert.equal(e.calls.length,1);assert.equal(e.calls[0].data.code,'permission-denied');
 assert.doesNotMatch(JSON.stringify(e.calls),/secret|password|signature|stack|message/);
});
test('10,000 errors stay bounded and repeated errors do not flood writes',()=>{
 const e=setup();for(let i=0;i<10000;i++)e.api.report(new e.w.TypeError('private'),'portal');
 assert.equal(e.api.snapshot().length,1);assert.equal(e.api.snapshot()[0].count,9999);assert.equal(e.calls.length,1);
 for(let i=0;i<1000;i++)e.api.report(new e.w.Error('private'),'runtime',i);
 assert.ok(e.api.snapshot().length<=10);assert.ok(e.calls.length<=10);
});
test('diagnostic write failure does not reject or recursively report',async()=>{
 const e=setup();e.sdk.fail=true;e.api.report(new Error('failure'),'portal');await tick();assert.equal(e.calls.length,1);assert.equal(e.api.snapshot().length,1);
});
test('anonymous and unverified errors never write; auth changes clear local data',()=>{
 const e=setup();e.observer(null);e.api.report(new Error('offline'),'portal');assert.equal(e.calls.length,0);assert.equal(e.api.snapshot().length,1);
 e.observer({uid:'u2',email:'u2@test.invalid',emailVerified:false});e.api.report(new Error('x'));assert.equal(e.calls.length,0);
 e.observer({uid:'u3',email:'u3@test.invalid',emailVerified:true});assert.equal(e.api.snapshot().length,0);
});
test('board stays hidden until authorized; signout hides and empties it',async()=>{
 const e=setup();const d=e.w.document;assert.equal(d.querySelector('#diagnostics-card').hidden,true);e.api.showAdmin(true);assert.equal(d.querySelector('#diagnostics-card').hidden,false);
 e.setRows([row]);d.querySelector('#diagnostics-refresh').click();await tick();assert.equal(d.querySelectorAll('#diagnostics-list details').length,1);
 e.observer(null);assert.equal(d.querySelector('#diagnostics-card').hidden,true);assert.equal(d.querySelector('#diagnostics-list').textContent,'');assert.equal(d.querySelector('#staff-diagnostics-link').hidden,true);
});
test('expanded details survive manual refresh; resolving hides only after confirmed save',async()=>{
 const e=setup();const d=e.w.document;e.api.showAdmin(true);e.setRows([row]);d.querySelector('#diagnostics-refresh').click();await tick();d.querySelector('#diagnostics-list details').open=true;
 d.querySelector('#diagnostics-refresh').click();await tick();assert.equal(d.querySelector('#diagnostics-list details').open,true);
 d.querySelector('#diagnostics-list button').click();await tick();assert.equal(e.calls[0].data.status,'resolved');assert.equal(d.querySelectorAll('#diagnostics-list details').length,0);
 d.querySelector('#diagnostics-resolved').checked=true;d.querySelector('#diagnostics-resolved').dispatchEvent(new e.w.Event('change'));assert.equal(d.querySelectorAll('#diagnostics-list details').length,1);
});
test('a late cloud response cannot repopulate board after signout',async()=>{
 const e=setup();const d=e.w.document;let release;e.setPending(new Promise(r=>release=r));e.setRows([row]);e.api.showAdmin(true);d.querySelector('#diagnostics-refresh').click();e.observer(null);release();await tick();assert.equal(d.querySelector('#diagnostics-list').textContent,'');
});
test('malicious cloud values render as text, never markup',async()=>{
 const e=setup();const d=e.w.document;e.setRows([{...row,operation:'<img src=x onerror=alert(1)>'}]);e.api.showAdmin(true);d.querySelector('#diagnostics-refresh').click();await tick();assert.equal(d.querySelector('#diagnostics-list img'),null);assert.match(d.querySelector('#diagnostics-list').textContent,/<img/);
});
test('unhandled rejection and runtime error listeners capture sanitized details',()=>{
 const e=setup();e.w.dispatchEvent(new e.w.ErrorEvent('error',{error:new e.w.ReferenceError('private'),lineno:42}));assert.equal(e.api.snapshot()[0].line,42);const event=new e.w.Event('unhandledrejection');event.reason={code:'firestore/unavailable'};e.w.dispatchEvent(event);assert.equal(e.api.snapshot()[0].operation,'promise');
});
