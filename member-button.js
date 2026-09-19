/* Only the bottom signup button follows Auth state; no database reads/writes. */
import { auth, firebaseConfigured, onAuthStateChanged } from './firebase-auth-client.js?v=67';

export function bindMemberButton(button) {
  if (!button || !firebaseConfigured || !auth) return;
  return onAuthStateChanged(auth, user => {
    const signedIn = Boolean(user && !user.isAnonymous && user.email);
    button.textContent = signedIn ? 'My Account' : 'Sign Up Now';
    button.setAttribute('href', signedIn ? 'members.html' : 'enroll.html');
  });
}
