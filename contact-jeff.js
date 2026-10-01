const phone='+15803404598';
const message="Hi Jeff, this is [your name]. I'm reaching out about Red Road BJJ. My question is: ";
export function smsHref(apple=false){return 'sms:'+phone+(apple?'&':'?')+'body='+encodeURIComponent(message);}
let popup;
for(const button of document.querySelectorAll('[data-text-jeff]'))button.addEventListener('click',()=>{
 const apple=/iPad|iPhone|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
 const mobile=apple||/Android|Mobile/.test(navigator.userAgent);
 if(mobile){window.location.href=smsHref(apple);return;}
 if(!popup){popup=document.createElement('dialog');popup.className='weekly-update-dialog';popup.setAttribute('aria-labelledby','jeff-contact-title');
 const title=document.createElement('h2');title.id='jeff-contact-title';title.textContent='Text Jeff Davis';const number=document.createElement('p');number.textContent='580-340-4598';number.style.fontSize='26px';const help=document.createElement('p');help.textContent='Text Jeff directly with questions or concerns about Red Road BJJ. Please include your name. Jeff prefers texts over calls.';const close=document.createElement('button');close.type='button';close.className='btn btn-dark';close.textContent='Close';close.onclick=()=>popup.close();popup.append(title,number,help,close);document.body.append(popup);}
 popup.showModal();
});
