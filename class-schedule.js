export const CLASS_HOURS = 'Monday–Friday: Kids 6–7 PM; Adults 7–8 PM (Central Time).';
export function currentClass(record, now = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago', year:'numeric', month:'2-digit', day:'2-digit',
    weekday:'short', hour:'2-digit', hourCycle:'h23'
  }).formatToParts(now).map(p => [p.type,p.value]));
  const hour = Number(parts.hour);
  const plan = String(record?.plan || '').toLowerCase();
  const kids = plan.includes('kid');
  const both = plan.includes('family') || record?.developerTest === true;
  if (['Sat','Sun'].includes(parts.weekday) || !(hour === 18 && (kids || both) || hour === 19 && (!kids || both))) return null;
  const group = hour === 18 ? 'Kids' : 'Adult';
  const className = group + (['Tue','Fri'].includes(parts.weekday) ? ' No-Gi' : ' Jiu Jitsu');
  return { className, classDate:parts.year+'-'+parts.month+'-'+parts.day,
    classKey:className.toLowerCase().replace(/[^a-z0-9]+/g,'-') };
}
