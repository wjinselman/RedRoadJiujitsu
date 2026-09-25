# Red Road paid-date update 52

This update separates the Paid / Unpaid status from the date used to calculate monthly coverage.

## Site files

Replace the matching files at the root of the current Red Road site with the copies in this ZIP:

- `owner.html`
- `members.html`
- `portal.js`
- `billing-model.js`
- `billing-store.js`
- `billing-ui.js`
- `billing-report.js`
- `quick-paid.js`
- `admin-alerts.js`

The member list's Paid / Unpaid control now changes the colored status only. Use Edit to set or change the separate **Paid on date**. A dated payment covers that calendar month and becomes Past Due after month-end in Central time. An entry without a paid-on date stays manually Paid or Unpaid. The dashboard refreshes the status when the Central date changes while it is open, and also recalculates on page load or refresh.

The Paid / Unpaid quick control does not create a payment entry. Saving a Paid on date records it in the monthly payment report.

## Firestore rules

Publish the included `firestore.rules` to the existing `red-road-jiujitsu` Firebase project. The additions allow owners and developers to read and update billing profiles and read or append payment entries; other accounts do not receive access. Follow the Firebase Console or `firebase deploy --only firestore:rules --project red-road-jiujitsu` instructions for the existing project. Uploading the rules file to GitHub alone does not publish Firebase rules.

## Verification

JavaScript syntax, paid-date month-end calculations, manual status behavior, and paid-date form labels were checked. The existing browser test suite could not run because `jsdom` is not installed in this environment.
