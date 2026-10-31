import {auth,db,collection,query,limit,startAfter,getDocsFromServer,doc,getDocFromServer} from './firebase-client.js?v=54-member-nav';
import {approveChild} from './family-store.js?v=simple-parent-20261021';
import {attachWaiverPrint} from './waiver-pdf.js?v=54-member-nav';
let epoch=0,renderedUid;
const make=(tag,text='',className='')=>{const node=document.createElement(tag);node.textContent=text;node.className=className;return node;};
const normalize=value=>String(value||'').trim().toLowerCase();
async function loadDirectory(name,current){
 const docs=[];let cursor;
 do{const page=await getDocsFromServer(query(collection(db,name),...(cursor?[startAfter(cursor)]:[]),limit(250)));if(!current())return {docs:[]};docs.push(...page.docs);if(page.docs.length<250)break;cursor=page.docs.at(-1);}while(current());
 return {docs};
}
// The saved guardian link determines the family, not surname or child login.
export function groupFamilies(children,parents){
 const groups=new Map();
 for(const child of children){const email=normalize(child.guardianEmail);if(!groups.has(email))groups.set(email,{email,name:parents.get(email)?.name||email||'Needs a parent link',children:[]});groups.get(email).children.push(child);}
 return [...groups.values()].sort((a,b)=>a.name.localeCompare(b.name)||a.email.localeCompare(b.email)).map(group=>({...group,children:group.children.sort((a,b)=>(a.status==='pending'?0:1)-(b.status==='pending'?0:1)||String(a.name||'').localeCompare(String(b.name||'')))}));
}
export async function showFamilyAdmin(identity,savedChildId=null){
 const host=document.getElementById('staff-family'),nav=document.getElementById('staff-family-link');if(!host)return;
 const token=++epoch,uid=auth.currentUser?.uid,allowed=identity&&['owner','developer'].includes(identity.role);
 const previous=renderedUid===uid?host.querySelector('.family-panel'):null;
 const panelOpen=previous?.open??(location.hash==='#staff-family');
 const openGroups=new Map([...host.querySelectorAll('[data-family-key]')].map(el=>[el.dataset.familyKey,el.open]));
 const openEditors=new Set([...host.querySelectorAll('.family-child-editor[open]')].map(el=>el.dataset.childId));
 const drafts=new Map();
 if(previous)for(const form of host.querySelectorAll('form[data-dirty="true"]'))if(form.dataset.childId!==savedChildId)drafts.set(form.dataset.childId,Object.fromEntries(new FormData(form)));
 if(host._familyHashListener)window.removeEventListener('hashchange',host._familyHashListener);
 host.hidden=!allowed;if(nav){nav.hidden=!allowed;nav.onclick=null;}host.replaceChildren();renderedUid=uid;if(!allowed)return;
 const current=()=>token===epoch&&uid===auth.currentUser?.uid;
 const panel=make('details','','family-panel');panel.open=panelOpen;
 const summary=make('summary','','family-panel-summary'),count=make('span','Loading…','family-count');summary.append(make('h2','Families'),count);panel.append(summary);
 const content=make('div','','family-panel-content');panel.append(content);host.append(panel);
 const reveal=()=>{if(current()&&!host.hidden)panel.open=true;};if(nav)nav.onclick=reveal;
 host._familyHashListener=()=>{if(location.hash==='#staff-family')reveal();};window.addEventListener('hashchange',host._familyHashListener);
 const toolbar=make('div','','family-toolbar'),status=make('p','Loading families…','family-help'),refresh=make('button','Refresh','btn btn-dark');status.setAttribute('role','status');refresh.type='button';refresh.onclick=()=>showFamilyAdmin(identity);toolbar.append(status,refresh);content.append(toolbar);
 const list=make('div','','family-groups');content.append(list,make('p','Children check in through their linked parent’s active membership.','family-help family-footnote'));
 try{
  const [children,members]=await Promise.all([loadDirectory('children',current),loadDirectory('members',current)]);if(!current())return;
  const parents=new Map(members.docs.map(d=>[normalize(d.id),{email:normalize(d.id),name:d.data().name||d.id}]));
  for(const d of children.docs){const email=normalize(d.data().guardianEmail);if(email&&!parents.has(email))parents.set(email,{email,name:email});}
  const options=[...parents.values()].sort((a,b)=>a.name.localeCompare(b.name)||a.email.localeCompare(b.email));
  const groups=groupFamilies(children.docs.map(s=>({...s.data(),id:s.id})),parents);
  count.textContent=`${groups.length} ${groups.length===1?'family':'families'} · ${children.docs.length} ${children.docs.length===1?'child':'children'}`;
  status.textContent=children.docs.length?'Linked children, grouped by parent.':'No child profiles yet.';
  for(const group of groups){
   const family=make('details','','family-group');family.dataset.familyKey=group.email;family.open=previous?(openGroups.get(group.email)??true):true;if(group.children.some(child=>child.id===savedChildId))family.open=true;
   const heading=make('summary','','family-group-summary'),parent=make('span','','family-parent');parent.append(make('strong',group.name));if(group.email&&group.name!==group.email)parent.append(make('span',group.email,'family-help'));heading.append(parent,make('span',`${group.children.length} ${group.children.length===1?'child':'children'}`,'family-count'));family.append(heading);
   const rows=make('div','','family-children');family.append(rows);list.append(family);
   for(const child of group.children){
    const card=make('article','','family-child-row');card.dataset.childId=child.id;
    const row=make('div','','family-child-heading'),name=make('div','','family-child-name');name.append(make('h3',child.name||'Child'));if(child.rank)name.append(make('span',`${child.rank}${Number(child.stripes)>0?` · ${child.stripes} ${Number(child.stripes)===1?'stripe':'stripes'}`:''}`,'family-help'));
    row.append(name,make('span',child.status==='active'?'Linked':child.status==='pending'?'Needs review':child.status||'Needs review',`family-link-status ${child.status==='active'?'is-linked':''}`));card.append(row);
    const actions=make('div','','family-child-actions'),editor=make('details','','family-child-editor');editor.dataset.childId=child.id;editor.open=openEditors.has(child.id)||drafts.has(child.id);editor.append(make('summary',child.status==='pending'?'Review child':'Edit child'));
    const form=make('form'),fields=make('div','','child-fields');form.dataset.childId=child.id;
    const label=make('label','Linked parent'),payer=make('select');payer.name='parentEmail';payer.required=true;payer.append(new Option('Select parent',''));options.forEach(p=>payer.append(new Option(p.name===p.email?p.email:p.name+' — '+p.email,p.email)));payer.value=normalize(child.guardianEmail);label.append(payer);fields.append(label);
    function field(text,name,type,value){const label=make('label',text),input=make('input');input.name=name;input.type=type;input.value=value??'';label.append(input);fields.append(label);return input;}
    const login=field('Child login email (optional)','loginEmail','email',child.loginEmail||child.requestedLoginEmail||'');login.maxLength=254;login.readOnly=!!child.loginEmail;
    const rank=field('Rank','rank','text',child.rank);rank.required=true;rank.maxLength=80;
    const stripes=field('Stripes','stripes','number',child.stripes??0);stripes.min=0;stripes.max=4;stripes.step=1;stripes.required=true;
    if(child.dob)form.append(make('p',`Date of birth: ${child.dob}`,'family-help'));
    const save=make('button',child.status==='pending'?'Approve & link child':'Save changes','btn btn-red');save.type='submit';save.disabled=child.status==='active';
    const message=make('p',child.id===savedChildId?'Changes saved.':'','family-save-status');message.setAttribute('role','status');let saving=false;
    const markChanged=()=>{if(saving)return;form.dataset.dirty='true';save.disabled=false;message.textContent='Unsaved changes';};form.addEventListener('input',markChanged);form.addEventListener('change',markChanged);
    form.append(fields,save);editor.append(form);actions.append(editor);
    if(drafts.has(child.id)){for(const [key,value]of Object.entries(drafts.get(child.id))){const input=form.elements.namedItem(key);if(input&&!input.readOnly)input.value=value;}markChanged();}
    form.onsubmit=async e=>{e.preventDefault();if(!current()||saving||save.disabled||!form.reportValidity())return;saving=true;save.disabled=true;save.textContent='Saving…';message.textContent='';try{await approveChild(child,{parentEmail:payer.value,loginEmail:login.value,rank:rank.value.trim(),stripes:stripes.value,status:'active'});if(current())await showFamilyAdmin(identity,child.id);}catch(error){if(current()){message.textContent=error.code?'Could not save. Check your connection and access, then retry.':error.message;save.disabled=false;save.textContent='Save changes';saving=false;}}};
    const view=make('button','View waiver','btn btn-dark'),print=make('div');view.type='button';view.onclick=async()=>{view.disabled=true;try{const waiver=await getDocFromServer(doc(db,'childWaivers',child.id));if(!current())return;if(!waiver.exists())throw Error();print.replaceChildren();attachWaiverPrint(waiver.data(),print);}catch(_){if(current())message.textContent='Waiver could not load. Please retry.';}finally{view.disabled=false;}};
    actions.append(view);card.append(actions,message,print);rows.append(card);
   }
  }
  if(savedChildId){const saved=[...host.querySelectorAll('.family-child-editor')].find(el=>el.dataset.childId===savedChildId);saved?.querySelector('summary')?.focus();}
 }catch(_){if(current()){count.textContent='Unavailable';status.textContent='Families could not load. Check your connection and access, then refresh.';}}
}
