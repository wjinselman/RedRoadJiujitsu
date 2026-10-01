/* Only known local destinations and program keys may survive account setup. */
export function enrollmentFlow(search = '') {
  const params = new URLSearchParams(search);
  const requested = params.get('program');
  const program = ['adult', 'service', 'kids', 'family'].includes(requested) ? requested : '';
  const family = params.get('family') === '1' || program === 'kids' || program === 'family';
  const suffix = family ? 'family=1' : program ? 'program=' + program : '';
  return {
    family, program,
    setup: 'members.html?setup=1' + (suffix ? '&' + suffix : ''),
    member: 'members.html' + (suffix ? '?' + suffix : ''),
    next: family ? 'family.html' : 'enroll.html?continue=1' + (program ? '&program=' + program : '')
  };
}
