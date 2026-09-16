import { db, collection, query, where, limit, startAfter, getDocsFromServer } from './firebase-client.js?v=52';
import { documentId } from 'https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js';

export function monthInfo(now = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone:'America/Chicago', year:'numeric', month:'2-digit', day:'2-digit' }).formatToParts(now).map(p => [p.type,p.value]));
  const year = Number(parts.year), month = Number(parts.month);
  const date = new Date(Date.UTC(year, month - 1, 1));
  return {
    key:parts.year + '-' + parts.month,
    next:new Date(Date.UTC(year, month, 1)).toISOString().slice(0,7),
    today:parts.year + '-' + parts.month + '-' + parts.day,
    label:new Intl.DateTimeFormat('en-US',{month:'long',year:'numeric',timeZone:'UTC'}).format(date),
    firstDay:date.getUTCDay(), days:new Date(Date.UTC(year,month,0)).getUTCDate()
  };
}

export async function fetchMonth(email, info) {
  // Existing attendance IDs start with the gym date. Filter by the authenticated
  // email as well, so Firestore can enforce each member's own-record rule.
  const filters = [where('memberEmail','==',email), where(documentId(),'>=',info.key+'-01_'), where(documentId(),'<',info.next+'-01_')];
  const result = [];
  let cursor;
  for (;;) {
    const page = await getDocsFromServer(query(collection(db,'attendance'), ...filters, ...(cursor ? [startAfter(cursor)] : []), limit(50)));
    for (const doc of page.docs) {
      const data = doc.data();
      if (data.memberEmail === email && typeof data.classDate === 'string' && data.classDate.startsWith(info.key+'-')) result.push({id:doc.id,...data});
    }
    if (page.docs.length < 50) break;
    cursor = page.docs[page.docs.length-1];
  }
  return result;
}

export function renderMonth(root, info, rows) {
  root.replaceChildren();
  const byDay = new Map();
  for (const row of rows) {
    if (!byDay.has(row.classDate)) byDay.set(row.classDate,[]);
    byDay.get(row.classDate).push(row.className);
  }
  for (const day of ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']) {
    const cell = document.createElement('span'); cell.className='attendance-weekday';cell.textContent=day;root.append(cell);
  }
  for (let i=0;i<info.firstDay;i++) { const spacer=document.createElement('span');spacer.setAttribute('aria-hidden','true');root.append(spacer); }
  for (let day=1;day<=info.days;day++) {
    const key=info.key+'-'+String(day).padStart(2,'0'), classes=byDay.get(key)||[];
    const cell=document.createElement('span');cell.className='attendance-day'+(classes.length?' attended':'');cell.textContent=String(day);
    if (key===info.today) cell.setAttribute('aria-current','date');
    const label=info.label+' '+day+(classes.length?': '+classes.join(', '):': no attendance');
    cell.setAttribute('aria-label',label);cell.title=label;root.append(cell);
  }
}
