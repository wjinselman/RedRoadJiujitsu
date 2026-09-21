/* Only the bottom signup button follows Auth state; no database reads/writes. */
import { auth, firebaseConfigured, onAuthStateChanged } from './firebase-auth-client.js?v=67';

export function bindMemberButton(button, {
  signedOutLabel = 'Join Now', signedOutHref = 'enroll.html',
  signedInLabel = 'Member Area', signedInHref = 'members.html'
} = {}) {
  if (!button || !firebaseConfigured || !auth) return;
  return onAuthStateChanged(auth, user => {
    const signedIn = Boolean(user && !user.isAnonymous && user.email);
    button.textContent = signedIn ? signedInLabel : signedOutLabel;
    button.setAttribute('href', signedIn ? signedInHref : signedOutHref);
  });
}
