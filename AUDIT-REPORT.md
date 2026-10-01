# Red Road release audit

## Outcome

A complete candidate was assembled from the September 25 full source and subsequent saved payment patches. The error board and confirmed code/rules fixes were implemented locally. No live accounts, member records, payments, waivers, or website deployments were changed.

## Confirmed fixes

1. **Missing diagnostics:** added a Developer-only error board with bounded sanitized reports, explicit resolution/reopening, manual refresh and export. Both UI and Firestore permissions are tested.
2. **Member billing permission mismatch:** member code requested billing data that rules denied. Rules now permit a verified enabled member's own profile and explicitly linked family payer, with no collection-wide or write access.
3. **Developer check-in mismatch:** the app emitted `developer-test` records that rules rejected. Rules now accept correctly labeled self-test records during the class window while rejecting member impersonation.
4. **Attendance duplication/clock trust:** rules now enforce the canonical member/date/class ID and phone check-in class windows in Central time. This prevents arbitrary duplicate IDs and outside-window or wrong-day submissions.
5. **Unverified privileged identity:** Owner, Developer and kiosk privileges now require verified email; the corresponding sign-in paths provide verification guidance. An unverified account cannot read an existing private waiver. Enrollment requires a verified account and a matching signed waiver in the atomic write.
6. **Overbroad developer writes:** Developer member writes now receive schema checks. Billing profiles and append-only payments now receive field/type/size/timestamp checks.
7. **Whole-record overwrite on access toggle:** Enable/Disable now writes only `enabled` and `updatedAt`, avoiding overwriting unrelated changes with a stale roster copy.
8. **Account transition races:** billing caches and private dashboard content clear on account changes; late authorization, roster/waiver/attendance reads and profile completions are guarded. Payment cache updates check the actor still matches.
9. **Stale family dependency lookup:** changing/removing a family payer queries current linked profiles and confirms existing child memberships instead of relying on an incomplete cached map.
10. **False waiver failure after save:** print-helper failure cannot turn a confirmed saved waiver into a “not saved” message or encourage another submission.
11. **Unobservable handled errors:** major handled portal, billing, enrollment, waiver and attendance failures feed sanitized diagnostics. Diagnostic failures are swallowed internally and never recursively logged.
12. **Old unsafe prototypes:** retired `enroll.js` and `waiver.js` stop obsolete pages from saving enrollment/password/form details or signatures in local storage. Current pages use the production modules. Existing historical browser storage was not erased.
13. **Stale asset/deployment exposure:** consistent cache identifiers, JavaScript revalidation headers for Firebase Hosting, and exclusions for tests, audit evidence, ZIPs and the incomplete old `website/` duplicate. Hosting outside Firebase needs its own header configuration.

## Final verification results

| Suite | Result | What it demonstrates |
|---|---:|---|
| Unit/DOM/model suite | 75 passed | Navigation, form guards, roles, roster escaping, CSV protections, waiver flows, pagination, deletion confirmation, payment dates, diagnostics, account-switch guards, retired prototypes |
| Real Firestore emulator suite | 70 passed | Read/write role boundaries, verified email, own/family billing, schema rejection, private waivers, atomic signup, immutable payments, diagnostics privacy/throttling, actual shipped payment transactions |
| Rules clock suite | 17 passed | Summer/winter offsets, spring/fall transition weeks, midnight rollover, class start/end boundaries, Tue/Fri No-Gi, wrong date and weekend denial |
| Payment browser workflow | 27 passed | Actual Chromium calendar, save/cancel/retry/double-submit, original edit/toggle behavior, family inheritance, role controls and phone-width fit |
| Chromium page/layout smoke | 98 passed | 24 current pages at 390 and 1440 pixels, no JavaScript page errors or horizontal viewport overflow; Developer board visibility checked |
| Signed PDF check | Passed | Fictional 14-page output; original 13-page agreement hash unchanged; wrong agreement/version and missing signature rejected |
| Syntax/import/reference checks | Passed | All 33 root first-party JS files parse; first-party module imports resolve; page asset references and IDs checked in UI suite |

The four stress-test cases include 4,800 independently checked month boundaries and reconciliation of 1,000 payment receipts against exact integer-cent totals. The diagnostics flood test submits 10,000 identical events and another 1,000 varied events, checking bounded memory and at most ten upload attempts.

