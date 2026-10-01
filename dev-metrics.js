import {status,exempt,BILLING_CATEGORIES,defaultCategory,gymDate} from './billing-model.js?v=54-member-nav';
export const dayBefore=(date,n)=>{const d=new Date(date+'T12:00:00Z');d.setUTCDate(d.getUTCDate()-n);return d.toISOString().slice(0,10);};
export function summarize({members=[],billing=[],attendance=[],payments=[],trials=[]},today=gymDate()) {
 const roster=members.filter(m=>!m.archived),active=roster.filter(m=>m.active),profiles=new Map(billing.map(p=>[p.id,p]));
 const recent=attendance.filter(a=>a.source!=='developer-test'&&a.classDate<=today),cut30=dayBefore(today,29),cut60=dayBefore(today,59);
 const current=recent.filter(a=>a.classDate>=cut30),previous=recent.filter(a=>a.classDate>=cut60&&a.classDate<cut30);
 const last=new Map();for(const a of recent)if(a.classDate>(last.get(a.memberEmail)||''))last.set(a.memberEmail,a.classDate);
 const due=[],locked=[],unpaidVisits=[],quality=[],missing=[],atRisk=[];let dueCents=0;
 for(const m of roster){
  const p=profiles.get(m.email),payer=profiles.get(p?.payerEmail),paid=status(m,p,payer,today).current;
  if(m.active&&!paid&&!exempt(m)){due.push(m);if(p?.category!=='family-covered')dueCents+=(BILLING_CATEGORIES[p?.category||defaultCategory(m)]?.cents||0);}
  if(paid&&(!m.enabled||!m.active))locked.push(m);
  if(!paid&&current.some(a=>a.memberEmail===m.email))unpaidVisits.push(m);
  if(!m.waiverSigned&&!m.waiverExemption?.exempt)missing.push(m);
  for(const [condition,issue]of [[!m.email,'Missing email'],[!m.phone,'Missing phone'],[!m.plan,'Missing program'],[p?.category==='family-covered'&&(!payer||payer.category!=='family-payer'),'Invalid family payer'],[m.id&&m.email!==m.id,'Email / record ID mismatch']])if(condition)quality.push({name:m.name||m.email,issue});
  if(m.active){const latest=last.get(m.email),joined=m.joinedAt||'',since=latest||joined;if((since&&since<=dayBefore(today,14))||!since)atRisk.push({name:m.name||m.email,last:latest||'None in loaded window',band:!since?'Unknown join date':since<=dayBefore(today,30)?'30+ days':'14–29 days'});}
 }
 for(const a of recent)if(!members.some(m=>m.email===a.memberEmail))quality.push({name:'Attendance record',issue:'No matching member: '+a.id});
 const names=new Map();for(const m of roster){const key=(m.name||'').trim().toLowerCase();if(key){if(names.has(key))quality.push({name:m.name,issue:'Possible duplicate name — review, not proof'});names.set(key,true);}}
 const week=Array.from({length:7},(_,i)=>{const date=dayBefore(today,6-i);return {date,count:current.filter(a=>a.classDate===date).length}});
 const newCurrent=roster.filter(m=>m.joinedAt>=cut30&&m.joinedAt<=today).length,newPrevious=roster.filter(m=>m.joinedAt>=cut60&&m.joinedAt<cut30).length;
 const collected=payments.filter(p=>p.paidOn>=cut30&&p.paidOn<=today).reduce((s,p)=>s+(Number(p.amountCents)||0),0);
 const collectedPrevious=payments.filter(p=>p.paidOn>=cut60&&p.paidOn<cut30).reduce((s,p)=>s+(Number(p.amountCents)||0),0);
 const cohorts=[...new Set(roster.map(m=>(m.joinedAt||'').slice(0,7)).filter(Boolean))].sort().reverse().slice(0,6).map(month=>{const rows=members.filter(m=>(m.joinedAt||'').startsWith(month));return {month,total:rows.length,active:rows.filter(m=>m.active&&!m.archived).length}});
 const trialEmails=new Set(trials.map(t=>(t.email||'').toLowerCase()).filter(Boolean));
 const converted=[...trialEmails].filter(e=>members.some(m=>m.email===e));
 return {roster,active,due,dueCents,locked,unpaidVisits,quality,missing,atRisk,week,current:current.length,previous:previous.length,newCurrent,newPrevious,collected,collectedPrevious,cohorts,trialCount:trialEmails.size,converted:converted.length,exempt:roster.filter(m=>m.waiverExemption?.exempt).length};
}
