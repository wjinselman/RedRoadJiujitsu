export const BILLING_CATEGORIES = {
  adult:{label:'Adult',cents:13500}, kids:{label:'Kids',cents:9000}, service:{label:'First Responder / LEO / Military',cents:10000},
  'family-payer':{label:'Family Plan — Payer',cents:30000}, 'family-covered':{label:'Family Plan — Covered Member',cents:0}
};
export const money = cents => new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(cents/100);
export function gymDate(now = new Date()) {
  const p=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:'America/Chicago',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now).map(x=>[x.type,x.value]));
  return `${p.year}-${p.month}-${p.day}`;
}
export function paymentPeriod(start) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start)) throw Error('Invalid payment date.');
  const [y,m,d]=start.split('-').map(Number);
  const next=new Date(Date.UTC(y,m,Math.min(d,new Date(Date.UTC(y,m+1,0)).getUTCDate())));
  const nextDue=next.toISOString().slice(0,10);
  next.setUTCDate(next.getUTCDate()-1);
  return {periodStart:start,paidThrough:next.toISOString().slice(0,10),nextDue};
}
export function defaultCategory(member) {
  const plan=String(member.plan||'').toLowerCase();
  if(plan.includes('kid'))return 'kids';
  if(/military|responder|leo|service/.test(plan))return 'service';
  if(plan.includes('family'))return 'family-payer';
  return 'adult';
}
export const exempt = member => member?.coachAccess===true || member?.paymentExempt===true;
export function status(member, profile, payer, today=gymDate()) {
  if(exempt(member))return {current:true,label:'Payment Exempt',paidThrough:'',nextDue:''};
  if(!profile)return {current:member.paid===true,label:member.paid?'Paid · date not set':'Past Due',paidThrough:'',nextDue:''};
  const covered=profile.category==='family-covered';
  const effective=covered?(payer?.category==='family-payer'?payer:null):profile;
  const current=!!effective?.paid && (!effective.paidThrough || effective.paidThrough>=today);
  const dates={paidThrough:effective?.paidThrough||'',nextDue:effective?.nextDue||''};
  return {current,...dates,label:covered?(current?'Paid through family':'Family payment due'):(current?(dates.paidThrough?'Paid':'Paid · date not set'):'Past Due')};
}
export function planSave({member,oldMember,profile,payer,category,payerEmail,wantsPaid,today=gymDate()}) {
  if(!BILLING_CATEGORIES[category])throw Error('Choose a billing category.');
  const covered=category==='family-covered';
  if(covered && (!payerEmail || payerEmail===member.email || payer?.category!=='family-payer'))throw Error('Choose a different member saved as Family Plan — Payer.');
  const changed=(profile ? profile.category!==category || profile.payerEmail!==(covered?payerEmail:'') : !!oldMember && defaultCategory(oldMember)!==category);
  const wasCurrent=status(oldMember||{paid:false},profile,payer,today).current;
  if(changed && !covered && wantsPaid && wasCurrent && !exempt(member))throw Error('For a billing-category change, uncheck Paid and save first. Then mark Paid to record the new rate.');
  const recordPayment=!covered && !exempt(member) && wantsPaid && !wasCurrent;
  const next={category,payerEmail:covered?payerEmail:'',paid:covered?false:!!wantsPaid,
    paidThrough:changed?'':profile?.paidThrough||'',nextDue:changed?'':profile?.nextDue||'',
    sequence:profile?.sequence||0,revision:(profile?.revision||0)+1};
  let receipt=null;
  if(recordPayment){
    const period=paymentPeriod(today);
    Object.assign(next,{paid:true,paidThrough:period.paidThrough,nextDue:period.nextDue,sequence:next.sequence+1});
    receipt={payerEmail:member.email,payerName:member.name,category,amountCents:BILLING_CATEGORIES[category].cents,paidOn:today,...period,sequence:next.sequence};
  }
  if(covered){next.paid=false;next.paidThrough='';next.nextDue='';}
  return {profile:next,receipt};
}
export function summarizePayments(rows){
  const totals=Object.fromEntries(Object.keys(BILLING_CATEGORIES).filter(k=>k!=='family-covered').map(k=>[k,0]));
  let total=0;
  for(const row of rows){if(Object.hasOwn(totals,row.category)){totals[row.category]+=row.amountCents;total+=row.amountCents;}}
  return {totals,total};
}
