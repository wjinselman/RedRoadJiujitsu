/* Account actions follow Auth state; no database reads/writes. */
import { auth, firebaseConfigured, onAuthStateChanged } from './firebase-auth-client.js?v=54-member-nav';

export function bindMemberButton(button, {
  signedOutLabel = 'Set Up Account', signedOutHref = 'members.html?setup=1',
  signedInLabel = 'My Account', signedInHref = 'members.html',
  hideWhenSignedIn = false
} = {}) {
  if (!button || !firebaseConfigured || !auth) return;
  return onAuthStateChanged(auth, user => {
    const signedIn = Boolean(user && !user.isAnonymous && user.email);
    button.hidden = hideWhenSignedIn && signedIn;
    if (hideWhenSignedIn && button.closest('.mobile-action-bar')) {
      button.closest('.mobile-action-bar').classList.toggle('member-signed-in', signedIn);
    }
    button.textContent = signedIn ? signedInLabel : signedOutLabel;
    button.setAttribute('href', signedIn ? signedInHref : signedOutHref);
  });
}
