import {auth,db,collection,query,where,limit,startAfter,getDocsFromServer} from './firebase-client.js?v=52';
export function attendanceMonth(now=new Date()){
  const parts=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:'America/Chicago',year:'numeric',month:'2-digit'}).formatToParts(now).map(p=>[p.type,p.value]));
  const key=parts.year+'-'+parts.month;
  return {start:key+'-01',end:new Date(Date.UTC(Number(parts.year),Number(parts.month),1)).toISOString().slice(0,10),label:new Date(key+'-01T12:00:00Z').toLocaleDateString('en-US',{month:'long',timeZone:'UTC'})};
}
export function attendanceLeaders(rows){
  const counts=new Map(),seen=new Set();
  for(const row of rows){
    if(row.source==='developer-test'||row.developerTest===true)continue;
    const email=String(row.memberEmail||'').trim().toLowerCase();if(!email)continue;
    const key=email+'|'+row.classDate+'|'+row.className;
    if(seen.has(key))continue;seen.add(key);
    const entry=counts.get(email)||{name:String(row.memberName||'Member'),count:0};entry.count++;counts.set(email,entry);
  }
  const highest=Math.max(0,...[...counts.values()].map(r=>r.count));
  return {count:highest,names:[...counts.values()].filter(r=>r.count===highest).map(r=>r.name).sort((a,b)=>a.localeCompare(b))};
}
let generation=0;
export function clearTopAttendance(){generation++;}
export async function loadTopAttendance(){
  const title=document.querySelector('#stat-top-attendance-label'),name=document.querySelector('#stat-top-attendance-name'),note=document.querySelector('#stat-top-attendance-note');
  if(!name)return;
  const attempt=++generation,uid=auth.currentUser?.uid,month=attendanceMonth();
  if(!uid)return;
  const details=document.querySelector('#attendance-tie-details');
  const dialog=document.querySelector('#attendance-tie-dialog');
  details.hidden=true;dialog.close();
  title.textContent='Top Attendance · '+month.label;name.textContent='…';note.textContent='Loading this month…';
  const current=()=>attempt===generation&&auth.currentUser?.uid===uid;
  try{
    const rows=[];let cursor;
    do{
      const page=await getDocsFromServer(query(collection(db,'attendance'),where('classDate','>=',month.start),where('classDate','<',month.end),...(cursor?[startAfter(cursor)]:[]),limit(500)));
      if(!current())return;
      rows.push(...page.docs.map(d=>d.data()));
      if(page.docs.length<500)break;cursor=page.docs.at(-1);
    }while(true);
    const leaders=attendanceLeaders(rows);
    name.textContent=leaders.count?(leaders.names.length>1?'Currently Tied':leaders.names[0]):'—';
    note.textContent=leaders.count?(leaders.names.length>1?`${leaders.names.length} members · ${leaders.count} ${leaders.count===1?'class':'classes'} each`:`${leaders.count} ${leaders.count===1?'class':'classes'} this month`):'No check-ins this month yet';
    details.hidden=leaders.names.length<2;
    details.onclick=()=>{
      const list=document.querySelector('#attendance-tie-names');list.replaceChildren();
      for(const person of leaders.names){const item=document.createElement('li');item.textContent=person;list.append(item);}
      document.querySelector('#attendance-tie-summary').textContent=`${month.label} · ${leaders.count} ${leaders.count===1?'class':'classes'} each`;
      dialog.showModal();
    };
    document.querySelector('#attendance-tie-close').onclick=()=>dialog.close();
  }catch(_){if(current()){name.textContent='—';note.textContent='Could not load · press Refresh';}}
}
