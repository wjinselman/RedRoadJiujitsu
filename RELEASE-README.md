# Red Road — diagnostics and hardening candidate

Prepared September 30, 2026 (America/Chicago). Complete site package, not a small patch. No production deployment, live login, or live database changes were performed.

## Source recovered from history

The base is the September 25 upload `SCROLL-FIX-51.zip`, followed by `RedRoad-Paid-Date-Update-52.zip` and `RedRoad-Click-Date-Calendar-53.zip`. The differently named full upload contains the newer ranking, attendance, account setup, and billing modules. The September 15 R57 package was inspected but NOT used as the final base.

## Developer error board

Sign into the staff dashboard with your enabled, verified Developer account. Select **Errors**, then **Refresh errors**. Owners, coaches, members and kiosks cannot read these reports; Firestore enforces that boundary.

Reports show error category, operation, page, source file/line when available, browser/device category, build, last report time and page-session occurrence count. Expand details, mark resolved or reopen, include resolved reports, and export the sanitized details. Refresh preserves expanded entries. A fresh report reopens a recurring issue. Reload alone does not claim an issue is fixed.

Logging cannot block a business save. It never sends raw messages, full stacks, URLs/query strings, names, emails, passwords, signatures, or form contents. The database uses an authenticated UID to associate reports; exported reports omit that UID. Only verified signed-in sessions upload reports. Signed-out failures remain in that page's memory and are not a remote visitor-monitoring service.

Usage is bounded: ten hash-selected report slots per account, at most ten upload attempts per page session, one write per slot per minute enforced in rules, and manual queries limited to the latest 100 reports. Different errors/devices using the same account can overwrite a slot; this is a compact diagnostics board, not a complete historical event archive. Counts are per page session. There are no diagnostic polling loops, realtime listeners, new Cloud Functions, or billing-plan changes.

## Important rollout changes

- Owner, Developer and kiosk privileges now require verified email. If a staff/kiosk account has never verified its address, the new sign-in flow sends a verification email. Open the link and sign in again. Existing usernames/passwords are unchanged. Member signup must also use a verified account before saving the membership and signed waiver together.
- Phone check-in dates, class names, class windows and duplicate document IDs are enforced by rules. The server applies Central time, including current US daylight-saving transitions. Kiosk check-in remains a separately authorized front-desk workflow.
- Member access to billing is limited to their own profile and, for a covered family member, their specifically linked payer. Members cannot list billing profiles or edit them.
- Developer roster writes now use the same schema validation as owner writes. Legacy malformed records may need correction in the Firebase console before they can be edited.

## Deploy through your existing site workflow

1. Keep a backup of the currently deployed source and export/copy the currently active Firestore rules. This archive was assembled from saved source, not downloaded from the live deployment.
2. Replace matching root website files with this package's site files using the existing Red Road hosting/repository workflow. Do not publish the `tests` or `audit` folders. The old nested `.zip` and incomplete `website/` duplicate from the upload are intentionally excluded. Do not leave backup ZIPs on the public website.
3. From this site's root, publish the supplied rules to the existing project:

   ```bash
   firebase deploy --only firestore:rules --project red-road-jiujitsu
   ```

   Uploading `firestore.rules` to GitHub does not publish database rules. Do not use an unrelated Cattle Handler project or deploy the empty saved index configuration over your live indexes.
4. Reload the site on staff devices. First-party script and stylesheet references share a new cache identifier. Firebase hosting headers are provided, but GitHub Pages or other hosting will use its own header configuration.
5. Check Developer, Jeff/Sabrina Owner and ordinary Member sign-in. Verify that the error board is visible only for Developer. Use a test account for enrollment/waiver/check-in. For payment smoke testing, reuse an already saved date to avoid creating an unintended new receipt. Check that status survives reload.

## Local verification

`npm ci` installs development/test dependencies only; this remains a static site.

- `npm test`: DOM/UI, payment, diagnostics and model stress tests.
- `npm run test:pdf`: creates a fictional signed-waiver packet and checks signature/agreement protections.
- `npm run test:browser`: Chromium page-load and responsive-layout smoke tests. Run `npx playwright install chromium` first, or set `CHROMIUM_PATH` to an installed Chromium binary. Optional `REDROAD_TEST_OUTPUT` controls evidence location.
- `tests/paid-date-browser.py`: 27 browser workflow checks; requires Python `beautifulsoup4` and `playwright`, with `CHROMIUM_PATH` available if needed.
- `FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 npm run test:security`: run only while an isolated Firestore emulator is listening on that address. Tests use `demo-redroad-audit` and `demo-redroad-clock`, never the real project. The clock suite adds a test-only read endpoint to exercise the shipped helper at fixed dates; that endpoint is not in the supplied production rules. Current Firebase CLI versions may require Java 21.

See `audit/AUDIT-REPORT.md` for results, coverage, and remaining limits.

## October 1 member setup clarity update

Homepage and mobile navigation now prioritize setting up a member account, with a separate sign-in action. Existing students get a short explanation; trial visitors still go directly to the trial waiver without an account. Account setup wording is consistent. Authentication, email verification, enrollment, waiver saving and database rules are unchanged. First-party asset cache references were refreshed.

Validation for this wording update: changed JavaScript syntax and local HTML link targets passed. Browser layout and DOM suites could not run in this environment because Chromium and jsdom are not installed; the earlier audit describes the previous build. No live signup was performed.

## Signed-in mobile navigation cleanup

Signed-in visitors see Schedule and My Account in the bottom bar. The redundant Sign In action is hidden and the two remaining buttons fill the row. The adjacent homepage sign-in action is also hidden while signed in. Signing out restores the setup/sign-in choices. Auth-state behavior was checked with a mocked subscription; live-browser layout remains unverified in this environment.
