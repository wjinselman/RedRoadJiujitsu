/* Red Road 65: explicit, session-bound email verification recovery. */
export function createEmailVerification({auth,sendEmailVerification,onVerified,report=()=>{},storage=null,now=()=>Date.now()}) {
 if(!storage){try{storage=globalThis.sessionStorage}catch{}}
 let panel=null, status=null, sendButton=null, checkButton=null, subject=null, busy=false, lastAutomaticCheck=0;
 const attempts=new Map();
 const current=user=>!!user&&auth.currentUser?.uid===user.uid;
 const key=user=>'rr-verification-attempt:'+user.uid;
 function last(user){try{return Math.max(attempts.get(user.uid)||0,Number(storage.getItem(key(user))||0))}catch{return attempts.get(user.uid)||0}}
 function mark(user){attempts.set(user.uid,now());try{storage.setItem(key(user),String(now()))}catch{}}
 function detail(error){const code=String(error?.code||'auth/unknown-error');
  if(code.includes('too-many-requests'))return 'Firebase temporarily limited verification requests. Check your inbox and spam for an earlier email. Wait before requesting another. Repeated sign-ins will not help. ['+code+']';
  if(code.includes('quota-exceeded'))return 'The verification-email sending limit has been reached. Contact Red Road staff and share this code: '+code;
  if(code.includes('network-request-failed'))return 'The verification request could not reach Firebase. Check your connection, then try again. ['+code+']';
  if(/user-token-expired|invalid-user-token|requires-recent-login/.test(code))return 'Your session needs a fresh sign-in. Use Sign out below, sign in again, then request verification. ['+code+']';
  return 'Verification could not finish. Share this code with Red Road staff: '+code;
 }
 function hide(){if(panel)panel.hidden=true;subject=null;}
 async function refresh(user){
  if(!current(user))return false;
  await user.reload();
  if(!current(user))return false;
  if(user.emailVerified!==true)return false;
  await user.getIdToken(true);
  return current(user)&&user.emailVerified===true;
 }
 async function send(){const user=subject;if(busy||!current(user))return;busy=true;sendButton.disabled=checkButton.disabled=true;
  try{
   if(await refresh(user)){if(!current(user))return;hide();await onVerified(user);return;}
   if(!current(user))return;
   const remaining=60000-(now()-last(user));if(remaining>0){status.textContent='Please wait '+Math.ceil(remaining/1000)+' seconds before requesting another verification email. You can check an earlier email now.';return;}
   mark(user);await sendEmailVerification(user);
   if(current(user)&&subject===user)status.textContent='Verification email sent. Check your inbox and spam, open the link, then return here. We’ll check automatically when you return.';
  }catch(error){report(error,'email-verification-send');if(current(user)&&subject===user)status.textContent=detail(error);}
  finally{busy=false;sendButton.disabled=checkButton.disabled=false;}
 }
 async function check(automatic=false){const user=subject;if(busy||!current(user))return;busy=true;sendButton.disabled=checkButton.disabled=true;
  try{if(await refresh(user)){if(!current(user))return;hide();await onVerified(user);}else if(!automatic&&current(user)&&subject===user)status.textContent='This address is not verified yet. Open the link in your verification email, then check again. No new email was sent.';}
  catch(error){report(error,'email-verification-check');if(current(user)&&subject===user)status.textContent=detail(error);}
  finally{busy=false;sendButton.disabled=checkButton.disabled=false;}
 }
 function show(user,message,signOut){
  if(!current(user)||!message)return;
  subject=user;
  if(!panel){panel=document.createElement('section');panel.className='flash-message';panel.style.cssText='margin-top:16px;line-height:1.6';panel.setAttribute('aria-label','Email verification');panel.setAttribute('tabindex','-1');
   const title=document.createElement('strong');title.textContent='You’re signed in. One quick email check.';
   const address=document.createElement('p');address.dataset.verificationEmail='';
   status=document.createElement('p');status.setAttribute('role','status');status.setAttribute('aria-live','polite');
   const actions=document.createElement('div');actions.style.cssText='display:flex;flex-wrap:wrap;gap:12px';
   sendButton=document.createElement('button');sendButton.type='button';sendButton.className='btn btn-red';sendButton.textContent='Send verification email';sendButton.onclick=send;
   checkButton=document.createElement('button');checkButton.type='button';checkButton.className='btn btn-dark';checkButton.textContent='I’ve verified my email';checkButton.onclick=()=>check();
   const logout=document.createElement('button');logout.type='button';logout.className='btn btn-dark';logout.textContent='Use a different account';logout.onclick=async()=>{try{await signOut();hide()}catch(error){status.textContent=detail(error)}};
   for(const button of [sendButton,checkButton,logout])button.style.cssText='max-width:100%;white-space:normal;overflow-wrap:anywhere;min-width:0';
   actions.append(sendButton,checkButton,logout);panel.append(title,address,status,actions);message.insertAdjacentElement('afterend',panel);
  }
  panel.querySelector('[data-verification-email]').textContent=user.email||'Your account email';
  status.textContent='Open the verification link in your inbox or spam folder, then return here. Need a new email? Tap Send verification email.';panel.hidden=false;
  panel.focus?.({preventScroll:true});panel.scrollIntoView?.({block:'nearest',behavior:'smooth'});
 }
 function checkOnReturn(){
  if(!subject||panel?.hidden||busy||document.hidden)return;
  if(now()-lastAutomaticCheck<5000)return;
  lastAutomaticCheck=now();void check(true);
 }
 globalThis.addEventListener?.('focus',checkOnReturn);
 document.addEventListener?.('visibilitychange',checkOnReturn);
 return {show,hide,refresh};
}
