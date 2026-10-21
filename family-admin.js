import {auth,db,collection,query,limit,startAfter,getDocsFromServer,doc,getDocFromServer} from './firebase-client.js?v=54-member-nav';
import {approveChild} from './family-store.js?v=judo80-20261021';
import {attachWaiverPrint} from './waiver-pdf.js?v=54-member-nav';
let epoch=0;
const make=(tag,text)=>{const node=document.createElement(tag);node.textContent=text;return node;};
async function loadDirectory(name,current){
 const docs=[];let cursor;
 do{const page=await getDocsFromServer(query(collection(db,name),...(cursor?[startAfter(cursor)]:[]),limit(250)));if(!current())return {docs:[]};docs.push(...page.docs);if(page.docs.length<250)break;cursor=page.docs.at(-1);}while(current());
 return {docs};
}
function payerIssue(email,roster,billing){
 const member=roster.get(email);
 if(!member)return 'This parent has a login but no matching roster record in the loaded directory. In Members, add them using the same parent email. Choose Parent / Payer if they do not train.';
 const steps=[];
 if(billing.get(email)?.category!=='family-payer')steps.push('set Billing category to Family Plan — Payer ($300/month)');
 if(member.active!==true)steps.push('check Active Membership');
 if(member.enabled!==true)steps.push('check Portal Enabled');
 if(member.archived!==false)steps.push(member.archived?'restore the archived member':'save their roster record to update its membership status');
 return steps.length?'In Members, edit this parent and '+steps.join(', ')+', then save.':'';
}
export async function showFamilyAdmin(identity){
 const host=document.getElementById('staff-family'),nav=document.getElementById('staff-family-link');if(!host)return;
 const token=++epoch,uid=auth.currentUser?.uid,allowed=identity&&['owner','developer'].includes(identity.role);
 host.hidden=!allowed;if(nav)nav.hidden=!allowed;host.replaceChildren();if(!allowed)return;
 const current=()=>token===epoch&&uid===auth.currentUser?.uid;
 host.append(make('h2','Family Children'),make('p','Approve each child under an existing Family Plan — Payer. Children here add $0 in dues. For a parent who does not train, add their roster record with the Parent / Payer program and set their billing category to Family Plan — Payer first. Keep already-enrolled children in their existing roster record; do not duplicate them here.'));
 const status=make('p','Loading family requests…');status.setAttribute('role','status');host.append(status);
 const refresh=make('button','Refresh Families');refresh.className='btn btn-dark';refresh.type='button';refresh.onclick=()=>showFamilyAdmin(identity);host.append(refresh);
 try{
 const [children,billing,members]=await Promise.all([getDocsFromServer(query(collection(db,'children'),limit(250))),loadDirectory('billingProfiles',current),loadDirectory('members',current)]);if(!current())return;
 const roster=new Map(members.docs.map(d=>[d.id,d.data()])),billingMap=new Map(billing.docs.map(d=>[d.id,d.data()]));const payers=billing.docs.filter(d=>!payerIssue(d.id,roster,billingMap));
 status.textContent=`${children.docs.length} child profiles loaded. ${children.docs.filter(d=>d.data().status==='pending').length} awaiting approval. ${payers.length} eligible family payers.${children.docs.length===250?' Child list limit reached: this list is partial.':''}`;
 if(!payers.length)host.append(make('p','No eligible family payers yet. A parent login alone is not a Family Plan — Payer roster record. Set up the payer in Members, then return here.'));
 for(const snap of children.docs.sort((a,b)=>(a.data().status==='pending'?0:1)-(b.data().status==='pending'?0:1))){
 const child={...snap.data(),id:snap.id},card=make('article','');card.className='child-card';card.append(make('h3',child.name),make('p',`Parent: ${child.guardianEmail} · Born: ${child.dob} · ${child.status}`));
 const issue=payerIssue(String(child.guardianEmail||'').trim().toLowerCase(),roster,billingMap);
 if(issue){const help=make('p',issue+' After saving, return to Families. These children add $0 to the family plan.');help.className='family-payer-help';card.append(help);const link=make('a','Set up parent in Members');link.href='#staff-members';link.className='btn btn-dark';card.append(link);}
 const form=make('form',''),fields=make('div','');fields.className='child-fields';
 function field(text,name,type,value){const label=make('label',text),input=make('input','');input.name=name;input.type=type;input.value=value;label.append(input);fields.append(label);return input;}
 const label=make('label','Family payer'),payer=make('select','');payer.name='payerEmail';payer.append(new Option('Select family payer',''));payers.forEach(p=>payer.append(new Option(`${roster.get(p.id).name} — ${p.id}`,p.id)));if(child.payerEmail&&!payers.some(p=>p.id===child.payerEmail))payer.append(new Option(child.payerEmail+' (unavailable)',child.payerEmail));payer.value=child.payerEmail;label.append(payer);fields.append(label);
 const login=field('Child login email (optional)','loginEmail','email',child.loginEmail||child.requestedLoginEmail||'');login.maxLength=254;login.readOnly=!!child.loginEmail;
 const rank=field('Rank','rank','text',child.rank);rank.required=true;rank.maxLength=80;
 const stripes=field('Stripes','stripes','number',child.stripes);stripes.min=0;stripes.max=4;stripes.step=1;stripes.required=true;
 const sl=make('label','Access'),state=make('select','');state.name='status';for(const [value,text]of [['pending','Pending'],['active','Active — family covered'],['paused','Paused']])state.append(new Option(text,value));state.value=child.status;sl.append(state);fields.append(sl);
 const save=make('button','Save Family Approval');save.className='btn btn-red';save.type='submit';const message=make('p','');message.setAttribute('role','status');
 form.append(fields,make('p','Confirm the guardian and family coverage before activating. An approved child login cannot be reassigned here. Leave it blank for parent-phone check-in.'),save,message);form.onsubmit=async e=>{e.preventDefault();if(!current())return;save.disabled=true;try{await approveChild(child,{payerEmail:payer.value,loginEmail:login.value,rank:rank.value.trim(),stripes:stripes.value,status:state.value});if(current())await showFamilyAdmin(identity);}catch(error){if(current()){message.textContent=error.code?'Could not save. Check owner access, connection and deployed rules.':error.message;save.disabled=false;}}};
 const view=make('button','View Child Waiver');view.type='button';view.className='btn btn-dark';const print=make('div','');view.onclick=async()=>{view.disabled=true;try{const waiver=await getDocFromServer(doc(db,'childWaivers',child.id));if(!current())return;if(!waiver.exists())throw Error();print.replaceChildren();attachWaiverPrint(waiver.data(),print);}catch(_){if(current())message.textContent='Waiver could not load. Please retry.';}finally{view.disabled=false;}};
 card.append(form,view,print);host.append(card);
 }
 }catch(_){if(current())status.textContent='Family records could not load. Confirm the new Firestore rules are deployed and retry.';}
}
