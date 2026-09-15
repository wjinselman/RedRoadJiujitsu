const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const vm=require('node:vm');const {webcrypto,createHash}=require('node:crypto');const {JSDOM,VirtualConsole}=require('jsdom');const postcss=require('postcss');
const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function makeDom(page,width=390){
 const errors=[];const console=new VirtualConsole();console.on('jsdomError',e=>{if(!e.message.includes('navigation')&&!e.message.includes('CSS stylesheet'))errors.push(e.message);});
 const dom=new JSDOM(read(page.split('?')[0]),{url:'https://test.invalid/'+page,runScripts:'outside-only',pretendToBeVisual:true,virtualConsole:console});const w=dom.window;
 const media=[];w.innerWidth=width;w.matchMedia=query=>{const obj={matches:query.includes('max-width')?width<=Number(query.match(/\d+/)[0]):false,media:query,addEventListener:(_,fn)=>{obj.change=fn;},removeEventListener:()=>{}};media.push(obj);return obj;};
 Object.defineProperty(w,'crypto',{value:webcrypto});w.TextEncoder=TextEncoder;w.TextDecoder=TextDecoder;
 w.HTMLElement.prototype.scrollIntoView=function(){this.dataset.scrolled='true';};w.HTMLElement.prototype.scrollTo=function(opts){this.scrollLeft=opts.left||0;this.dispatchEvent(new w.Event('scroll'));};
 w.URL.createObjectURL=()=> 'blob:https://test.invalid/local-pdf';w.URL.revokeObjectURL=()=>{};w.confirm=()=>false;w.open=()=>null;
 return {dom,w,d:w.document,errors,media,close:()=>dom.window.close()};
}
function runClassic(env,file){env.w.eval(read(file));}
async function load(env,file,extra='',options={}){
 const calls={writes:[],commits:0,reads:[],signIns:0};const records=options.records||{};const lists=options.lists||{};
 const snapshot=(id,data)=>({id,exists:()=>data!==undefined,data:()=>data});
 const mocks={firebaseConfigured:true,auth:{currentUser:options.user||null},db:{},
  doc:(_,group,id)=>({group,id}),collection:(_,group)=>({group}),query:(target,...constraints)=>({...target,constraints}),where:(...args)=>args,orderBy:(...args)=>args,startAfter:doc=>({after:doc.id}),limit:n=>({limit:n}),serverTimestamp:()=>({timestamp:true}),
  getDoc:async ref=>{calls.reads.push(ref);return snapshot(ref.id,records[ref.group+'/'+ref.id]);},
  getDocs:async ref=>{calls.reads.push(ref);if(options.failGroups?.includes(ref.group))throw {code:'permission-denied'};let rows=lists[ref.group]||[];const after=ref.constraints?.find(item=>item.after)?.after;const cap=ref.constraints?.find(item=>item.limit)?.limit||250;if(after)rows=rows.slice(rows.findIndex(item=>item.id===after)+1);return {docs:rows.slice(0,cap).map(item=>snapshot(item.id,item))};},
  setDoc:async(ref,payload)=>{calls.writes.push({ref,payload});if(options.writeDelay)await options.writeDelay;if(options.writeError)throw options.writeError;},deleteDoc:async ref=>{calls.writes.push({delete:ref});},
  writeBatch:()=>({set:(ref,payload)=>calls.writes.push({ref,payload}),delete:ref=>calls.writes.push({delete:ref}),commit:async()=>{calls.commits++;if(options.commitDelay)await options.commitDelay;if(options.writeError)throw options.writeError;}}),
  signInWithEmailAndPassword:async()=>{calls.signIns++;return {user:options.user||{email:'owner@example.invalid',emailVerified:true}};},
  signInAnonymously:async()=>{mocks.auth.currentUser={uid:'anonymous-test',isAnonymous:true};return {user:mocks.auth.currentUser};},
  createUserWithEmailAndPassword:async()=>{calls.signIns++;return {user:{uid:'test'}};},sendPasswordResetEmail:async()=>{},sendEmailVerification:async()=>{},updatePassword:async()=>{},reauthenticateWithCredential:async()=>{},EmailAuthProvider:{credential:()=>({})},signOut:async()=>{mocks.auth.currentUser=null;},deleteUser:async()=>{},onAuthStateChanged:()=>()=>{},
 };
 mocks.getDocFromServer=async ref=>{if(options.failServerVerification)throw new Error('offline');return mocks.getDoc(ref);};
 mocks.getDocsFromServer=mocks.getDocs;
 const context=env.dom.getInternalVMContext();const cache=new Map();
 const firebase=new vm.SyntheticModule(Object.keys(mocks),function(){for(const [key,value]of Object.entries(mocks))this.setExport(key,value);},{context});
 async function get(name){name=name.split('?')[0].replace(/^\.\//,'');if(name.startsWith('firebase-'))return firebase;if(cache.has(name))return cache.get(name);const module=new vm.SourceTextModule(read(name)+(name===file?'\n'+extra:''),{context,identifier:name});cache.set(name,module);await module.link(async spec=>get(spec));return module;}
 const module=await get(file);await module.evaluate();return {api:module.namespace,calls,mocks};
}
function click(env,selector){env.d.querySelector(selector).click();}
function submit(env,selector){env.d.querySelector(selector).dispatchEvent(new env.w.Event('submit',{bubbles:true,cancelable:true}));}
function fillWaiver(env){const values={participantName:'Alex Tester',dob:'1990-02-01',email:'alex@example.invalid',phone:'5550101',address:'Test address',emergencyName:'Sam Tester',emergencyPhone:'5550102',signatureName:'Alex Tester',signatureDate:'2026-09-15',trialDate:'2026-09-18'};for(const[id,value]of Object.entries(values)){const el=env.d.getElementById(id);if(el)el.value=value;}for(const id of ['readAgreement','voluntary','electronicConsent'])env.d.getElementById(id).checked=true;}

test('Every page has valid local assets, unique IDs, labeled fields and new stylesheet',async()=>{
 for(const name of fs.readdirSync(root).filter(n=>n.endsWith('.html')&&n!=='admin-demo.html')){
  const e=makeDom(name);const ids=[...e.d.querySelectorAll('[id]')].map(el=>el.id);assert.equal(new Set(ids).size,ids.length,name+' duplicate ID');
  assert.ok(e.d.querySelector('link[href^="experience.css?v="]'),name);assert.ok(e.d.querySelector('meta[name=viewport]').content.includes('viewport-fit=cover'));
  for(const el of e.d.querySelectorAll('[src],link[rel=stylesheet],a[href]')){
   const value=el.getAttribute('src')||el.getAttribute('href');if(!value||/^(?:https?:|mailto:|tel:|blob:|data:)/.test(value))continue;
   const [filePart,hash]=value.split('?')[0].split('#');const target=filePart?path.resolve(root,filePart):path.join(root,name);assert.ok(fs.existsSync(target),name+' missing '+value);
   if(hash&&target.endsWith('.html')){const targetDoc=target===path.join(root,name)?e.d:new JSDOM(fs.readFileSync(target,'utf8')).window.document;assert.ok(targetDoc.getElementById(hash),name+' bad anchor '+value);}
  }
  for(const input of e.d.querySelectorAll('input:not([type=hidden]),select,textarea'))assert.ok(input.labels?.length||input.getAttribute('aria-label'),name+' field lacks label '+input.id);
  e.close();
 }
});
test('CSS parses, referenced files exist, responsive controls include 16px inputs and reduced motion',()=>{
 for(const name of fs.readdirSync(root).filter(n=>n.endsWith('.css'))){const css=postcss.parse(read(name));css.walkDecls(decl=>{for(const match of decl.value.matchAll(/url\(['"]?([^'")]+)['"]?\)/g)){if(!/^data:|^http/.test(match[1]))assert.ok(fs.existsSync(path.join(root,match[1].split('?')[0])),name+' '+match[1]);}});}
 assert.match(read('experience.css'),/font:400 16px/);assert.match(read('experience.css'),/prefers-reduced-motion:reduce/);assert.match(read('experience.css'),/min-height:46px!important/);
});
for(const width of [320,360,390,430,700,768,1024,1100,1440])test(`Navigation logic at simulated ${width}px (DOM, not rendered layout)`,()=>{
 const e=makeDom('index.html',width);runClassic(e,'mobile-nav.js');runClassic(e,'experience.js');
 assert.equal(e.d.querySelectorAll('.mobile-action-bar').length,1);const panel=e.d.getElementById('mobile-site-nav');assert.equal(panel.hidden,true);
 click(e,'.mobile-menu-toggle');assert.equal(panel.hidden,false);assert.equal(e.d.querySelector('.mobile-menu-toggle').getAttribute('aria-expanded'),'true');assert.equal(e.d.querySelector('main').inert,true);
 e.d.dispatchEvent(new e.w.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));assert.equal(panel.hidden,true);assert.equal(e.d.activeElement,e.d.querySelector('.mobile-menu-toggle'));assert.notEqual(e.d.querySelector('main').inert,true);
 click(e,'.mobile-menu-toggle');click(e,'.mobile-nav-links a[href="#schedule"]');assert.equal(panel.hidden,true);assert.equal(e.d.querySelector('#schedule').id,'schedule');e.close();
});
for(const page of ['owner.html','members.html','waiver.html','enroll.html'])test(`${page}: no trial dock; secure forms and password controls`,()=>{
 const e=makeDom(page);runClassic(e,'mobile-nav.js');runClassic(e,'experience.js');assert.equal(e.d.querySelector('.mobile-action-bar'),null);
 const pw=e.d.querySelector('input[type=password]');if(pw){const button=pw.parentElement.querySelector('button');button.click();assert.equal(pw.type,'text');button.click();assert.equal(pw.type,'password');}
 const form=e.d.querySelector('form');submit(e,'form');assert.match(form.textContent,/Nothing was submitted/);assert.equal(form.method,'post');e.close();
});
test('Focus trap cycles, outside dismiss restores scroll and resize closes menu',()=>{
 const e=makeDom('index.html');runClassic(e,'mobile-nav.js');click(e,'.mobile-menu-toggle');const last=e.d.querySelector('.mobile-nav-primary');last.focus();e.d.dispatchEvent(new e.w.KeyboardEvent('keydown',{key:'Tab',bubbles:true,cancelable:true}));assert.equal(e.d.activeElement,e.d.querySelector('.mobile-menu-toggle'));
 click(e,'.nav-backdrop');assert.equal(e.d.body.style.overflow,'');click(e,'.mobile-menu-toggle');e.media[0].matches=false;e.media[0].change();assert.equal(e.d.getElementById('mobile-site-nav').hidden,true);e.close();
});
test('Member dashboard attendance is outside summary grid; roster is first; print library exists',()=>{
 const m=makeDom('members.html');assert.equal(m.d.querySelector('.attendance-history-panel').closest('.compact-member-grid'),null);m.close();const o=makeDom('owner.html');assert.equal(o.d.querySelector('#owner-app>.owner-card').id,'staff-members');assert.ok(o.d.querySelector('#staff-waivers #owner-waiver-panel'));o.close();
});
test('Member attendance is a hidden monthly view opened by one dashboard button',()=>{
 const m=makeDom('members.html');const button=m.d.getElementById('toggle-member-attendance');const panel=m.d.getElementById('member-attendance-panel');assert.ok(button);assert.equal(panel.hidden,true);assert.ok(m.d.getElementById('attendance-prev-month'));assert.ok(m.d.getElementById('attendance-next-month'));assert.equal(panel.querySelectorAll('[data-attendance-action]').length,0);m.close();
});
test('Phone check-in is available and shared kiosk is feature-disabled',async()=>{
 const m=makeDom('members.html');assert.equal(m.d.getElementById('member-checkin-button'),null);m.close();const c=makeDom('checkin.html');assert.ok(c.d.getElementById('checkin-confirm-button'));c.close();
 const k=makeDom('kiosk.html');await load(k,'kiosk.js');assert.equal(k.d.getElementById('kiosk-auth-view').hidden,true);assert.ok(k.d.querySelector('[data-kiosk-disabled="true"]'));k.close();
 const config=read('launch-config.js');assert.match(config,/memberPhoneCheckIn:\s*true/);assert.match(config,/kioskAttendance:\s*false/);
});
test('Staff attendance options provide explicit kiosk enable and disable modes',()=>{
 const e=makeDom('owner.html');const select=e.d.getElementById('kiosk-mode-select');assert.deepEqual([...select.options].map(option=>option.value),['disabled','enabled']);assert.equal(select.value,'disabled');e.close();
});
test('Member phone check-in writes only the signed-in member attendance record',async()=>{
 const e=makeDom('checkin.html');const user={email:'alex@example.invalid',emailVerified:true};const records={'members/alex@example.invalid':{email:user.email,name:'Alex Tester',plan:'Adult',enabled:true,active:true,archived:false}};
 const x=await load(e,'checkin.js','',{user,records});e.d.getElementById('checkin-email').value=user.email;e.d.getElementById('checkin-password').value='password';submit(e,'#checkin-login-form');await tick();await tick();click(e,'#checkin-confirm-button');await tick();await tick();
 assert.equal(x.calls.writes.length,1);assert.equal(x.calls.writes[0].ref.group,'attendance');assert.equal(x.calls.writes[0].payload.memberEmail,user.email);assert.equal(x.calls.writes[0].payload.checkedInBy,user.email);assert.equal(x.calls.writes[0].payload.source,'member');assert.equal(e.d.getElementById('checkin-confirm-button').textContent,'Checked In');e.close();
});
test('Owner, developer and coach UI permissions remain separate',async()=>{
 for(const role of ['owner','developer','coach']){
  const e=makeDom('owner.html');const email=role+'@example.invalid';const rec={name:'Test '+role,enabled:true,active:true,coachAccess:true};const group=role==='developer'?'developers':role==='owner'?'owners':'members';
  const x=await load(e,'portal.js','export {authorizeStaff};',{records:{[group+'/'+email]:rec},user:{email,emailVerified:true}});await x.api.authorizeStaff({email,emailVerified:true});
  assert.equal(e.d.getElementById('developer-access-card').hidden,role!=='developer');assert.equal(e.d.getElementById('staff-developer-link').hidden,role!=='developer');assert.equal(e.d.getElementById('toggle-add-member').hidden,role==='coach');assert.equal(e.d.getElementById('owner-app').hidden,false);e.close();
 }
});
test('Roster escapes malicious names, filters, uses stripes and neutralizes spreadsheet formulas',async()=>{
 const e=makeDom('owner.html');const {api}=await load(e,'portal.js',`export {csvCell,visibleRoster,renderOwnerList,formatRank};export function seed(records){ownerMembers=records;ownerIdentity={role:'owner'};}`);
 api.seed([{email:'a@example.invalid',name:'<img src=x onerror=alert(1)>',plan:'Adult',active:true,paid:true,rank:'Blue Belt',stripes:2},{email:'b@example.invalid',name:'Other',plan:'Kids',active:false}]);api.renderOwnerList();assert.equal(e.d.querySelector('#owner-member-list img'),null);assert.match(e.d.querySelector('#owner-member-list').textContent,/<img/);assert.equal(api.formatRank({rank:'Blue Belt',stripes:2}),'Blue Belt · 2 Stripes');
 e.d.getElementById('owner-status-filter').value='active';assert.equal(api.visibleRoster().length,1);assert.ok(api.csvCell('  =cmd').startsWith('"\''));assert.ok(api.csvCell('@SUM(1)').startsWith('"\''));e.close();
});
test('Async guard prevents duplicate saves and always re-enables controls',async()=>{
 const e=makeDom('owner.html');const {api}=await load(e,'ui-utils.js');let release;const wait=new Promise(r=>release=r);let calls=0;const form=e.d.getElementById('add-member-form');api.listenAsync(form,'submit',async()=>{calls++;await wait;});submit(e,'#add-member-form');submit(e,'#add-member-form');assert.equal(calls,1);assert.equal(form.getAttribute('aria-busy'),'true');release();await tick();assert.equal(form.getAttribute('aria-busy'),null);assert.equal(form.querySelector('button[type=submit]').disabled,false);e.close();
});
test('Waiver library combines member, trial and standalone without reading full records upfront',async()=>{
 const e=makeDom('owner.html');const x=await load(e,'portal.js',`export {waiverLibraryEntries,renderWaiverLibrary};export function seed(){ownerMembers=[{name:'Member',email:'m@example.invalid',waiverSigned:true,waiverReceiptId:'M-1'}];ownerTrials=[{id:'t',participantName:'Trial',receiptId:'T-1'}];standaloneWaivers=[{id:'s',participantName:'Guest',receiptId:'S-1'}];}`);x.api.seed();x.api.renderWaiverLibrary();assert.equal(e.d.querySelectorAll('[data-waiver-key]').length,3);e.d.getElementById('waiver-search').value='Guest';x.api.renderWaiverLibrary();assert.equal(e.d.querySelectorAll('[data-waiver-key]').length,1);assert.equal(x.calls.reads.length,0);e.close();
});
test('A failed optional load is not reported as an empty collection',async()=>{
 const e=makeDom('owner.html');const x=await load(e,'portal.js','export {authorizeStaff};',{records:{'owners/owner@example.invalid':{name:'Owner',enabled:true}},user:{email:'owner@example.invalid'},failGroups:['trialWaivers','attendance','waiverSubmissions']});await x.api.authorizeStaff({email:'owner@example.invalid'});assert.match(e.d.getElementById('trial-request-list').textContent,/could not be loaded/);assert.match(e.d.getElementById('attendance-list').textContent,/could not be loaded/);assert.equal(e.d.getElementById('waiver-library-message').hidden,false);e.close();
});
test('Saved waiver pagination exposes older records without automatic reads',async()=>{
 const e=makeDom('owner.html');const records=Array.from({length:251},(_,i)=>({id:'record-'+i,participantName:'Visitor '+i,receiptId:'R-'+i,signedAt:'2026-09-15'}));
 const x=await load(e,'portal.js','export {loadStandaloneWaivers,waiverLibraryEntries};',{lists:{waiverSubmissions:records}});
 await x.api.loadStandaloneWaivers();assert.equal(x.api.waiverLibraryEntries().length,250);assert.equal(e.d.getElementById('waiver-load-more').hidden,false);assert.equal(x.calls.reads.length,1);
 await x.api.loadStandaloneWaivers(true);assert.equal(x.api.waiverLibraryEntries().length,251);assert.equal(e.d.getElementById('waiver-load-more').hidden,true);assert.equal(x.calls.reads.length,2);assert.equal(x.calls.reads[1].constraints.find(item=>item.after).after,'record-249');e.close();
});
test('Trial list changes update the signed-waiver search results',async()=>{
 const e=makeDom('owner.html');const x=await load(e,'portal.js',`export {renderTrialRequests};export function seed(records){ownerTrials=records;}`);x.api.seed([{id:'trial',participantName:'Visitor',receiptId:'T-1'}]);x.api.renderTrialRequests();assert.equal(e.d.querySelectorAll('[data-waiver-key]').length,1);x.api.seed([]);x.api.renderTrialRequests();assert.equal(e.d.querySelectorAll('[data-waiver-key]').length,0);e.close();
});
test('Standalone waiver commits once, auto-saves and exposes no email flow',async()=>{
 const e=makeDom('waiver.html');fillWaiver(e);const x=await load(e,'waiver-prod14.js');submit(e,'#waiver-form');await tick();await tick();assert.equal(x.calls.commits,1);assert.equal(x.calls.writes[0].ref.group,'waiverSubmissions');assert.match(e.d.getElementById('waiver-success').textContent,/saved with Red Road/);assert.equal(e.d.getElementById('waiver-submit').disabled,true);submit(e,'#waiver-form');await tick();assert.equal(x.calls.commits,1);assert.equal(e.d.querySelector('a[href^="mailto:"]'),null);assert.equal(e.w.localStorage.length,0);e.close();
});
test('Trial write failure leaves the form retryable and never shows saved success',async()=>{
 const e=makeDom('waiver.html?trial=1');const x=await load(e,'waiver-prod14.js','',{writeError:{code:'permission-denied'}});fillWaiver(e);submit(e,'#waiver-form');await tick();await tick();assert.equal(x.calls.commits,1);assert.equal(e.d.getElementById('waiver-submit').disabled,false);assert.match(e.d.getElementById('waiver-success').textContent,/not saved/);assert.equal(e.d.querySelector('.waiver-print-actions'),null);e.close();
});
test('Enrollment prefills from tab storage, not a contact-data URL',async()=>{
 const e=makeDom('waiver.html?enrollment=1');e.w.sessionStorage.setItem('redroad:pendingEnrollment',JSON.stringify({name:'Alex Tester',email:'alex@example.invalid',phone:'5550101',dob:'1990-02-01',program:'Adult'}));await load(e,'waiver-prod14.js');assert.equal(e.d.getElementById('participantName').value,'Alex Tester');assert.equal(e.d.getElementById('email').value,'alex@example.invalid');assert.match(read('enroll-prod14.js'),/location.href = 'waiver.html\?enrollment=1'/);assert.doesNotMatch(read('enroll-prod14.js'),/new URLSearchParams\(\{ enrollment/);e.close();
});
test('Minor guardian and optional photo initials are conditionally required',async()=>{
 const e=makeDom('waiver.html');await load(e,'waiver-prod14.js');e.d.getElementById('dob').value='2020-01-01';e.d.getElementById('dob').dispatchEvent(new e.w.Event('change'));assert.equal(e.d.getElementById('guardianName').required,true);assert.equal(e.d.getElementById('minor-fields').hidden,false);e.d.getElementById('photoVideoRelease').checked=true;e.d.getElementById('photoVideoRelease').dispatchEvent(new e.w.Event('change'));assert.equal(e.d.getElementById('photoVideoInitials').required,true);e.close();
});
test('Kiosk PIN mismatch does not write; double submission creates one attempt; denial is honest',async()=>{
 const e=makeDom('kiosk.html');let release;const wait=new Promise(r=>release=r);const member={displayName:'Alex Tester',memberEmail:'alex@example.invalid',plan:'Adult',pinHash:createHash('sha256').update('alex@example.invalid|1234').digest('hex')};
 const x=await load(e,'kiosk.js',`export {checkIn,resetKiosk};export function seed(member){selectedMember=member;kioskIdentity={email:'kiosk@example.invalid'};}`,{writeDelay:wait,writeError:{code:'permission-denied'}});x.api.seed(member);await x.api.checkIn('0000');assert.equal(x.calls.writes.length,0);
 const pending=x.api.checkIn('1234');await tick();const second=x.api.checkIn('1234');await tick();assert.equal(x.calls.writes.length,1);release();await pending;await second;assert.match(e.d.getElementById('kiosk-message').textContent,/could not be confirmed/);assert.equal(e.d.getElementById('kiosk-pin-form').getAttribute('aria-busy'),null);x.api.resetKiosk();assert.equal(e.d.getElementById('kiosk-pin').value,'');e.close();
});
test('Original agreement bytes unchanged; no email or backend polling added',()=>{
 assert.equal(createHash('sha256').update(fs.readFileSync(path.join(root,'assets/red-road-liability-waiver.pdf'))).digest('hex'),'52beb56fddff42b277a41fa687623db9a14afffcc65a237b393c50e78958e864');
 for(const name of ['experience.js','portal.js','waiver-prod14.js','waiver-pdf.js'])assert.doesNotMatch(read(name),/mailto:|protonmail|onSnapshot\(/);
 assert.match(read('firestore.rules'),/match \/waiverSubmissions\/\{receiptId\}/);assert.match(read('firestore.rules'),/allow update: if false/);
});
test('Account pages use document scrolling and menu exit restores both overflow locks',()=>{
 for(const name of ['index.html','story.html','owner.html','members.html','waiver.html?trial=1','waiver.html','waiver.html?enrollment=1','enroll.html']){
  const e=makeDom(name);assert.ok(e.d.documentElement.classList.contains('rr-scroll-document'));runClassic(e,'mobile-nav.js');
  click(e,'.mobile-menu-toggle');assert.equal(e.d.documentElement.style.overflow,'hidden');assert.equal(e.d.body.style.overflow,'hidden');
  e.w.dispatchEvent(new e.w.Event('pagehide'));assert.equal(e.d.documentElement.style.overflow,'');assert.equal(e.d.body.style.overflow,'');assert.notEqual(e.d.querySelector('main').inert,true);
  click(e,'.mobile-menu-toggle');e.w.dispatchEvent(new e.w.Event('pageshow'));assert.equal(e.d.documentElement.style.overflow,'');assert.equal(e.d.body.style.overflow,'');e.close();
 }
 assert.match(read('experience.css'),/html\.rr-scroll-document\{overflow-x:clip;overflow-y:auto\}/);
 assert.match(read('experience.css'),/html\.rr-scroll-document body\{overflow:visible;overscroll-behavior-y:auto\}/);
});
test('Status updates do not pull the mobile dashboard back up the page',async()=>{
 const e=makeDom('owner.html');let scrolls=0;e.w.HTMLElement.prototype.scrollIntoView=()=>{scrolls++;};runClassic(e,'experience.js');const notice=e.d.getElementById('owner-message');notice.hidden=false;notice.textContent='Saved';await tick();assert.equal(scrolls,0);e.close();
});
test('Permanent deletion targets the actual legacy document ID and verifies all deletes on server',async()=>{
 const e=makeDom('owner.html');const x=await load(e,'portal.js',`export {permanentlyRemoveMember};export function owner(){ownerIdentity={role:'developer'};}`);x.api.owner();await x.api.permanentlyRemoveMember({id:'legacy-test-record',email:'test@example.invalid'});
 assert.equal(x.calls.writes[0].delete.id,'legacy-test-record');assert.equal(x.calls.writes[0].delete.group,'members');assert.equal(x.calls.commits,1);assert.deepEqual(x.calls.reads.map(ref=>ref.group),['members','checkInDirectory','waivers']);e.close();
});
test('Permanent deletion never confirms success for a surviving record or failed server verification',async()=>{
 for(const options of [{records:{'members/legacy':{name:'Test'}}},{failServerVerification:true}]){
  const e=makeDom('owner.html');const x=await load(e,'portal.js',`export {permanentlyRemoveMember};export function owner(){ownerIdentity={role:'owner'};}`,options);x.api.owner();await assert.rejects(x.api.permanentlyRemoveMember({id:'legacy',email:'test@example.invalid'}),/server|verification/);e.close();
 }
});
test('Homepage preserves hero trial and the three-button bar with only its center changed',()=>{
 const e=makeDom('index.html',385);runClassic(e,'mobile-nav.js');const hero=e.d.querySelector('.hero-actions');assert.equal(hero.children[0].textContent,'Try One Class Free');assert.equal(hero.children[0].getAttribute('href'),'waiver.html?trial=1');assert.equal(hero.children[1].textContent,'See Class Times');const buttons=[...e.d.querySelectorAll('.mobile-action-bar a')];assert.deepEqual(buttons.map(a=>a.textContent),['Schedule','Sign Up Now','Members']);assert.deepEqual(buttons.map(a=>a.getAttribute('href')),['#schedule','enroll.html','members.html']);assert.doesNotMatch(read('mobile-nav.js'),/account-nav/);e.close();
});
