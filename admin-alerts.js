import {status,BILLING_CATEGORIES,defaultCategory,gymDate} from './billing-model.js?v=1';

export function activePaymentAlerts(members,profiles,today=gymDate()) {
  return members.filter(member=>member.active===true && member.archived!==true).flatMap(member=>{
    const profile=profiles.get(member.email),payer=profiles.get(profile?.payerEmail);
    const state=status(member,profile,payer,today);
    if(state.current)return [];
    const covered=profile?.category==='family-covered';
    return [{email:member.email,name:member.name||member.email,
      category:BILLING_CATEGORIES[profile?.category||defaultCategory(member)].label,
      paidThrough:state.paidThrough,nextDue:state.nextDue,
      editEmail:covered?profile.payerEmail:member.email,covered,
      description:covered?'Family payment due — record payment on the family payer only.':state.nextDue?'Payment due '+state.nextDue+'.':'No current payment recorded.'}];
  }).sort((a,b)=>(a.nextDue||'9999').localeCompare(b.nextDue||'9999')||a.name.localeCompare(b.name));
}
