export const CLASS_HOURS = 'Monday–Friday: Kids check-in 5:45–7:00 PM; Adults 6:45–8:00 PM (Central Time).';
export function classGroup(record) {
  const plan = String(record?.plan || '').toLowerCase();
  if (record?.developerTest || plan.includes('family')) return ['kids','adult'].includes(record?.selectedProgram) ? record.selectedProgram : null;
  if (plan.includes('kid')) return 'kids';
  if (['adult','coach','military','service','first responder'].some(value => plan.includes(value))) return 'adult';
  return null;
}
export function gymTime(now = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', {timeZone:'America/Chicago',year:'numeric',month:'2-digit',day:'2-digit',weekday:'short',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(now).map(p=>[p.type,p.value]));
  return {minutes:Number(p.hour)*60+Number(p.minute),weekday:p.weekday,classDate:p.year+'-'+p.month+'-'+p.day};
}
export function currentClass(record, now = new Date()) {
  const t=gymTime(now), group=classGroup(record);
  if (!group || ['Sat','Sun'].includes(t.weekday)) return null;
  const start=group==='kids'?1065:1125, end=group==='kids'?1140:1200;
  if(t.minutes<start || t.minutes>=end) return null;
  const className=(group==='kids'?'Kids':'Adult')+(['Tue','Fri'].includes(t.weekday)?' No-Gi':' Jiu Jitsu');
  return {className,classDate:t.classDate,classKey:className.toLowerCase().replace(/[^a-z0-9]+/g,'-')};
}
export function checkInNotice(record, now=new Date()) {
  if (!record) return 'Check-in is only available during scheduled class times, starting 15 minutes before class. '+CLASS_HOURS;
  const group=classGroup(record);
  if (!group) return record.developerTest || String(record.plan||'').toLowerCase().includes('family') ? 'Choose Kids or Adult class to check in.' : 'Your account needs a Kids or Adult program assigned. Ask a coach for help.';
  const slot=currentClass(record,now);
  if(slot) return 'Check-in is open for '+slot.className+'.';
  const t=gymTime(now), title=group==='kids'?'Kids':'Adult', start=group==='kids'?1065:1125;
  if(!['Sat','Sun'].includes(t.weekday) && t.minutes<start) return title+' class check-in opens at '+(group==='kids'?'5:45':'6:45')+' PM Central.';
  return title+' class check-in is closed. '+CLASS_HOURS;
}
