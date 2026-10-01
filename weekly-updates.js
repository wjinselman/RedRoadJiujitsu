/* Public gym announcement: fetched only when a visitor opens Updates. */
let sdkPromise,dialog,lastFocus,loading=false;
const sdk=()=>sdkPromise ||= import('./firebase-client.js?v=54-member-nav');
const make=(tag,text)=>{const el=document.createElement(tag);el.textContent=text;return el;};
export async function openWeeklyUpdate(){
 if(!dialog){dialog=make('dialog','');dialog.className='weekly-update-dialog';dialog.setAttribute('aria-labelledby','weekly-title');const heading=make('h2','Gym Updates');heading.id='weekly-title';const body=make('p','');body.id='weekly-body';body.setAttribute('role','status');const stamp=make('p','');stamp.id='weekly-stamp';const close=make('button','Close');close.type='button';close.className='btn btn-dark';close.addEventListener('click',()=>dialog.close());dialog.addEventListener('close',()=>lastFocus?.focus());dialog.append(heading,body,stamp,close);document.body.append(dialog)}
 if(dialog.open)return;lastFocus=document.activeElement;dialog.showModal();const body=dialog.querySelector('#weekly-body'),heading=dialog.querySelector('h2'),stamp=dialog.querySelector('#weekly-stamp');heading.textContent='Gym Updates';body.textContent='Loading the latest update…';stamp.textContent='';
 if(loading)return;loading=true;
 try{const api=await sdk();if(!api.db)throw Error('Not configured');const snap=await api.getDocFromServer(api.doc(api.db,'publicContent','weeklyUpdate'));const data=snap.exists()?snap.data():null;heading.textContent=data?.published?data.title:'Gym Updates';body.textContent=data?.published?data.body:'No announcement right now. Check back for class changes and gym news.';stamp.textContent=data?.published&&data.updatedAt?.toDate?'Updated '+data.updatedAt.toDate().toLocaleDateString():'';}
 catch(error){body.textContent=error?.code==='permission-denied'?'No announcement is available right now.':'Updates could not load. Close this window and try again when connected.'}finally{loading=false}
}
document.addEventListener('click',event=>{const trigger=event.target.closest('[data-gym-updates]');if(trigger){event.preventDefault();openWeeklyUpdate();}});
let editorEpoch=0;
export async function showWeeklyEditor(identity){
 const editor=document.getElementById('weekly-editor');if(!editor)return;const generation=++editorEpoch;const allowed=identity&&['owner','developer'].includes(identity.role);editor.hidden=!allowed;
 if(!allowed){editor.querySelector('form').reset();return;}
 const api=await sdk();const uid=api.auth.currentUser?.uid;if(generation!==editorEpoch)return;
 const form=editor.querySelector('form'),status=editor.querySelector('[role=status]');form.querySelector('button[type=submit]').disabled=true;
 try{const snap=await api.getDocFromServer(api.doc(api.db,'publicContent','weeklyUpdate'));if(generation!==editorEpoch||api.auth.currentUser?.uid!==uid)return;const data=snap.exists()?snap.data():{};form.elements.title.value=data.title||'';form.elements.body.value=data.body||'';form.elements.published.checked=data.published===true;status.textContent='One current announcement. Published text is visible to anyone who clicks Updates.';form.querySelector('button[type=submit]').disabled=false;}
 catch(_){if(generation===editorEpoch)status.textContent='Could not load the current update. Refresh the dashboard to retry.'}
 form.onsubmit=async event=>{event.preventDefault();if(generation!==editorEpoch||api.auth.currentUser?.uid!==uid)return;const button=event.submitter;button.disabled=true;try{const title=form.elements.title.value.trim(),body=form.elements.body.value.trim();if(!title||!body){status.textContent='Enter a title and message.';return;}await api.setDoc(api.doc(api.db,'publicContent','weeklyUpdate'),{title,body,published:form.elements.published.checked,updatedAt:api.serverTimestamp()});if(generation===editorEpoch)status.textContent=form.elements.published.checked?'Update published. Members can open it from Updates.':'Update hidden from visitors.';}catch(_){if(generation===editorEpoch)status.textContent='Could not save. Check your connection and owner access.'}finally{button.disabled=false}};
}
