/* Red Road diagnostics 68: allowlisted context only; no raw messages, form values, URLs or stack traces. */
(() => {
  'use strict';
  if (window.RRDiagnostics) return;
  const VERSION = '68-diagnostics';
  const knownCodes = new Set(['permission-denied','unavailable','deadline-exceeded','network-request-failed','failed-precondition','resource-exhausted','aborted','not-found','invalid-argument','unauthenticated','invalid-credential','too-many-requests','requires-recent-login','email-already-in-use','weak-password','conflict','validation','session-changed']);
  for(const code of ["email-not-verified","quota-exceeded","invalid-email","user-disabled","user-token-expired","invalid-user-token","operation-not-allowed","unauthorized-domain","invalid-continue-uri","missing-continue-uri","unauthorized-continue-uri","expired-action-code","invalid-action-code","wrong-password","user-not-found","popup-blocked","timeout"])knownCodes.add(code);
  const kinds = new Set(['Error','TypeError','ReferenceError','SyntaxError','RangeError','URIError']);
  const operations = new Set(['runtime','promise','resource','portal','kiosk','enrollment','waiver','billing-load','directory-load','trial-load','attendance-load','waiver-load','auth-persistence']);
  for(const op of ["sign-in","password-reset","email-verification-required","email-verification-send","email-verification-check","developer-load","member-save","payment-save"])operations.add(op);
  const pages = new Set(['owner.html','members.html','kiosk.html','enroll.html','waiver.html','index.html','visit.html','checkin.html','activate.html','developer.html']);
  pages.add('family.html');
  const files = new Set(["developer.js", "dev-metrics.js", "weekly-updates.js", "account-nav.js", "admin-alerts.js", "analytics.js", "attendance-month.js", "billing-model.js", "billing-report.js", "billing-store.js", "billing-ui.js", "checkin.js", "class-schedule.js", "dashboard-sections.js", "diagnostics.js", "email-setup.js", "enroll-prod14.js", "enroll.js", "experience.js", "firebase-auth-client.js", "firebase-client.js", "firebase-config.js", "firebase-kiosk-client.js", "kiosk.js", "launch-config.js", "member-button.js", "mobile-nav.js", "paid-date.js", "portal.js", "quick-paid.js", "rank-model.js", "top-attendance.js", "ui-utils.js", "waiver-pdf.js", "waiver-prod14.js", "waiver.js"]);
  for(const file of ["email-verification.js","diagnostics-transport.js","family.js","family-store.js","family-admin.js"])files.add(file);
  for(const file of ["analytics.js", "assets/apple-touch-icon.png", "assets/built-on-the-mats-training-r67.webp", "assets/bullyproof-kids-new-gym-r67.webp", "assets/bullyproof-program.jpg", "assets/bullyproof-training-background-r67.webp", "assets/carlson-quote.png", "assets/crest-header-r67.webp", "assets/favicon-64.png", "assets/hero-mobile-r67.webp", "assets/jeff-clint-belt-promotion.jpg", "assets/meet-the-coaches-2026-r67.webp", "assets/opening-day.jpg", "assets/red-road-check-in-qr.png", "assets/red-road-master-crest-r67.webp", "assets/red-road-master-crest.webp", "attendance-month.css", "billing.css", "checkin.js", "contact-jeff.js", "dashboard-sections.css", "dashboard-sections.js", "developer.css", "developer.js", "diagnostics.css", "diagnostics.js", "email-setup.js", "enroll-prod14.js", "experience.css", "experience.js", "family.css", "family.js", "kiosk.js", "mobile-nav.js", "owner-glance.css", "owner-glance.js", "paid-date.css", "portal.js", "premium.css", "privacy.css", "prod14.css", "public-polish.css", "redroad-v25.css", "waiver-prod14.js"])files.add(file);
  for(const file of ["enrollment-flow.js","contact-jeff.js","family-admin.js","family-store.js","firebase-sdk","google-fonts","analytics-service","external-resource","unlisted-site-resource"])files.add(file);
  knownCodes.add("resource-load-failed");
  for(const op of ["sign-out","navigation-load","updates-load","checkin-access","waiver-print","waiver-save"])operations.add(op);
  const reportedObjects = new WeakSet();
  let local = [], uid = null, sdk = null, admin = false, generation = 0, busy = false;
  let attempts = 0, lastAttempt = new Map(), cloudRows = [], reportingTransport = null;
  const pendingUploads = new Set();
  const pageName = location.pathname.split('/').pop() || 'index.html';
  const page = pages.has(pageName) ? pageName : 'public';
  const ua = navigator.userAgent || '';
  const device = /iPhone|iPad|iPod/.test(ua) ? 'iOS' : /Android/.test(ua) ? 'Android' : 'Desktop';
  const browser = /SamsungBrowser\//.test(ua) ? 'Samsung Internet' : /Edg(?:A|iOS)?\//.test(ua) ? 'Edge' : /Chrome|CriOS/.test(ua) ? 'Chrome' : /Firefox|FxiOS/.test(ua) ? 'Firefox' : /Safari/.test(ua) ? 'Safari' : 'Other';
  const panel = () => document.getElementById('diagnostics-card');
  const status = message => { const el=document.getElementById('diagnostics-status'); if(el)el.textContent=message; };
  function slotFor(text) { let h=0; for(const c of text)h=(h*31+c.charCodeAt(0))>>>0; return String(h%10); }
  function safeResource(value) {
    try {
      const url=new URL(value,location.href);
      if(url.origin===location.origin){const path=url.pathname.replace(/^\//,'');return files.has(path)?path:'unlisted-site-resource';}
      if(url.hostname==='www.gstatic.com' && url.pathname.startsWith('/firebasejs/'))return 'firebase-sdk';
      if(['fonts.googleapis.com','fonts.gstatic.com'].includes(url.hostname))return 'google-fonts';
      if(['www.googletagmanager.com','www.google-analytics.com','www.clarity.ms','scripts.clarity.ms'].includes(url.hostname))return 'analytics-service';
      return 'external-resource';
    }catch(_){return '';}
  }
  function report(error, operation='runtime', line=0, context={}) {
    try {
      if(error && (typeof error==='object'||typeof error==='function')){
        if(reportedObjects.has(error))return;
        reportedObjects.add(error);
      }
      let rawCode = typeof error?.code === 'string' ? error.code.split('/').pop() : '';
      if(!rawCode){const message=String(error?.message||'');if(/changed in another session|before saving again/.test(message))rawCode='conflict';else if(/sign.in changed|Session changed|sign in again/i.test(message))rawCode='session-changed';else if(/Choose a valid|Invalid payment date|Choose a billing|Choose a different/.test(message))rawCode='validation';}
      if(operation==='resource')rawCode='resource-load-failed';
      const source=String(error?.stack||'').match(/([a-z-]+\.js)(?:\?[^:\s]*)?:(\d+):\d+/);
      const file=context.resourceUrl?safeResource(context.resourceUrl):(files.has(context.file)?context.file:source && files.has(source[1])?source[1]:'');
      if(!line&&source&&file===source[1])line=Number(source[2]);
      const sessionState = sdk?.auth?.currentUser ? (sdk.auth.currentUser.isAnonymous ? 'anonymous' : sdk.auth.currentUser.emailVerified ? 'verified' : 'unverified') : 'signed-out';
      const entry = {sessionState,code:knownCodes.has(rawCode)?rawCode:'unknown',kind:kinds.has(error?.name)?error.name:'Error',file,operation:operations.has(operation)?operation:'runtime',page,device,browser,version:VERSION,line:Number.isInteger(line)?Math.min(100000,Math.max(0,line)):0,count:1,status:'open'};
      entry.connection=navigator.onLine===false?'offline':'online';
      const browserPatterns={'Samsung Internet':/SamsungBrowser\/(\d+)/,Edge:/Edg(?:A|iOS)?\/(\d+)/,Chrome:/(?:Chrome|CriOS)\/(\d+)/,Firefox:/(?:Firefox|FxiOS)\/(\d+)/,Safari:/Version\/(\d+)/};
      const versionMatch=ua.match(browserPatterns[browser]||/$a/);
      entry.browserMajor=versionMatch?Math.min(999,Number(versionMatch[1])):0;
      entry.viewport=Math.max(0,Math.min(10000,Math.round(window.innerWidth||0)));
      entry.slot=slotFor([entry.code,entry.kind,entry.operation,page,entry.file,entry.line].join('|'));
      const previous=local.find(x=>x.code===entry.code && x.kind===entry.kind && x.operation===entry.operation && x.file===entry.file && x.page===entry.page && x.line===entry.line);
      if(previous)entry.slot=previous.slot;
      if(previous)entry.count=Math.min(9999,previous.count+1);
      if(!previous && local.some(x=>x.slot===entry.slot)){
        const free=Array.from({length:10},(_,i)=>String(i)).find(slot=>!local.some(x=>x.slot===slot));
        if(free!==undefined)entry.slot=free;
      }
      entry.localTime=new Date().toISOString();
      local=local.filter(x=>x.slot!==entry.slot);local.unshift(entry);local=local.slice(0,10);
      void upload(entry);
    } catch (_) { /* Diagnostics must never break the site. */ }
  }
  async function upload(entry) {
    if(!navigator.onLine || attempts>=10 || pendingUploads.has(entry.slot))return;
    const now=Date.now();if(now-(lastAttempt.get(entry.slot)||0)<61000)return;
    pendingUploads.add(entry.slot);lastAttempt.set(entry.slot,now);attempts++;
    const epoch=generation;
    try {
      let client=sdk,reporter=uid;
      if(!client||!reporter){
        reportingTransport ||= import('./diagnostics-transport.js?v=67').then(m=>m.getDiagnosticTransport());
        const isolated=await reportingTransport;client=isolated.sdk;reporter=isolated.uid;
      }
      if(epoch!==generation)return;
      const {slot,localTime,...data}=entry;
      await client.setDoc(client.doc(client.db,'clientDiagnostics',reporter+'_'+slot),{...data,uid:reporter,slot,updatedAt:client.serverTimestamp()});
    }catch(_){/* Reports are best-effort. Never interrupt sign-in or recursively report transport errors. */}
    finally{pendingUploads.delete(entry.slot);}
  }
  function reset(user) {
    const next=user && user.email && !user.isAnonymous ? user.uid : null;
    if(next===uid)return;
    const queued=uid===null ? local : [];
    uid=next;generation++;local=queued;cloudRows=[];admin=false;busy=false;
    // Page-wide reporting limits survive account changes.
    if(panel())panel().hidden=true;
    const link=document.getElementById('staff-diagnostics-link');if(link)link.hidden=true;
    const list=document.getElementById('diagnostics-list');if(list)list.replaceChildren();
  }
  function connect(value) {
    if(sdk)return;sdk=value;
    sdk.onAuthStateChanged(sdk.auth,reset);
  }
  function element(tag,text) {const el=document.createElement(tag);el.textContent=text;return el;}
  function classify(row){
    if(row.operation==='waiver-print')return {level:'Investigate',title:'Waiver saved; print failed',action:'Print a saved waiver',meaning:'The waiver was saved, but the print step failed.',next:'Use Download original record or ask staff for a copy. Investigate printing on the reported browser; do not ask the person to submit a second waiver.'};
    const login=['invalid-credential','wrong-password','user-not-found','invalid-email'].includes(row.code);
    if(login)return {level:'User action',title:'Login rejected',action:row.page==='checkin.html'?'Sign in for check-in':'Sign in to the member portal',meaning:'The login credentials were rejected. This does not identify whether the email or password was wrong, or prove an account is missing.',next:'Ask the person to check the email used for their account and use Forgot password if needed. Investigate further if known-good credentials also fail.'};
    if(row.code==='email-not-verified')return {level:'User action',title:'Email verification required',action:'Open a member account',meaning:'The account signed in but has not completed the email-verification requirement.',next:'Use the verification controls on the members page. This is a member-access step, not a standalone waiver error.'};
    if(row.operation==='resource')return {level:'Investigate',title:'Page file failed to load',action:'Load the page',meaning:row.file?'The browser reported a load failure for '+row.file+'. The event does not reveal an HTTP status or the underlying cause.':'An image, script, stylesheet or other resource failed. This older report did not capture which one.',next:row.file?'Check the named asset and test the affected page on this device/browser. Possible causes include a missing file, interrupted connection or browser blocking.':'The exact cause cannot be recovered from this report. Version 68 records known asset names for future failures.'};
    const actions={'runtime':'Run page code','promise':'Complete a background operation','portal':'Use the member portal','sign-in':'Sign in','sign-out':'Sign out','checkin-access':'Open check-in','attendance-load':'Load attendance','waiver-load':'Load saved waivers','waiver':'Sign or save a waiver','waiver-save':'Save a signed waiver','waiver-print':'Print a saved waiver','billing-load':'Load billing','directory-load':'Load the check-in directory','auth-persistence':'Keep the user signed in','navigation-load':'Load mobile navigation account controls','updates-load':'Load gym updates','email-verification-send':'Send a verification email','email-verification-check':'Check email verification','password-reset':'Reset a password','member-save':'Save a member','payment-save':'Save a payment','enrollment':'Enroll a member','developer-load':'Load the developer dashboard'};
    const advice=explain(row);
    return {level:'Investigate',title:row.code==='unknown'?'Unclassified technical error':row.code.replace(/-/g,' '),action:actions[row.operation]||row.operation,meaning:advice[0],next:advice[1]};
  }
  function explain(row){
    const advice={
      'email-not-verified':['Password sign-in succeeded, but verification is required before access.','Check whether this is an existing approved account affected by the hardening rollout. Confirm the actual account verification status; do not create a duplicate account.'],
      'quota-exceeded':['The service reported a quota limit.','Check Firebase Authentication usage and email-sending limits. Repeated resend clicks will not fix a quota.'],
      'too-many-requests':['The service temporarily limited requests.','Check recent repeat attempts and Firebase abuse limits. Avoid repeated resends.'],
      'invalid-credential':['The supplied login credentials were rejected.','Have the user check the email/password or use password reset. This is not proof the account is missing.'],
      'permission-denied':['The database refused this operation.','Compare the deployed rules with this account role and the submitted record shape. Check for rollout or legacy-record incompatibility.'],
      'network-request-failed':['The request could not reach the service.','Check device connectivity, browser blocking and service status.'],
      'failed-precondition':['A required database or application condition was not met.','Check Firebase indexes and the operation shown above.'],
      'conflict':['The record changed during editing.','Refresh the record before retrying; do not overwrite another staff edit.'],
      'session-changed':['The signed-in account changed during the operation.','Sign in to the intended account and retry.'],
      'operation-not-allowed':['The requested authentication method is disabled or unavailable.','Check the enabled Firebase Authentication providers.'],
      'unauthorized-domain':['The authentication request used an unauthorized domain.','Check Firebase Authentication authorized domains.'],
      'user-disabled':['Authentication reported a disabled account.','Review that account in Firebase Authentication.'],
      'user-token-expired':['The authentication session expired.','Sign out and sign in again.'],
      'invalid-action-code':['The email link is invalid or has already been used.','Check account status first; request a fresh link only if still needed.'],
      'expired-action-code':['The email link expired.','Request a fresh verification or reset email.']
    };
    return advice[row.code]||['The '+row.operation+' step reported '+row.code+'.','Use the page, source file and operation above to reproduce it. No password, raw form data or message text is collected.'];
  }
  function render() {
    const list=document.getElementById('diagnostics-list');if(!list)return;
    const open = new Set([...list.querySelectorAll('details[open]')].map(x=>x.dataset.id));
    list.replaceChildren();
    const showResolved=document.getElementById('diagnostics-resolved').checked;
    const deviceFilter=document.getElementById('diagnostics-device')?.value||'all';
    const levelFilter=document.getElementById('diagnostics-level')?.value||'all';
    const filtered=cloudRows.filter(x=>(showResolved||x.status!=='resolved')&&(deviceFilter==='all'||x.device===deviceFilter)&&(levelFilter==='all'||classify(x).level===levelFilter));
    const active=cloudRows.filter(x=>x.status!=='resolved');
    const technical=active.filter(x=>classify(x).level==='Investigate').length;
    const overview=document.getElementById('diagnostics-overview');
    if(overview)overview.textContent=`${technical} technical reports to investigate · ${active.length-technical} login/access reports needing user action · ${active.filter(x=>x.device==='Android').length} Android reports. Report counts are not unique people or confirmed bugs.`;
    for(const row of filtered) {
      const details=element('details','');details.dataset.id=row.id;details.open=open.has(row.id);
      const finding=classify(row);
      details.append(element('summary',`${row.status==='resolved'?'Resolved':finding.level} · ${finding.title} · ${row.device} / ${row.browser}`));
      details.append(element('p','Trying to: '+finding.action+'.'));
      let time='Unknown time';try {time=row.updatedAt?.toDate().toLocaleString()||time;}catch(_){}
      details.append(element('p',`${row.page} · ${row.device} / ${row.browser} · ${row.version} · ${time}`));
      details.append(element('p',`Technical detail: ${row.code} · ${row.operation}${row.file?' · '+row.file:''}${row.line?' · line '+row.line:''}. ${row.count} occurrence(s) recorded in the last reported page session.`));
      details.append(element('p',`Browser major: ${row.browserMajor||'not recorded'} · Screen width: ${row.viewport?row.viewport+' CSS px':'not recorded'} · Connection reported by browser: ${row.connection||'not recorded'}. Online does not guarantee service connectivity.`));
      const guidance=[finding.meaning,finding.next];
      details.append(element('p','Session: '+(row.sessionState||'not recorded by older version')+'.'));
      details.append(element('p','Meaning: '+guidance[0]));
      details.append(element('p','Next check: '+guidance[1]));
      if(row.version!=='68-diagnostics')details.append(element('p','Legacy report: may be duplicated or broadly labeled. New reporting cannot reconstruct missing past details.'));
      details.append(element('p','Mark resolved after checking; a new report reopens this slot. Reporting is best-effort, not a complete history.'));
      const button=element('button',row.status==='resolved'?'Reopen':'Mark resolved');button.type='button';
      button.addEventListener('click',async()=>{
        if(!admin||busy)return;button.disabled=true;const epoch=generation;
        try {const next=row.status==='resolved'?'open':'resolved';await sdk.setDoc(sdk.doc(sdk.db,'clientDiagnostics',row.id),{status:next},{merge:true});if(epoch!==generation||!admin)return;row.status=next;render();status('Status saved. New reports reopen recurring errors.');}
        catch(_){if(epoch===generation)status('Could not save status. Check your connection and developer permissions.');}
        finally {button.disabled=false;}
      });details.append(button);list.append(details);
    }
    if(!filtered.length)list.append(element('p','No matching reports received. This does not prove every user is error-free.'));
    const authRows=cloudRows.filter(x=>x.status!=='resolved'&&(x.operation.startsWith('email-verification')||x.operation==='sign-in'||['quota-exceeded','too-many-requests','email-not-verified'].includes(x.code)));
    const tile=document.getElementById('auth-errors-tile');
    if(tile){tile.querySelector('strong').textContent=String(authRows.length)+' open reports';tile.querySelector('small').textContent='Reported login / verification problems; delivery itself is not confirmed.';tile.className='tile '+(authRows.length?'warn':'');}
    const total=cloudRows.filter(x=>x.status!=='resolved').length;
    document.getElementById('diagnostics-count').textContent=`${filtered.length} shown · ${total} open · ${cloudRows.length} loaded`;
  }
  async function refresh() {
    if(!admin||!sdk||busy)return;busy=true;const epoch=generation;status('Loading latest reports…');
    try {
      const result=await sdk.getDocsFromServer(sdk.query(sdk.collection(sdk.db,'clientDiagnostics'),sdk.orderBy('updatedAt','desc'),sdk.limit(100)));
      if(epoch!==generation||!admin)return;
      cloudRows=result.docs.map(s=>({id:s.id,...s.data()}));render();status('Latest 100 reports loaded. Signed-out and unverified failures can report with patch 67 rules. Offline, blocked-script and reporting-service failures may be missing.');
    } catch(_){if(epoch===generation)status('Reports could not load. Deploy the supplied rules and verify developer access, then retry.');}
    finally {if(epoch===generation)busy=false;}
  }
  function showAdmin(enabled) {
    admin=enabled===true;
    if(panel())panel().hidden=!admin;
    const link=document.getElementById('staff-diagnostics-link');if(link)link.hidden=!admin;
    if(!admin){generation++;cloudRows=[];const list=document.getElementById('diagnostics-list');if(list)list.replaceChildren();return;}
    if(!document.getElementById('diagnostics-filters') && panel()){
      const overview=element('p','');overview.id='diagnostics-overview';overview.setAttribute('role','status');
      const filters=element('div','');filters.id='diagnostics-filters';
      for(const [id,label,options] of [['diagnostics-device','Device',['all','Android','iOS','Desktop']],['diagnostics-level','Report type',['all','Investigate','User action']]]){
        const wrapper=element('label',label),select=element('select','');select.id=id;
        for(const value of options){const option=element('option',value==='all'?'All':value);option.value=value;select.append(option);}
        select.addEventListener('change',render);wrapper.append(select);filters.append(wrapper);
      }
      const list=document.getElementById('diagnostics-list');list.before(overview,filters);
    }
    const refreshButton=document.getElementById('diagnostics-refresh');
    if(refreshButton&&!refreshButton.dataset.bound){
      refreshButton.dataset.bound='true';refreshButton.addEventListener('click',refresh);
      document.getElementById('diagnostics-resolved').addEventListener('change',render);
      document.getElementById('diagnostics-export').addEventListener('click',()=>{
        if(!admin)return;
        const data=cloudRows.map(({id,uid,...row})=>({...row,explanation:classify(row)}));
        const url=URL.createObjectURL(new Blob([JSON.stringify({version:VERSION,coverage:'Latest 100 report slots; maximum 10 per reporting identity. Counts are per page session, not unique users or a complete history. Old reports may be duplicated. Raw messages, full URLs and member data excluded.',reports:data,local:local.map(row=>({...row,explanation:classify(row)}))},null,2)],{type:'application/json'}));
        const a=document.createElement('a');a.href=url;a.download='redroad-diagnostics.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
      });
    }
    status('Select Refresh errors to load reports.');
  }
  window.addEventListener('online',()=>{for(const entry of local)void upload(entry);});
  window.RRDiagnostics=Object.freeze({report,connect,showAdmin,snapshot:()=>local.map(x=>({...x}))});
  window.addEventListener('error',event=>{
    if(event.target!==window){
      const target=event.target;
      report(null,'resource',0,{resourceUrl:target?.currentSrc||target?.src||target?.href||''});
    }
    else report(event.error,'runtime',event.lineno,{file:event.filename?safeResource(event.filename):''});
  },true);
  window.addEventListener('unhandledrejection',event=>report(event.reason,'promise'));
})();
