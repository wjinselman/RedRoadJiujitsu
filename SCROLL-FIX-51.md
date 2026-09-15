# Mobile account scrolling fix 51

Upload the five website files in this patch to the existing R49 site, replacing their matching files: owner.html, members.html, experience.css, experience.js and mobile-nav.js. No photo changes are included.

Account pages now use document scrolling instead of the inherited horizontal-overflow rule that can establish an extra scrolling container. Global smooth scrolling is disabled on account pages. Status updates no longer move the viewport. Opening panels on touch devices no longer automatically focuses inputs and summons the keyboard. Menu dismissal and page restoration release both document and body scroll locks.

The account HTML requests version 51 of the changed styles/scripts to avoid stale cached files. After GitHub Pages publishes, reload and check a long roster, scrolling from the middle of a member card, an opened edit panel, and opening/closing the menu. Real-device behavior has not been verified in this environment.

## Firebase rules

The included firestore.rules is the unchanged R49 rules file. In Firebase Console, select red-road-jiujitsu, open Firestore Database > Rules, replace the existing contents with this complete file and Publish. Alternatively, from the full R49 project folder:

```sh
firebase deploy --only firestore:rules --project red-road-jiujitsu
```

The small patch does not include firebase.json; use the Console or the full project folder for rules deployment. Also confirm Anonymous sign-in is enabled for standalone/trial waivers. These rules enable waiver storage; they do not affect scrolling. Uploading a rules file to GitHub alone does not publish Firebase rules.

No live site or Firebase settings were changed while preparing this patch.
