import {auth,updatePassword,signOut} from './firebase-client.js?v=52';
import {sendSignInLinkToEmail,isSignInWithEmailLink,signInWithEmailLink} from 'https://www.gstatic.com/firebasejs/12.18.0/firebase-auth.js';
const $=s=>document.querySelector(s);
function errorText(error){
  const code=error?.code||'';
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
  let busy=false;
  trigger.addEventListener('click',()=>{form.reset();message.textContent='';button.disabled=false;dialog.showModal();email.focus();});
  $('#member-setup-close').addEventListener('click',()=>{if(!busy)dialog.close();});
  dialog.addEventListener('cancel',e=>{if(busy)e.preventDefault();});
  form.addEventListener('submit',async event=>{
    event.preventDefault();if(busy||!form.reportValidity())return;
    busy=true;button.disabled=true;$('#member-setup-close').disabled=true;
    const address=email.value.trim().toLowerCase();
    message.textContent='Sending your setup link…';
    try{
      await sendSignInLinkToEmail(auth,address,{url:new URL('activate.html',window.location.href).href,handleCodeInApp:true});
      message.textContent='Setup link sent to '+address+'. Check your inbox or Spam folder. Open the link to choose your password. You can close this window.';
    }catch(error){message.textContent=errorText(error);button.disabled=false;}
    finally{busy=false;$('#member-setup-close').disabled=false;}
  });
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
      message.textContent='Your email is verified and your password is saved. You can now sign in. Red Road staff must activate your membership before you can check in.';
      $('#setup-success').hidden=false;
    }catch(error){message.textContent=errorText(error);}
    finally{busy=false;submit.disabled=false;}
  });
}
