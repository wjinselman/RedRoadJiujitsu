# Red Road Jiu Jitsu — Production Launch Checklist

## Project identity
- Domain: `https://redroadbjj.com`
- Firebase project: `red-road-jiujitsu`
- Primary Owner: Jeff Davis — `redroadjiujitsu@protonmail.com`
- Developer: William Inselman — `wjinselman@gmail.com`
- Authentication: Email/Password
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

## Authentication users that must exist
- `redroadjiujitsu@protonmail.com`
- `wjinselman@gmail.com`

No Google account linking is required.

## Security rules
Publish the included `firestore.rules` before production use.
Current rules:
- deny unlisted paths by default;
- let members read only their own member document;
- let Owner/Developer staff query members only with an explicit maximum limit of 250;
- let only Developers query/manage Owner access, capped at 50;
- allow staff to permanently delete member roster documents;
- prohibit browser/client creation, modification, listing, or deletion of Developer access.

## Database usage behavior
- Member page: bounded one-document access checks/read only.
- Staff page: one-time access checks plus one bounded member query.
- Developer additionally loads one bounded owner query.
- Refresh happens only when the staff member presses Refresh.
- Add/edit/enable/disable: one explicit Firestore write per action.
- Remove: one explicit Firestore delete.
- Password changes and password-reset emails use Firebase Authentication, not Firestore.
- No `onSnapshot()`.
- No polling.
- No database timers.
- No Cloud Functions.

## Member behavior
1. Staff adds a member roster record first.
2. Member uses the normal Member Login page.
3. First-time activation creates Email/Password Auth only when the exact email is on the roster; an unapproved activation is deleted immediately when possible.
4. Member can view rank, belt stripes, plan, joined date, paid/current status, active status and portal-enabled status.
5. Members cannot change their own rank/status in Firestore.
6. Belt and stripes are coach-controlled. Stripes are constrained to integer `0–4`.

## Disable vs Remove
- **Disable** keeps the Firestore member record and turns portal access off.
- **Remove** permanently deletes the Firestore member record and removes the person from roster/stats.
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
2. This package includes `CNAME` containing `redroadbjj.com` for GitHub Pages.
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
- edit member;
- disable then re-enable portal;
- owner-triggered password-reset email;
- member Forgot Password;
- staff own-password change;
- permanent Remove;
- removed member cannot regain member portal access simply by signing in.

## Production snapshot
Once the smoke test passes, archive this exact package as the known-good production baseline before further feature work.


## Member activation hardening
- Member self-activation creates an Auth identity but does **not** grant portal data access immediately.
- Firebase sends a verification email; the member must verify ownership of the email before Firestore permits self-read access.
- Firestore member self-read also requires `enabled == true` and `archived != true`.
- Staff access remains independent and is controlled by the `owners` / `developers` permission records.
- A member who encounters an existing Auth identity can use password reset to reclaim it through control of the mailbox.