The emulator also runs the actual shipped payment function with its Firebase imports mapped to an isolated SDK connection. Two competing transactions create one receipt; resaving the same date does not append another; a forbidden receipt overwrite causes the associated member change to roll back. The VM adapter normalizes cross-realm plain objects for the SDK and does not mock the transaction engine.

The older saved UI suite initially failed 17 of 42 tests, chiefly because its harness could not load newer modules and several fixtures expected obsolete labels, dates or function names. The harness and fixtures were updated to exercise current code. Actual functional assertions were retained or adjusted to the current explicitly documented behavior. Final results above are from the updated candidate.

## Coverage map

| Area | Files/path groups | Verification |
|---|---|---|
| Identity and access | Firebase clients, email-setup, portal role checks, account navigation, rules | Code review, DOM tests, emulator role/verification tests |
| Membership and roster | portal, rank-model, ui-utils | Schema/field review, partial access update, UI guards, injection/CSV, deletion checks |
| Dues and receipts | billing-model/store/ui/report, quick-paid, paid-date, admin-alerts | Model stress, mocked failures, real emulator transactions, Chromium interactions |
| Attendance | checkin, kiosk, class-schedule, attendance-month, top-attendance | Check-in DOM tests, scoped permissions, canonical IDs, clock-helper rules tests |
| Enrollment and waivers | enroll-prod14, waiver-prod14, waiver-pdf, retired prototype entry points | Save/failure/double-submit tests, atomic rules tests, signed PDF generation |
| Public pages and navigation | 24 current pages, styles, mobile-nav, experience, dashboard-sections, analytics | Local-reference/DOM checks and Chromium phone/desktop smoke tests; analytics consent code reviewed |
| Diagnostics | diagnostics.js/css, owner markup, client connection, rules | Privacy/flood/race/resolve tests, emulator authorization and bounded writes, visual inspection |

## Limits and unresolved operational risks

- This is a tested candidate, not a guarantee of defect-free software or a claim that every possible combination was exercised.
- No physical iPhone/iPad, Mobile Safari, installed home-screen app, actual email delivery, production Firebase settings/indexes, or live staff-account flow was tested. Chromium phone-sized rendering is not Safari testing. WebKit installation was unavailable in this environment.
- The live deployment may contain changes or rules not present in the saved September 25 source. Compare your deployed version before replacing files.
- Diagnostics cover verified signed-in clients remotely. Signed-out/module-bootstrap failures stay local. Ten slots per account can collide or be overwritten, and a report-count limit is not a project-wide cost ceiling.
- Public anonymous trial/standalone-waiver submissions remain part of the existing design. Rules validate submissions but are not a full anti-bot service. Firebase project-level App Check, authentication quotas and usage monitoring were not changed or verified.
- The dedicated kiosk is a trusted authenticated device. Its four-digit PIN is a client-side convenience check, not an independent server-authenticated identity factor. Keep kiosk credentials private; shared kiosk remains disabled by default.
- Family reassignment/deletion prechecks now use fresh reads, but cross-document relationship locking across simultaneous independent staff actions would require a larger data-model change. Staff should not simultaneously reassign a family and delete its payer.
- Hard deletion intentionally preserves historical attendance/payment entries and billing sequencing. This work does not introduce a data retention policy or a backup/restore service. No production data backup or restore rehearsal was performed.
- A changed Paid on date still records a new receipt, as the existing September 25 design specifies. It is not a receipt-correction tool.
- Ordinary Firestore writes may remain pending while offline; this release does not add offline enrollment or promise a successful save before server acknowledgement. Physical-device interruption/reconnect checks remain a rollout gate.
- Bundled third-party PDF/font libraries were exercised through signed PDF tests, not independently audited line by line. Production modules still use the saved Firebase 12.18.0 CDN imports; emulator tests used the installed Firebase 12.19.0 SDK and a Java-17-compatible Firestore emulator.

## References used for test setup

- https://firebase.google.com/docs/firestore/security/test-rules-emulator
- https://firebase.google.com/docs/reference/rules/rules.Timestamp_
- https://firebase.google.com/docs/reference/rules/rules.timestamp_

The bundled production rules do not contain the test-only clock endpoint. All test member identities are fictional `test.invalid` / `example.invalid` addresses.
