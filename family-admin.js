import {auth,db,collection,query,limit,startAfter,getDocsFromServer,doc,getDocFromServer} from './firebase-client.js?v=54-member-nav';
import {approveChild} from './family-store.js?v=simple-parent-20261021';
import {attachWaiverPrint} from './waiver-pdf.js?v=54-member-nav';
let epoch=0;
const make=(tag,text)=>{const node=document.createElement(tag);node.textContent=text;return node;};
async function loadDirectory(name,current){
 const docs=[];let cursor;
 do{const page=await getDocsFromServer(query(collection(db,name),...(cursor?[startAfter(cursor)]:[]),limit(250)));if(!current())return {docs:[]};docs.push(...page.docs);if(page.docs.length<250)break;cursor=page.docs.at(-1);}while(current());
 return {docs};
}
export async function showFamilyAdmin(identity,savedChildId=null){
 const host=document.getElementById('staff-family'),nav=document.getElementById('staff-family-link');if(!host)return;
 const token=++epoch,uid=auth.currentUser?.uid,allowed=identity&&['owner','developer'].includes(identity.role);
 host.hidden=!allowed;if(nav)nav.hidden=!allowed;host.replaceChildren();if(!allowed)return;
 const current=()=>token===epoch&&uid===auth.currentUser?.uid;
 host.append(make('h2','Family Children'),make('p','Choose the existing parent for each child and save. Linked children use the parent’s active membership for check-in. Billing stays separate.'));
 const status=make('p','Loading family requests…');status.setAttribute('role','status');host.append(status);
 const refresh=make('button','Refresh Families');refresh.className='btn btn-dark';refresh.type='button';refresh.onclick=()=>showFamilyAdmin(identity);host.append(refresh);
 try{
 const [children,members]=await Promise.all([loadDirectory('children',current),loadDirectory('members',current)]);if(!current())return;
 const parents=new Map(members.docs.map(d=>[d.id.toLowerCase(),{email:d.id.toLowerCase(),name:d.data().name||d.id}]));
 for(const d of children.docs){const c=d.data(),email=String(c.guardianEmail||'').trim().toLowerCase();if(email&&!parents.has(email))parents.set(email,{email,name:email});}
 const options=[...parents.values()].sort((a,b)=>a.name.localeCompare(b.name)||a.email.localeCompare(b.email));
 status.textContent=children.docs.length+' child profiles loaded. Saved links are shown below; change a field to update a link.';
 for(const snap of children.docs.sort((a,b)=>(a.data().status==='pending'?0:1)-(b.data().status==='pending'?0:1))){
 const child={...snap.data(),id:snap.id},card=make('article','');card.className='child-card';card.append(make('h3',child.name),make('p',`Parent: ${child.guardianEmail} · Born: ${child.dob} · ${child.status}`));
 const form=make('form',''),fields=make('div','');fields.className='child-fields';
 const details=make('details',''),extraFields=make('div','');extraFields.className='child-fields';details.append(make('summary','Optional child details'),extraFields);
 function field(text,name,type,value){const label=make('label',text),input=make('input','');input.name=name;input.type=type;input.value=value;label.append(input);extraFields.append(label);return input;}
 const label=make('label','Parent / existing member'),payer=make('select','');payer.name='parentEmail';payer.required=true;payer.append(new Option('Select parent',''));options.forEach(p=>payer.append(new Option(p.name===p.email?p.email:p.name+' — '+p.email,p.email)));payer.value=child.guardianEmail||'';label.append(payer);fields.append(label);
 const login=field('Child login email (optional)','loginEmail','email',child.loginEmail||child.requestedLoginEmail||'');login.maxLength=254;login.readOnly=!!child.loginEmail;
 const rank=field('Rank','rank','text',child.rank);rank.required=true;rank.maxLength=80;
 const stripes=field('Stripes','stripes','number',child.stripes);stripes.min=0;stripes.max=4;stripes.step=1;stripes.required=true;
 const save=make('button','Save Parent Link');save.className='btn btn-red';save.type='submit';const message=make('p','');message.setAttribute('role','status');
 let saving=false;
 if(child.id===savedChildId||(child.status==='active'&&child.reviewedBy&&child.guardianEmail)){save.textContent='✓ Parent Link Saved';save.disabled=true;message.textContent='✓ Parent link saved.';message.style.color='#65d895';}
 const markChanged=()=>{if(saving)return;save.disabled=false;save.textContent='Save Parent Link';message.textContent='Unsaved changes';message.style.color='';};
 form.addEventListener('input',markChanged);form.addEventListener('change',markChanged);
 form.append(fields,details,make('p','Save links this child to the selected parent. Check-in follows the parent’s active membership.'),save,message);form.onsubmit=async e=>{e.preventDefault();if(!current()||saving||save.disabled)return;saving=true;save.disabled=true;save.textContent='Saving…';message.textContent='';message.style.color='';try{await approveChild(child,{parentEmail:payer.value,loginEmail:login.value,rank:rank.value.trim(),stripes:stripes.value,status:'active'});if(current())await showFamilyAdmin(identity,child.id);}catch(error){if(current()){message.textContent=error.code?'Could not save. Check owner access, connection and deployed rules.':error.message;save.disabled=false;save.textContent='Save Parent Link';saving=false;}}};
 const view=make('button','View Child Waiver');view.type='button';view.className='btn btn-dark';const print=make('div','');view.onclick=async()=>{view.disabled=true;try{const waiver=await getDocFromServer(doc(db,'childWaivers',child.id));if(!current())return;if(!waiver.exists())throw Error();print.replaceChildren();attachWaiverPrint(waiver.data(),print);}catch(_){if(current())message.textContent='Waiver could not load. Please retry.';}finally{view.disabled=false;}};
 card.append(form,view,print);host.append(card);
 }
 }catch(_){if(current())status.textContent='Family records could not load. Confirm the new Firestore rules are deployed and retry.';}
}
