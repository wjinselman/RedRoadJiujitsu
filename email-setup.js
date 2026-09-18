import {auth,updatePassword,signOut,createUserWithEmailAndPassword,sendEmailVerification} from './firebase-client.js?v=52';
import {isSignInWithEmailLink,signInWithEmailLink} from 'https://www.gstatic.com/firebasejs/12.18.0/firebase-auth.js';
const $=s=>document.querySelector(s);
let accountSetupBusy=false;
export function isAccountSetupOpen(){return accountSetupBusy || Boolean($('#member-setup-dialog')?.open);}
function errorText(error){
  const code=error?.code||'';
  if(code.includes('email-already-in-use'))return 'This email already has a login. Close this window and sign in, or use Forgot password. Your existing account has not been changed.';
  if(code.includes('invalid-email'))return 'Enter a valid email address.';
  if(code.includes('quota-exceeded'))return 'The daily verification email limit has been reached. Please try again later or contact Red Road staff.';
  if(code.includes('operation-not-allowed'))return 'Email setup is not enabled yet. Please ask Red Road staff for help.';
  if(code.includes('unauthorized')||code.includes('invalid-continue'))return 'The setup link needs configuration. Please ask Red Road staff for help.';
  if(code.includes('expired')||code.includes('invalid-action-code'))return 'This link has expired or was already used. Return to Member Sign In and request a new setup link.';
  if(code.includes('weak-password')||code.includes('password-does-not-meet'))return 'Please choose a stronger password and try again.';
  if(code.includes('too-many'))return 'Too many attempts. Please wait a few minutes before trying again.';
  return 'Could not finish this step. Check your connection and email address, then try again.';
}

export function setupEmailInvitation(){
  const trigger=$('#member-activate'),dialog=$('#member-setup-dialog');
  if(!trigger||!dialog)return;
  const form=$('#member-setup-form'),email=$('#member-setup-email'),message=$('#member-setup-message'),button=$('#member-setup-send');
  const password=$('#member-setup-password'),confirm=$('#member-setup-confirm'),close=$('#member-setup-close');
  const actions=$('#member-setup-verification'),resend=$('#member-setup-resend'),recheck=$('#member-setup-recheck');
  let user=null,lastSent=0;
  const busy=value=>{accountSetupBusy=value;button.disabled=value;close.disabled=value;resend.disabled=value;recheck.disabled=value;};
  const showVerification=()=>{form.hidden=true;actions.hidden=false;password.value='';confirm.value='';};
  const validSession=()=>user && auth.currentUser?.uid===user.uid;
  async function sendVerification(){
    if(!validSession())throw Error('Session changed');
    await sendEmailVerification(user,{url:new URL('members.html',window.location.href).href});
    lastSent=Date.now();
    message.textContent='Verification email sent to '+user.email+'. Check your inbox or Spam folder, open the link, then return here and select “I’ve verified my email.”';
  }
  trigger.addEventListener('click',()=>{
    if(accountSetupBusy)return;
    form.reset();message.textContent='';busy(false);form.hidden=false;actions.hidden=true;
    user=auth.currentUser && !auth.currentUser.isAnonymous && !auth.currentUser.emailVerified ? auth.currentUser : null;
    if(user){showVerification();message.textContent='Your login already exists for '+user.email+'. Verify your email to continue, or resend the verification email below.';}
    dialog.showModal();if(!user)email.focus();
  });
  close.addEventListener('click',()=>{if(!accountSetupBusy){password.value='';confirm.value='';dialog.close();}});
  dialog.addEventListener('cancel',event=>{if(accountSetupBusy)event.preventDefault();else{password.value='';confirm.value='';}});
  form.addEventListener('submit',async event=>{
    event.preventDefault();if(accountSetupBusy||!form.reportValidity())return;
    if(password.value!==confirm.value){message.textContent='Your passwords do not match.';confirm.focus();return;}
    busy(true);message.textContent='Creating your login…';
    try{
      await auth.authStateReady();
      if(auth.currentUser && !auth.currentUser.isAnonymous){message.textContent='You are already signed in. Close this window and sign out before creating a different account.';return;}
      const result=await createUserWithEmailAndPassword(auth,email.value.trim().toLowerCase(),password.value);
      user=result.user;showVerification();
      try{await sendVerification();}
      catch(error){message.textContent='Your login was created, but the verification email could not be sent. '+errorText(error)+' Use Resend verification below; do not create another account.';}
    }catch(error){message.textContent=errorText(error);}
    finally{busy(false);}
  });
  resend.addEventListener('click',async()=>{
    if(accountSetupBusy)return;
    if(Date.now()-lastSent<60000){message.textContent='Please wait one minute before requesting another verification email. Check Spam too.';return;}
    busy(true);
    try{await sendVerification();}catch(error){message.textContent=errorText(error);}
    finally{busy(false);}
  });
  recheck.addEventListener('click',async()=>{
    if(accountSetupBusy)return;busy(true);message.textContent='Checking email verification…';
    try{
      if(!validSession())throw Error('Session changed');
      await user.reload();await user.getIdToken(true);
      if(!validSession())throw Error('Session changed');
      if(!user.emailVerified){message.textContent='Your email is not verified yet. Open the verification link in your email, then try this button again.';return;}
      window.location.assign('enroll.html?continue=1');
    }catch(error){message.textContent=errorText(error);}
    finally{busy(false);}
  });
  if(new URLSearchParams(window.location.search).get('setup')==='1')trigger.click();
}
if($('#finish-setup-form')){
  const form=$('#finish-setup-form'),message=$('#setup-status'),submit=$('#finish-setup-submit');
  const link=window.location.href;let verifiedUser=null,busy=false;
  const valid=auth&&isSignInWithEmailLink(auth,link);
  if(!valid){form.hidden=true;message.textContent='Open the setup link from your email to continue. If you need a new link, return to Member Sign In.';}
  form.addEventListener('submit',async event=>{
    event.preventDefault();if(busy||!valid||!form.reportValidity())return;
    const password=$('#setup-password').value;
    if(password!==$('#setup-confirm').value){message.textContent='Your passwords do not match.';$('#setup-confirm').focus();return;}
    busy=true;submit.disabled=true;message.textContent='Verifying your email and saving your password…';
    try{
      if(!verifiedUser){
        const result=await signInWithEmailLink(auth,$('#setup-email').value.trim().toLowerCase(),link);
        verifiedUser=result.user;
        $('#setup-email').disabled=true;
        history.replaceState(null,'','activate.html');
      }
      if(auth.currentUser?.uid!==verifiedUser.uid)throw Error('Session changed');
      await updatePassword(verifiedUser,password);
      form.reset();form.hidden=true;
      message.textContent='Your email is verified and your password is saved. Continue to finish your member details and waiver. If you are already on the roster, we’ll open your member portal.';
      $('#setup-success').hidden=false;
      window.location.assign('enroll.html?continue=1');
    }catch(error){message.textContent=errorText(error);}
    finally{busy=false;submit.disabled=false;}
  });
}
