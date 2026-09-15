# Red Road Jiu Jitsu — Production Launch Checklist

## Project identity
- Domain: `https://redroadbjj.com`
- Firebase project: `red-road-jiujitsu`
- Primary Owner: Jeff Davis — `redroadjiujitsu@protonmail.com`
- Developer: William Inselman — `wjinselman@gmail.com`
- Authentication: Email/Password + Anonymous trial submissions
- Firestore: Standard edition

## Billing guardrail
Keep this Firebase project on **Spark** and do **not attach a Cloud Billing account**.
The portal intentionally uses no Firestore realtime listeners, no polling, no Cloud Functions, no automatic retry loops, and no background writes.

## Access records that must exist
### `owners/redroadjiujitsu@protonmail.com`
Fields: `email`, `name`, `enabled`, `createdAt`, `updatedAt`.

### `developers/wjinselman@gmail.com`
Fields: `email`, `name`, `enabled`, `createdAt`, `updatedAt`.

Developer records are console-managed only. Browser code cannot create/elevate a Developer.

### iPad kiosk account
- Create or use one real recovery inbox, recommended: `redroadcheckin@gmail.com`.
- In the Developer dashboard, approve it under **iPad Kiosk Access**.
- Open `kiosk.html` on the iPad and use **First setup? Activate approved kiosk** once.
- The kiosk role can read only the limited check-in directory and create attendance. It cannot read member profiles or waivers.

## Authentication users that must exist
- `redroadjiujitsu@protonmail.com`
- `wjinselman@gmail.com`

No Google account linking is required.

Enable **Anonymous** under Firebase Authentication → Sign-in method. The free-trial waiver uses a short-lived anonymous session so a visitor can submit a signed waiver without creating a member password or receiving member access.

## Security rules
Publish the included `firestore.rules` before production use.
Current rules:
- deny unlisted paths by default;
- let members read only their own member document;
- let Owner/Developer staff query members only with an explicit maximum limit of 250;
- let only Developers query/manage Owner access, capped at 50;
- allow staff to permanently delete a member roster document, kiosk entry and attached waiver;
- prohibit browser/client creation, modification, listing, or deletion of Developer access.
- limit kiosk accounts to the check-in directory and append-only attendance creation;
- allow anonymous visitors one append-only free-trial waiver write with no read access;
- give each free-trial pass a 30-day eligibility window while retaining the signed waiver as staff-only proof;
- let staff review/delete attendance and members view only their own history.

## Database usage behavior
- Member page: bounded one-document access checks/read plus explicit contact-profile updates.
- Staff page: one-time access checks plus bounded member, kiosk-directory and attendance queries.
- Developer additionally loads one bounded owner query.
- Refresh happens only when the staff member presses Refresh.
- Add/edit/enable/disable: one explicit atomic batch that keeps the member and kiosk directory in sync.
- Remove: one explicit atomic delete batch plus one verification read.
- Password changes and password-reset emails use Firebase Authentication, not Firestore.
- No `onSnapshot()`.
- No polling.
- No database timers.
- No Cloud Functions.

## Attendance setup and use

Current release: members check in on their own phones. Print the QR image at
`assets/red-road-check-in-qr.png`; it opens
`https://redroadbjj.com/checkin.html`. A verified, active member signs
in and presses **Check In**. Staff review or undo attendance in the dashboard.
The deterministic attendance record blocks a second check-in for the same
member, class and date.

The shared iPad kiosk is retained only as inactive fallback code. Its launch
flag is `kioskAttendance: false` in `launch-config.js`; do not configure a
kiosk account unless that feature is deliberately restored.
1. Deploy the included Release 61 Firestore rules with the website.
2. Download the QR image from the staff Attendance card and print it for the entrance.
3. Confirm an active member can scan, sign in and press **Check In**.
4. Confirm a second press is rejected as a duplicate.
5. Tuesday/Thursday records are labeled No-Gi automatically; Kids plans record Kids class and other plans record Adult class.
6. Confirm staff can review today’s attendance and undo a mistake.

## Member behavior
1. Staff adds a member roster record first.
2. Member uses the normal Member Login page.
3. First-time activation creates Email/Password Auth only when the exact email is on the roster; an unapproved activation is deleted immediately when possible.
4. Member can view rank, belt stripes, plan, joined date, paid/current status, active status, portal-enabled status and their signed waiver record.
5. Members can update only phone, address, emergency contact, guardian and household email fields.
6. Members cannot change their own rank, plan, payment, active, portal or waiver status in Firestore.
7. Belt and stripes are coach-controlled. Stripes are constrained to integer `0–4`.

## Disable vs Remove
- **Disable** keeps the Firestore member record and turns portal access off.
- **Remove** permanently deletes the Firestore member record, kiosk entry and attached waiver, then verifies the member document is gone.
- On the Spark/no-backend architecture, another user's Firebase Authentication identity cannot be securely Admin-deleted by browser code. A removed member's dormant Auth identity may therefore remain, but without a member document it has no member portal access.
- If a removed person is later re-added, they may need to sign in with/reset the existing Auth password rather than activate a brand-new Auth identity.

## Smart login routing
- Normal Member Login is the single front door.
- Developer account routes to `owner.html` with Developer controls.
- Owner account routes to `owner.html` with Owner controls.
- Normal members stay in `members.html`.

## Domain launch
Before going live:
1. Register/configure `redroadbjj.com` with the host.
2. Testing builds intentionally contain no `CNAME`; use `https://wjinselman.github.io/RedRoadJiujitsu/` until the domain is purchased and configured.
3. Firebase Authentication → Settings → Authorized domains: add `redroadbjj.com` and `www.redroadbjj.com` if used.
4. Google Cloud API key → Website restrictions: include `https://redroadbjj.com`, `https://redroadbjj.com/*`, and the www versions if used.
5. Keep temporary GitHub Pages restrictions until the custom domain is fully tested.
6. Confirm HTTPS and redirect behavior.
7. Submit `https://redroadbjj.com/sitemap.xml` to Google Search Console after launch.

## Mandatory real-world smoke test
Use one disposable test member and verify:
- Developer login and auto-route;
- Jeff Owner login and auto-route;
- add member;
- first-time member activation;
- member dashboard rank + stripes + paid/active status;
- member contact/emergency profile update without access to staff-controlled fields;
- member and staff signed-waiver detail view;
- roster status/program filters and CSV export;
- edit member;
- disable then re-enable portal;
- owner-triggered password-reset email;
- member Forgot Password;
- staff own-password change;
- permanent Remove;
- removed member cannot regain member portal access simply by signing in.
- approve and activate the dedicated kiosk account;
- assign a four-digit PIN to the test member;
- successful kiosk check-in and automatic reset;
- wrong-PIN rejection and duplicate-check-in rejection;
- staff attendance review/undo and member-only attendance history.

## Production snapshot
Once the smoke test passes, archive this exact package as the known-good production baseline before further feature work.


## Member activation hardening
- Member self-activation creates an Auth identity but does **not** grant portal data access immediately.
- Firebase sends a verification email; the member must verify ownership of the email before Firestore permits self-read access.
- Firestore member self-read also requires `enabled == true` and `archived != true`.
- Staff access remains independent and is controlled by the `owners` / `developers` permission records.
- A member who encounters an existing Auth identity can use password reset to reclaim it through control of the mailbox.
