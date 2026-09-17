import {previousMonth,summarizeExpected,renderReport} from './billing-report.js?v=1';
import {BILLING_CATEGORIES,money,gymDate,defaultCategory,exempt,summarizePayments,status} from './billing-model.js?v=1';

import {profiles,billingReady,memberBilling,paymentsForMonth,loadBillingProfiles} from './billing-store.js?v=1';

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
  let cursor;const members=[];
  for(;;){
    const page=await getDocsFromServer(query(collection(db,'members'),...(cursor?[startAfter(cursor)]:[]),limit(250)));
    page.docs.forEach(s=>members.push({...s.data(),email:s.id}));
    if(page.docs.length<250)break;cursor=page.docs.at(-1);
  }
  return summarizeExpected(members,profiles);
}
export function setupBillingReport(canManage){
  const panel=document.querySelector('#staff-billing');if(!panel)return;
  panel.hidden=!canManage;document.querySelector('#staff-billing-link').hidden=!canManage;invalidateReport();
  const month=document.querySelector('#billing-month');month.value=gymDate().slice(0,7);
  month.onchange=invalidateReport;
  document.querySelector('#billing-load').onclick=async()=>{
    if(!canManage)return;
    const version=++reportVersion,selected=month.value,today=gymDate();
    const message=document.querySelector('#billing-report-status'),button=document.querySelector('#billing-load');
    printMarkup='';document.querySelector('#billing-print').disabled=true;document.querySelector('#billing-report-results').replaceChildren();
    button.disabled=true;message.textContent='Loading dues and manually recorded payments…';
    try{
      const previous=previousMonth(selected);
      await loadBillingProfiles();
      if(version!==reportVersion)return;
      const [rows,previousRows,expected]=await Promise.all([paymentsForMonth(selected),paymentsForMonth(previous),expectedDues()]);
      if(version!==reportVersion)return;
      rows.sort((a,b)=>a.paidOn.localeCompare(b.paidOn)||a.payerName.localeCompare(b.payerName));
      const data={selected,previous,rows,previousRows,expected,today};
      document.querySelector('#billing-report-results').innerHTML=renderReport(data);
      printMarkup='<h1>Red Road — Monthly Dues</h1>'+renderReport(data,true);
      message.textContent='Report ready. Expected dues are shown first.';
      document.querySelector('#billing-print').disabled=false;
    }catch(error){if(version===reportVersion)message.textContent='Report could not load. '+(error.message||'Try again.');}
    finally{button.disabled=false;}
  };
  document.querySelector('#billing-print').onclick=()=>{
    if(!printMarkup)return;
    const frame=document.createElement('iframe');frame.title='Printable monthly dues report';frame.style.cssText='position:fixed;width:1px;height:1px;bottom:0;border:0';
    frame.onload=()=>{frame.contentWindow.addEventListener('afterprint',()=>frame.remove(),{once:true});frame.contentWindow.focus();frame.contentWindow.print();};
    frame.srcdoc='<!doctype html><html><head><meta charset="utf-8"><title>Red Road Monthly Dues</title><style>body{font:12px Arial;color:#111;padding:20px}h1{font-size:22px}h3{font-size:16px;margin:20px 0 8px}p{line-height:1.45}table{border-collapse:collapse;width:100%;margin:12px 0}td,th{padding:7px;border:1px solid #bbb;text-align:left;overflow-wrap:anywhere}thead{display:table-header-group}tr,.billing-metrics,.billing-comparison{break-inside:avoid}.billing-metrics{display:flex;gap:14px}.billing-metric{flex:1;padding:14px;border:1px solid #aaa}.billing-metric>span,.billing-metric>strong{display:block}.billing-metric>strong{font-size:26px;margin:8px 0}.billing-footnote,.billing-report-head p{color:#444;font-size:11px}.billing-bar-heading{display:flex;justify-content:space-between;margin:12px 0 5px}.billing-bar-heading small{margin-left:6px}.billing-bar-track{height:13px;background:#eee;border:1px solid #aaa}.billing-bar{height:100%;background:#a60c20;print-color-adjust:exact;-webkit-print-color-adjust:exact}.billing-bar.previous{background:#777}.billing-email{display:block;font-weight:normal;font-size:10px}.billing-exempt-list{list-style:none;padding:0}.billing-exempt-list li{display:flex;gap:12px;border-bottom:1px solid #ccc;padding:6px}.billing-exempt-list li span:first-child{flex:1}.billing-sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0)}@page{margin:14mm}</style></head><body>'+printMarkup+'</body></html>';
    document.body.append(frame);
  };
}
