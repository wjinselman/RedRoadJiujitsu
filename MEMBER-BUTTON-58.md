# R58 — bottom signup button only

Apply this patch over R57. Upload the included HTML files, mobile-nav.js and member-button.js to the website root, replacing matching files. HTML changes only request the new navigation version; no stylesheets or form/database scripts are changed.

Signed out: the center bottom button is Sign Up Now and opens enroll.html.
Signed in with a non-anonymous email account: the same button says Members and opens members.html.
Signing out restores Sign Up Now. An anonymous free-trial session does not change the label. The existing right-hand Members link remains, as requested; no layout changes were made.

The hero's Try One Class Free button is unchanged, including while signed in. Scroll fixes are unchanged. The helper observes Firebase Authentication state only and makes no Firestore reads/writes. If Auth cannot load, the public signup link remains usable. The label can update shortly after loading as Firebase restores the session.

No rules deployment is required. No production accounts/data were changed. After GitHub Pages publishes, check the center button while signed out, then sign in and return to the homepage. Actual browser/device verification remains to be done after upload.
