import {BILLING_CATEGORIES,money,gymDate,defaultCategory,exempt,summarizePayments,status} from './billing-model.js?v=1';
import {profiles,billingReady,memberBilling,paymentsForMonth} from './billing-store.js?v=1';
import {db,collection,query,limit,startAfter,getDocsFromServer} from './firebase-client.js?v=52';
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let reportVersion=0,printMarkup='';
export function fillBillingForm(form,member,roster){
  const profile=profiles.get(member.email),category=profile?.category||defaultCategory(member);
  const select=form.elements.billingCategory,payer=form.elements.familyPayer;
  select.innerHTML=Object.entries(BILLING_CATEGORIES).map(([key,value])=>`<option value="${key}">${escape(value.label)} — ${money(value.cents)}</option>`).join('');
  select.value=category;
  payer.innerHTML='<option value="">Select the family payer</option>'+[...profiles.entries()].filter(([email,p])=>p.category==='family-payer'&&email!==member.email).map(([email])=>{
    const person=roster.find(x=>x.email===email);
    return `<option value="${escape(email)}">${escape(person?.name||email)} (${escape(email)})</option>`;
  }).join('');
  payer.value=profile?.payerEmail||'';
  form.elements.paid.checked=memberBilling(member).current;
  const hint=form.querySelector('[data-billing-help]');
  const update=()=>{
    const covered=select.value==='family-covered';
    payer.closest('[data-family-payer]').hidden=!covered;
    payer.required=covered;select.disabled=!billingReady;payer.disabled=!billingReady||!covered;
    form.elements.paid.disabled=!billingReady||covered;
    const isExempt=form.elements.coachAccess.checked||form.elements.paymentExempt.checked;
    if(covered){
      const p=profiles.get(payer.value);
      const state=status({}, {category:'family-covered'},p);
      form.elements.paid.checked=state.current;
      hint.textContent='Covered by the selected family payer. $0 is added for this member. '+(state.paidThrough?'Paid through '+state.paidThrough+'; next due '+state.nextDue+'.':'Payment dates come from the payer.');
    }else{
      const state=memberBilling(member);
      hint.textContent=!billingReady?'Billing unavailable. Refresh the roster before changing payments.':isExempt?'Dues exempt: no payment will be recorded.':
        `${money(BILLING_CATEGORIES[select.value].cents)} per payment. Checking Paid and saving an unpaid account records one payment for one calendar month. `+
        (state.paidThrough?`Paid through ${state.paidThrough}; next due ${state.nextDue}.`:'Existing paid status without a date is preserved until you uncheck, save, then check and save.');
    }
  };
  // Replace form-specific handlers each time Edit opens; never stack listeners.
  select.onchange=()=>{if(select.value!=='family-covered')form.elements.paid.checked=false;update();};
  payer.onchange=update;
  form.elements.coachAccess.onchange=update;
  form.elements.paymentExempt.onchange=update;
  if(!member.email)form.elements.plan.onchange=()=>{select.value=defaultCategory({plan:form.elements.plan.value});update();};
  update();
}
export function billingIntent(form){
  if(!billingReady)throw Error('Billing unavailable. Publish the billing rules and refresh the roster before saving.');
  return {category:form.elements.billingCategory.value,payerEmail:form.elements.familyPayer.value,wantsPaid:form.elements.paid.checked};
}
export function billingText(member){
  const s=memberBilling(member),p=profiles.get(member.email);
  return s.label+(s.paidThrough?' · Through '+s.paidThrough+' · Due '+s.nextDue:'')+(p?.category==='family-covered'?' · '+p.payerEmail:'');
}
export function invalidateReport(){
  ++reportVersion;printMarkup='';
  const print=document.querySelector('#billing-print');if(print)print.disabled=true;
  const result=document.querySelector('#billing-report-results');if(result)result.replaceChildren();
  const message=document.querySelector('#billing-report-status');if(message)message.textContent='Choose a month and load the report.';
}
async function expectedDues(){
  let cursor,total=0,count=0;const totals={};
  for(;;){
    const page=await getDocsFromServer(query(collection(db,'members'),...(cursor?[startAfter(cursor)]:[]),limit(250)));
    for(const snap of page.docs){
      const m=snap.data();if(m.active!==true||m.archived===true||exempt(m))continue;
      const cat=profiles.get(snap.id)?.category||defaultCategory(m),amount=BILLING_CATEGORIES[cat]?.cents||0;
      if(amount){total+=amount;count++;totals[cat]=(totals[cat]||0)+amount;}
    }
    if(page.docs.length<250)break;cursor=page.docs.at(-1);
  }
  return {total,count,totals};
}
export function setupBillingReport(canManage){
  const panel=document.querySelector('#staff-billing');if(!panel)return;
  panel.hidden=!canManage;document.querySelector('#staff-billing-link').hidden=!canManage;invalidateReport();
  const month=document.querySelector('#billing-month');month.value=gymDate().slice(0,7);
  month.onchange=invalidateReport;
  document.querySelector('#billing-load').onclick=async()=>{
    if(!canManage)return;
    const version=++reportVersion,selected=month.value;
    const message=document.querySelector('#billing-report-status'),button=document.querySelector('#billing-load');
    printMarkup='';document.querySelector('#billing-print').disabled=true;document.querySelector('#billing-report-results').replaceChildren();
    button.disabled=true;message.textContent='Loading recorded payments and current expected dues…';
    try{
      if(!billingReady)throw Error('Refresh the roster to load billing first.');
      const [rows,expected]=await Promise.all([paymentsForMonth(selected),expectedDues()]);
      if(version!==reportVersion)return;
      rows.sort((a,b)=>a.paidOn.localeCompare(b.paidOn)||a.payerName.localeCompare(b.payerName));
      const summary=summarizePayments(rows);
      const categoryRows=Object.entries(summary.totals).map(([key,value])=>`<tr><td>${escape(BILLING_CATEGORIES[key].label)}</td><td>${money(value)}</td></tr>`).join('');
      const paymentRows=rows.map(r=>`<tr><td>${escape(r.paidOn)}</td><td>${escape(r.payerName)}<br><small>${escape(r.payerEmail)}</small></td><td>${escape(BILLING_CATEGORIES[r.category]?.label||r.category)}</td><td>${escape(r.paidThrough)}</td><td>${money(r.amountCents)}</td></tr>`).join('');
      const expectedRows=Object.entries(expected.totals).map(([key,value])=>`<tr><td>${escape(BILLING_CATEGORIES[key].label)}</td><td>${money(value)}</td></tr>`).join('');
      printMarkup=`<h1>Red Road — Monthly Payments</h1><p>Payments recorded in ${escape(selected)} · Generated ${gymDate()}</p><p>Staff-recorded payments, not a bank reconciliation. Family coverage is counted once under its payer.</p><h2>Recorded payments: ${money(summary.total)}</h2><table><thead><tr><th>Category</th><th>Total</th></tr></thead><tbody>${categoryRows}<tr><th>Total collected</th><th>${money(summary.total)}</th></tr></tbody></table><h2>Payment details</h2><table><thead><tr><th>Recorded</th><th>Payer</th><th>Category</th><th>Paid through</th><th>Amount</th></tr></thead><tbody>${paymentRows||'<tr><td colspan="5">No payments recorded for this month.</td></tr>'}</tbody></table><h2>Current expected monthly dues: ${money(expected.total)}</h2><p>Snapshot of ${expected.count} active billable accounts as of ${gymDate()}. This is not money collected or a historical roster total. Covered members and exempt accounts add $0.</p><table><thead><tr><th>Category</th><th>Expected</th></tr></thead><tbody>${expectedRows}</tbody></table>`;
      document.querySelector('#billing-report-results').innerHTML=printMarkup;
      message.textContent=`${rows.length} payment${rows.length===1?'':'s'} recorded. Existing Paid checkboxes are not counted as past payments.`;
      document.querySelector('#billing-print').disabled=false;
    }catch(error){if(version===reportVersion)message.textContent='Report could not load. '+(error.message||'Try again.');}
    finally{button.disabled=false;}
  };
  document.querySelector('#billing-print').onclick=()=>{
    if(!printMarkup)return;
    const frame=document.createElement('iframe');frame.title='Printable monthly payment report';frame.style.cssText='position:fixed;width:1px;height:1px;bottom:0;border:0';
    frame.onload=()=>{frame.contentWindow.addEventListener('afterprint',()=>frame.remove(),{once:true});frame.contentWindow.focus();frame.contentWindow.print();};
    frame.srcdoc='<!doctype html><html><head><meta charset="utf-8"><title>Red Road Monthly Payments</title><style>body{font:12px Arial;color:#111;padding:20px}h1{font-size:22px}h2{font-size:17px;margin-top:24px}table{border-collapse:collapse;width:100%;margin:12px 0}td,th{padding:7px;border:1px solid #bbb;text-align:left;overflow-wrap:anywhere}thead{display:table-header-group}tr{break-inside:avoid}small{font-size:10px}@page{margin:14mm}</style></head><body>'+printMarkup+'</body></html>';
    document.body.append(frame);
  };
}
