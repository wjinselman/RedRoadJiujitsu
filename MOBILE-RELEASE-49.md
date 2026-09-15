# Red Road — Mobile & Saved Waivers Release 49

Built September 15, 2026. This package is not deployed. It supersedes the older testing-build notes where they describe a local-only waiver receipt.

## What changed

- A shared mobile finishing layer across the homepage, local pages, story, member login, staff dashboard, enrollment, waiver and kiosk.
- A smaller mobile crest, self-hosted condensed headline font, tighter section spacing, simplified joining choices, readable cards and swipeable training photos. The dimmed/reframed action-photo hero from the previous release is retained.
- A mobile/tablet menu with keyboard focus containment, Escape/backdrop dismissal, scroll locking and accessible state. Larger touch controls, 16px form inputs, reduced-motion support and visible focus indicators.
- Cleaner staff navigation, roster-first organization, readable mobile member cards and separated member attendance history.
- Duplicate-submit guards, clearer save/load failures, private enrollment details passed through tab storage instead of the URL, and protection against credential forms falling back to URL submission when the Firebase module fails.
- Kiosk PIN clearing, idle reset, duplicate-submit prevention and accurate wording when check-in cannot be confirmed.
- Six lossless WebP equivalents replace 15,928,022 bytes of referenced PNGs with 8,045,662 bytes: about 49.5% less for those six assets. Original PNGs remain in the package. This is not a measured whole-page speed score.

## Jeff's waiver workflow

1. A visitor signs and submits the waiver. The page reports completion only after Firebase confirms the save.
2. Jeff signs in to `owner.html`, opens **Signed Waivers**, and searches by name, email or receipt ID. Use Refresh Waivers for new submissions; use Load More Saved Records when older records are not in the current results.
3. Choose **View / Print**, then **Print / Save Signed Waiver**. The generated PDF contains the stored typed-signature record followed by all 13 pages of the original agreement. Use the browser PDF viewer to print or download it.

No visitor email/share step, email delivery integration, Cloud Functions or added paid service is required. Storage uses the site's existing Firebase project; its existing usage limits still apply. Signed PDFs are generated on demand in the browser, not publicly uploaded. A blocked popup has a separate Open Printable PDF link.

The standalone flow now saves to `waiverSubmissions`. Existing member records remain in `waivers` and trial records in `trialWaivers`. Waiver-only visitors cannot read that collection; approved staff can. The new rules prevent updating a saved standalone signature. Manager deletion permissions and existing member/trial removal workflows are unchanged.

**Retention warning:** the existing Permanent Remove member action deletes its attached waiver, and Remove Trial deletes the signed trial record. Use Disable or mark a trial Completed when you need to keep records. Download necessary signed PDFs before any deliberate permanent removal. This release does not create a separate backup or change the academy's retention policy.

## Required deployment steps

1. Keep a copy of the current site. Extract this complete ZIP and upload its contents to the existing GitHub Pages source, including the new `experience.*`, `ui-utils.js`, `waiver-pdf.js`, `vendor/`, fonts and WebP assets. Do not upload just the HTML. No custom-domain `CNAME` is added.
2. Deploy the included Firestore rules to the existing project. Uploading `firestore.rules` to GitHub alone does **not** deploy it. From this folder with an authorized Firebase CLI session:

   ```sh
   firebase deploy --only firestore:rules --project red-road-jiujitsu
   ```

   Alternatively, paste the complete included rules into Firebase Console → Firestore Database → Rules, review and Publish. Do not replace them with public read/write test rules.
3. Confirm Anonymous sign-in is enabled in Firebase Authentication. The existing trial flow already requires it; waiver-only submissions now use it too. Confirm the actual website hostname is authorized for Authentication.
4. After both deployments, submit a clearly labeled test standalone waiver. Sign in as Jeff from a different device/session, refresh Signed Waivers, open it and print/download its PDF. Test a trial waiver and a new enrollment too. An existing page opened before deployment may need a full reload.

Without the new rules and Anonymous sign-in, standalone submissions are **not** ready. The form will report a save error instead of claiming a local receipt is safely on file. No live rules, settings, accounts, data or website deployment were changed while preparing this package.

## Verification and remaining launch gates

- Passed 30 isolated checks covering all 20 application/content pages, local asset/anchor references, field labels, CSS parsing, menu logic at nine simulated widths, focus behavior, form guards, role-specific UI, escaping, CSV safety, waiver pagination, standalone save behavior, retry handling, enrollment prefill, conditional guardian fields and kiosk behavior.
- Built a 14-page synthetic signed-waiver PDF using the actual bundled browser PDF modules. Inspected the signature-page rendering; all 13 copied agreement pages rendered byte-identically to the originals at the test resolution. Incorrect agreement versions, changed agreement bytes and missing signatures are rejected.
- Browser preview access was blocked in this environment. DOM tests are **not** rendered-layout/device tests. Complete a real iPhone Safari/Android Chrome and tablet pass: menu, keyboard/input zoom, hero crop, form submission, staff controls, PDF opening, printing, landscape and reduced-motion behavior. No Lighthouse score is claimed.
- Firebase writes/auth in the automated suite are mocked; no production account or real waiver was created. The included security rules have not been tested in an emulator or deployed from this environment. Test authorized and unauthorized access before launch.
- The original legal agreement was deliberately not rewritten. It includes an Ardmore location and a blank effective-date line; the site promotes Lone Grove. Have the academy confirm the agreement's details and its signature/retention requirements before relying on it. This is implementation work, not a legal-validity determination.

For repeatable isolated developer checks with a current compatible Node runtime:

```sh
npm install
npm test
npm run test:pdf
```

The PDF test writes a clearly synthetic `redroad-signed-waiver-QA-only.pdf` into the operating-system temporary directory. It is not a customer waiver. Tests are not needed to serve the static website; no production build step was added.
