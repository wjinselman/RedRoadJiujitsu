(()=>{
  const header=document.querySelector('.top');
  const nav=header?.querySelector('.nav');
  if(!header||!nav||header.querySelector('.mobile-nav-panel')) return;

  // All pages live as siblings at the site root, so plain relative paths
  // work from any page without needing an absolute base URL.
  const home='index.html';
  let toggle=nav.querySelector('.mobile-menu');
  const button=document.createElement('button');
  button.type='button';
  button.className='btn btn-dark mobile-menu mobile-menu-toggle';
  button.setAttribute('aria-expanded','false');
  button.setAttribute('aria-controls','mobile-site-nav');
  button.textContent='Menu';
  if(toggle) toggle.replaceWith(button); else nav.append(button);
  toggle=button;

  const panel=document.createElement('div');
  panel.className='mobile-nav-panel';
  panel.id='mobile-site-nav';
  panel.innerHTML=`<nav class="mobile-nav-links" aria-label="Mobile navigation">
    <a href="${home}">Home</a>
    <a href="${home}#programs">Programs</a>
    <a href="${home}#schedule">Schedule</a>
    <a href="${home}#pricing">Pricing</a>
    <a href="${home}#coaches">Coaches</a>
    <a href="story.html">Our Story</a>
    <a href="${home}#location">Location</a>
    <a href="waiver.html">Waiver</a>
    <a href="members.html">Member Login</a>
    <a class="mobile-nav-primary" href="enroll.html">Book First Class</a>
  </nav>`;
  header.append(panel);

  const close=()=>{panel.classList.remove('is-open');toggle.setAttribute('aria-expanded','false')};
  toggle.addEventListener('click',()=>{
    const open=!panel.classList.contains('is-open');
    panel.classList.toggle('is-open',open);
    toggle.setAttribute('aria-expanded',String(open));
  });
  panel.addEventListener('click',event=>{if(event.target.closest('a')) close()});
  document.addEventListener('click',event=>{if(!header.contains(event.target)) close()});
  document.addEventListener('keydown',event=>{if(event.key==='Escape'){close();toggle.focus()}});
  addEventListener('resize',()=>{if(innerWidth>900) close()},{passive:true});
})();
