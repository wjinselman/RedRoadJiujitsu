/* Red Road diagnostics 54: no raw messages, form values, URLs or stack traces. */
(() => {
  'use strict';
  if (window.RRDiagnostics) return;
  const VERSION = '56-dev-console';
  const knownCodes = new Set(['permission-denied','unavailable','deadline-exceeded','network-request-failed','failed-precondition','resource-exhausted','aborted','not-found','invalid-argument','unauthenticated','invalid-credential','too-many-requests','requires-recent-login','email-already-in-use','weak-password','conflict','validation','session-changed']);
  const kinds = new Set(['Error','TypeError','ReferenceError','SyntaxError','RangeError','URIError']);
  const operations = new Set(['runtime','promise','resource','portal','kiosk','enrollment','waiver','billing-load','directory-load','trial-load','attendance-load','waiver-load','auth-persistence']);
  const pages = new Set(['owner.html','members.html','kiosk.html','enroll.html','waiver.html','index.html','visit.html','checkin.html','activate.html','developer.html']);
  const files = new Set(["developer.js", "dev-metrics.js", "weekly-updates.js", "account-nav.js", "admin-alerts.js", "analytics.js", "attendance-month.js", "billing-model.js", "billing-report.js", "billing-store.js", "billing-ui.js", "checkin.js", "class-schedule.js", "dashboard-sections.js", "diagnostics.js", "email-setup.js", "enroll-prod14.js", "enroll.js", "experience.js", "firebase-auth-client.js", "firebase-client.js", "firebase-config.js", "firebase-kiosk-client.js", "kiosk.js", "launch-config.js", "member-button.js", "mobile-nav.js", "paid-date.js", "portal.js", "quick-paid.js", "rank-model.js", "top-attendance.js", "ui-utils.js", "waiver-pdf.js", "waiver-prod14.js", "waiver.js"]);
  let local = [], uid = null, sdk = null, admin = false, generation = 0, busy = false;
  let attempts = 0, lastAttempt = new Map(), cloudRows = [];
  const pageName = location.pathname.split('/').pop() || 'index.html';
  const page = pages.has(pageName) ? pageName : 'public';
  const ua = navigator.userAgent || '';
  const device = /iPhone|iPad|iPod/.test(ua) ? 'iOS' : /Android/.test(ua) ? 'Android' : 'Desktop';
  const browser = /Edg\//.test(ua) ? 'Edge' : /Chrome|CriOS/.test(ua) ? 'Chrome' : /Firefox|FxiOS/.test(ua) ? 'Firefox' : /Safari/.test(ua) ? 'Safari' : 'Other';
  const panel = () => document.getElementById('diagnostics-card');
  const status = message => { const el=document.getElementById('diagnostics-status'); if(el)el.textContent=message; };
  function slotFor(text) { let h=0; for(const c of text)h=(h*31+c.charCodeAt(0))>>>0; return String(h%10); }
  function report(error, operation='runtime', line=0) {
    try {
      let rawCode = typeof error?.code === 'string' ? error.code.split('/').pop() : '';
      if(!rawCode){const message=String(error?.message||'');if(/changed in another session|before saving again/.test(message))rawCode='conflict';else if(/sign.in changed|Session changed|sign in again/i.test(message))rawCode='session-changed';else if(/Choose a valid|Invalid payment date|Choose a billing|Choose a different/.test(message))rawCode='validation';}
      const source=String(error?.stack||'').match(/([a-z-]+\.js)(?:\?[^:\s]*)?:(\d+):\d+/);
      const file=source && files.has(source[1])?source[1]:'';
      if(!line&&file)line=Number(source[2]);
      const entry = {code:knownCodes.has(rawCode)?rawCode:'unknown',kind:kinds.has(error?.name)?error.name:'Error',file,operation:operations.has(operation)?operation:'runtime',page,device,browser,version:VERSION,line:Number.isInteger(line)?Math.min(100000,Math.max(0,line)):0,count:1,status:'open'};
      entry.slot=slotFor([entry.code,entry.kind,entry.operation,page,entry.file,entry.line].join('|'));
      const previous=local.find(x=>x.slot===entry.slot && x.code===entry.code && x.kind===entry.kind && x.operation===entry.operation && x.line===entry.line);
      if(previous)entry.count=Math.min(9999,previous.count+1);
      entry.localTime=new Date().toISOString();
      local=local.filter(x=>x.slot!==entry.slot);local.unshift(entry);local=local.slice(0,10);
      void upload(entry);
    } catch (_) { /* Diagnostics must never break the site. */ }
  }
  async function upload(entry) {
    if(!sdk || !uid || !navigator.onLine || attempts>=10) return;
    const now=Date.now(); if(now-(lastAttempt.get(entry.slot)||0)<61000)return;
    lastAttempt.set(entry.slot,now);attempts++;
    const {slot,localTime,...data}=entry;
    try { await sdk.setDoc(sdk.doc(sdk.db,'clientDiagnostics',uid+'_'+slot),{...data,uid,slot,updatedAt:sdk.serverTimestamp()}); }
    catch (_) { /* No recursive reports or automatic write retry. */ }
  }
  function reset(user) {
    const next=user && user.email && !user.isAnonymous && user.emailVerified ? user.uid : null;
    if(next===uid)return;
    uid=next;generation++;local=[];cloudRows=[];admin=false;busy=false;attempts=0;lastAttempt=new Map();
    if(panel())panel().hidden=true;
    const link=document.getElementById('staff-diagnostics-link');if(link)link.hidden=true;
    const list=document.getElementById('diagnostics-list');if(list)list.replaceChildren();
  }
  function connect(value) {
    if(sdk)return;sdk=value;
    sdk.onAuthStateChanged(sdk.auth,reset);
  }
  function element(tag,text) {const el=document.createElement(tag);el.textContent=text;return el;}
  function render() {
    const list=document.getElementById('diagnostics-list');if(!list)return;
    const open = new Set([...list.querySelectorAll('details[open]')].map(x=>x.dataset.id));
    list.replaceChildren();
    const showResolved=document.getElementById('diagnostics-resolved').checked;
    const filtered=cloudRows.filter(x=>showResolved||x.status!=='resolved');
    for(const row of filtered) {
      const details=element('details','');details.dataset.id=row.id;details.open=open.has(row.id);
      details.append(element('summary',`${row.status==='resolved'?'Resolved':'Open'} · ${row.operation} · ${row.code} · ${row.count}×`));
      let time='Unknown time';try {time=row.updatedAt?.toDate().toLocaleString()||time;}catch(_){}
      details.append(element('p',`${row.page} · ${row.device} / ${row.browser} · ${row.version} · ${time}`));
      details.append(element('p',`${row.kind}${row.file?' · '+row.file:''}${row.line?' · line '+row.line:''}. Messages and member details are intentionally excluded.`));
      const button=element('button',row.status==='resolved'?'Reopen':'Mark resolved');button.type='button';
      button.addEventListener('click',async()=>{
        if(!admin||busy)return;button.disabled=true;const epoch=generation;
        try {const next=row.status==='resolved'?'open':'resolved';await sdk.setDoc(sdk.doc(sdk.db,'clientDiagnostics',row.id),{status:next},{merge:true});if(epoch!==generation||!admin)return;row.status=next;render();status('Status saved. New reports reopen recurring errors.');}
        catch(_){if(epoch===generation)status('Could not save status. Check your connection and developer permissions.');}
        finally {button.disabled=false;}
      });details.append(button);list.append(details);
    }
    if(!filtered.length)list.append(element('p','No matching errors in the loaded reports.'));
    const total=cloudRows.filter(x=>x.status!=='resolved').length;
    document.getElementById('diagnostics-count').textContent=`${total} open · ${cloudRows.length} loaded`;
  }
  async function refresh() {
    if(!admin||!sdk||busy)return;busy=true;const epoch=generation;status('Loading latest reports…');
    try {
      const result=await sdk.getDocsFromServer(sdk.query(sdk.collection(sdk.db,'clientDiagnostics'),sdk.orderBy('updatedAt','desc'),sdk.limit(100)));
      if(epoch!==generation||!admin)return;
      cloudRows=result.docs.map(s=>({id:s.id,...s.data()}));render();status('Latest 100 reports maximum. Refresh is manual; no background polling.');
    } catch(_){if(epoch===generation)status('Reports could not load. Deploy the supplied rules and verify developer access, then retry.');}
    finally {if(epoch===generation)busy=false;}
  }
  function showAdmin(enabled) {
    admin=enabled===true;
    if(panel())panel().hidden=!admin;
    const link=document.getElementById('staff-diagnostics-link');if(link)link.hidden=!admin;
    if(!admin){generation++;cloudRows=[];const list=document.getElementById('diagnostics-list');if(list)list.replaceChildren();return;}
    const refreshButton=document.getElementById('diagnostics-refresh');
    if(refreshButton&&!refreshButton.dataset.bound){
      refreshButton.dataset.bound='true';refreshButton.addEventListener('click',refresh);
      document.getElementById('diagnostics-resolved').addEventListener('change',render);
      document.getElementById('diagnostics-export').addEventListener('click',()=>{
        if(!admin)return;
        const data=cloudRows.map(({id,uid,...row})=>row);
        const url=URL.createObjectURL(new Blob([JSON.stringify({version:VERSION,reports:data,local},null,2)],{type:'application/json'}));
        const a=document.createElement('a');a.href=url;a.download='redroad-diagnostics.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
      });
    }
    status('Select Refresh errors to load reports.');
  }
  window.RRDiagnostics=Object.freeze({report,connect,showAdmin,snapshot:()=>local.map(x=>({...x}))});
  window.addEventListener('error',event=>{
    if(event.target!==window)report(null,'resource');
    else report(event.error,'runtime',event.lineno);
  },true);
  window.addEventListener('unhandledrejection',event=>report(event.reason,'promise'));
})();
