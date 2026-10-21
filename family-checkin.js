import {currentClass,checkInNotice} from './class-schedule.js?v=judo80-20261021';

// Each child keeps their own attendance entry. A partial failure never marks
// their siblings as failed or records the parent in a Kids class.
export function mountFamilyCheckIn(host,{user,children,isCurrent,saveChild,now=()=>new Date()}){
 const make=(tag,text)=>{const node=host.ownerDocument.createElement(tag);node.textContent=text;return node;};
 host.replaceChildren();host.hidden=!children.length;
 const heading=make('h2','Check in your children'),notice=make('p',''),list=make('fieldset','');
 list.append(make('legend','Who is training today?'));
 const selectAll=make('button','Select all available children'),submit=make('button','Check In Selected Children'),summary=make('p','');
 selectAll.type=submit.type='button';selectAll.className='btn btn-dark';submit.className='btn btn-red btn-full';summary.setAttribute('role','status');summary.setAttribute('aria-live','polite');
 const rows=children.map(child=>{const label=make('label',''),input=make('input',''),name=make('strong',child.name),status=make('span','');input.type='checkbox';input.value=child.id;label.className='family-checkin-child';label.append(input,name,status);list.append(label);return {child,input,status,confirmed:''};});
 host.append(heading,make('p','Choose one child or select all. Each child gets their own attendance record.'),notice,list,selectAll,submit,summary);
 let busy=false,lastKey='';
 const slotKey=slot=>slot?slot.classDate+'_'+slot.classKey:'';
 function refresh(){
  const slot=currentClass({plan:'Kids'},now()),key=slotKey(slot),valid=isCurrent();
  if(key!==lastKey){rows.forEach(row=>{row.input.checked=false;row.status.textContent='';});summary.textContent='';lastKey=key;}
  notice.textContent=checkInNotice({plan:'Kids'},now());
  for(const row of rows){
   const eligible=row.child.status==='active'&&row.child.guardianUid===user.uid;
   row.input.disabled=!valid||busy||!slot||!eligible||row.confirmed===key;
   if(!eligible){row.input.checked=false;row.status.textContent=row.child.status==='pending'?'Waiting for staff approval':'Check-in unavailable — contact staff';}
   else if(key&&row.confirmed===key){row.input.checked=false;row.status.textContent='Checked in';}
  }
  selectAll.disabled=!rows.some(row=>!row.input.disabled);
  submit.disabled=busy||!valid||!slot||!rows.some(row=>row.input.checked&&!row.input.disabled);
  submit.textContent=busy?'Checking In…':!slot?'Kids Check-In Closed':'Check In Selected Children';
 }
 rows.forEach(row=>row.input.addEventListener('change',refresh));
 selectAll.onclick=()=>{refresh();rows.forEach(row=>{if(!row.input.disabled)row.input.checked=true;});refresh();};
 submit.onclick=async()=>{
  if(busy||!isCurrent())return;refresh();
  const selected=rows.filter(row=>row.input.checked&&!row.input.disabled);if(!selected.length)return;
  const key=lastKey;busy=true;refresh();const results=[];
  try{for(const row of selected){
   if(!isCurrent())return;
   if(slotKey(currentClass({plan:'Kids'},now()))!==key){results.push('Kids check-in has closed. Remaining children were not checked in.');break;}
   try{const created=await saveChild(row.child);if(!isCurrent())return;row.confirmed=key;row.input.checked=false;row.status.textContent=created?'Checked in':'Already checked in';results.push(row.child.name+': '+(created?'checked in.':'already checked in.'));}
   catch(_){if(!isCurrent())return;row.status.textContent='Not confirmed — try again';results.push(row.child.name+': check-in could not be confirmed. Retry or ask staff to check family approval and coverage.');}
  }}finally{busy=false;if(isCurrent()){refresh();summary.textContent=results.join(' ');}}
 };
 refresh();return {refresh,isBusy:()=>busy};
}
