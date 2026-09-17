import {BILLING_CATEGORIES,money,defaultCategory,exempt,summarizePayments} from './billing-model.js?v=1';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function previousMonth(month){
  if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))throw Error('Choose a valid report month.');
  const [y,m]=month.split('-').map(Number);return new Date(Date.UTC(y,m-2,1)).toISOString().slice(0,7);
}
export function monthLabel(month){
  return new Intl.DateTimeFormat('en-US',{month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(month+'-01T12:00:00Z'));
}
export function summarizeExpected(members,profiles){
  const totals={},counts={},nonpaying=[];let total=0,count=0,legacyPaid=0;
  for(const member of members){
    if(member.active!==true||member.archived===true)continue;
    const profile=profiles.get(member.email),category=profile?.category||defaultCategory(member);
    if(exempt(member)||category==='family-covered'){
      nonpaying.push({name:member.name||member.email,reason:exempt(member)?(member.coachAccess?'Coach — exempt':'Payment exempt'):'Covered by '+profile.payerEmail});continue;
    }
    const amount=BILLING_CATEGORIES[category]?.cents||0;
    if(amount){total+=amount;count++;totals[category]=(totals[category]||0)+amount;counts[category]=(counts[category]||0)+1;}
    if(member.paid===true&&!profile?.paidThrough)legacyPaid++;
  }
  return {totals,counts,nonpaying,total,count,legacyPaid};
}
export function renderReport({selected,previous,rows,previousRows,expected,today},print=false){
  const current=summarizePayments(rows),prior=summarizePayments(previousRows);
  const selectedLabel=monthLabel(selected),previousLabel=monthLabel(previous);
  const selectedCurrent=selected===today.slice(0,7);
  const categories=Object.keys(BILLING_CATEGORIES).filter(k=>k!=='family-covered'&&(expected.counts[k]||current.totals[k]));
  const categoryRows=categories.map(k=>`<tr><th scope="row">${esc(BILLING_CATEGORIES[k].label)}</th><td>${expected.counts[k]||0}</td><td>${money(expected.totals[k]||0)}</td><td>${rows.length?money(current.totals[k]||0):'—'}</td></tr>`).join('');
  const scale=Math.max(prior.total,current.total,1);
  const bars=[{label:previousLabel,total:prior.total,has:previousRows.length,kind:'previous',note:'Full month'},
    {label:selectedLabel,total:current.total,has:rows.length,kind:'selected',note:selectedCurrent?'Month to date':'Full month'}]
    .map(x=>`<div class="billing-bar-row"><div class="billing-bar-heading"><span>${esc(x.label)} <small>${x.note}</small></span><strong>${x.has?money(x.total):'No records yet'}</strong></div><div class="billing-bar-track" aria-hidden="true"><div class="billing-bar ${x.kind}" style="width:${x.has?x.total/scale*100:0}%"></div></div></div>`).join('');
  const receipts=rows.map(r=>`<tr><td>${esc(r.paidOn)}</td><th scope="row">${esc(r.payerName)}<small class="billing-email">${esc(r.payerEmail)}</small></th><td>${esc(BILLING_CATEGORIES[r.category]?.label||r.category)}</td><td>${esc(r.paidThrough)}</td><td>${money(r.amountCents)}</td></tr>`).join('');
  const receiptTable=`<div class="billing-table-scroll"><table><caption class="billing-sr-only">Payments manually marked Paid in ${esc(selectedLabel)}</caption><thead><tr><th>Recorded</th><th>Member / payer</th><th>Category</th><th>Paid through</th><th>Amount</th></tr></thead><tbody>${receipts}</tbody></table></div>`;
  const exemptList=expected.nonpaying.map(x=>`<li><span>${esc(x.name)}</span><span>${esc(x.reason)}</span><strong>$0.00</strong></li>`).join('');
  const legacyNote=expected.legacyPaid?`<p class="billing-footnote">${expected.legacyPaid} active account${expected.legacyPaid===1?' has':'s have'} an older Paid checkmark without a recorded payment date. Those checkmarks are not assigned to a month.</p>`:'';
  return `<div class="billing-report-head"><h3>${esc(selectedLabel)}</h3><p>Manual payment tracking · Updated ${esc(today)}</p></div>
  <div class="billing-metrics"><section class="billing-metric expected"><span>Expected monthly dues</span><strong>${money(expected.total)}</strong><p>${expected.count} active billable account${expected.count===1?'':'s'} · Current roster</p></section>
  <section class="billing-metric"><span>Marked Paid · ${esc(selectedLabel)}</span><strong>${rows.length?money(current.total):'—'}</strong><p>${rows.length?`${rows.length} payment${rows.length===1?'':'s'} recorded by staff`:'No payments recorded for this month yet'}</p></section></div>
  <p class="billing-footnote">Expected dues use today’s active roster${selectedCurrent?'':', not a historical roster for '+esc(selectedLabel)}. Marked Paid totals use the date each payment was saved.</p>
  <section class="billing-breakdown"><h3>Dues by category</h3><div class="billing-table-scroll"><table><thead><tr><th>Category</th><th>Active billable</th><th>Expected monthly</th><th>Marked Paid</th></tr></thead><tbody>${categoryRows||'<tr><td colspan="4">No active billable accounts or recorded payments.</td></tr>'}</tbody><tfoot><tr><th>Total</th><td>${expected.count}</td><td>${money(expected.total)}</td><td>${rows.length?money(current.total):'—'}</td></tr></tfoot></table></div></section>
  <section class="billing-comparison"><h3>Marked Paid: month comparison</h3><p class="billing-footnote">${selectedCurrent?'This month so far compared with the full previous month.':'Saved payment entries for each month.'} Expected dues are not used in this graph.</p>${bars}${!rows.length||!previousRows.length?'<p class="billing-footnote">No records means no saved payment entries; it does not confirm that no money was received.</p>':''}</section>
  ${rows.length?(print?'<h3>Payment entries</h3>'+receiptTable:`<details class="billing-details"><summary>View ${rows.length} payment ${rows.length===1?'entry':'entries'}</summary>${receiptTable}</details>`):'<div class="billing-empty"><strong>Start with the Paid checkbox</strong><p>When an unpaid account is marked Paid and saved, its amount appears here. No online checkout is needed.</p></div>'}
  ${expected.nonpaying.length?(print?`<h3>Covered and exempt members — $0</h3><ul class="billing-exempt-list">${exemptList}</ul>`:`<details class="billing-details"><summary>${expected.nonpaying.length} covered / exempt members · $0 added</summary><ul class="billing-exempt-list">${exemptList}</ul></details>`):''}
  ${legacyNote}<p class="billing-footnote">Family payers count once at $300. Covered members, coaches and exempt accounts add $0.</p>`;
}
