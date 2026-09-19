/* Authentication state only; no roster or waiver reads on public pages. */
import { auth, firebaseConfigured, onAuthStateChanged } from './firebase-auth-client.js?v=67';

export function bindAccountNavigation() {
  if (!firebaseConfigured || !auth) return;
  const links = [...document.querySelectorAll('a[href="waiver.html?trial=1"],a[data-account-link]')]
    .map(link => ({ link, href: link.getAttribute('href'), markup: link.innerHTML }));
  onAuthStateChanged(auth, user => {
    const signedIn = Boolean(user && !user.isAnonymous && user.email);
    links.forEach(({ link, href, markup }) => {
      if (signedIn) {
        link.href = 'members.html';
        link.textContent = 'My Account';
      } else {
        link.setAttribute('href', href);
        link.innerHTML = markup;
      }
    });
  });
}
