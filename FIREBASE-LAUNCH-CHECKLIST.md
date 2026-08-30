# Red Road Jiu Jitsu — Launch Checklist

## Current project

- Firebase project: `red-road-jiujitsu`
- Web app: Red Road Website
- Primary Owner: Jeff Davis — `redroadjiujitsu@protonmail.com`
- Developer: William Inselman — `wjinselman@gmail.com`
- Authentication: Email/Password
- Firestore: Standard edition

## Billing guardrail

Keep this project on **Spark** and do **not attach a Cloud Billing account**.
The portal intentionally uses no Firestore realtime listeners, no polling, no Cloud Functions, no automatic retry loops, and no background writes.

## Firestore access records

The following records should already exist:

### `owners/redroadjiujitsu@protonmail.com`

- `email` string: `redroadjiujitsu@protonmail.com`
- `name` string: `Jeff Davis`
- `enabled` boolean: `true`
- `createdAt` timestamp
- `updatedAt` timestamp

### `developers/wjinselman@gmail.com`

- `email` string: `wjinselman@gmail.com`
- `name` string: `William Inselman`
- `enabled` boolean: `true`
- `createdAt` timestamp
- `updatedAt` timestamp

Developer records are console-managed only. The website cannot create or elevate a Developer.

## Authentication users

Firebase Authentication → Users should contain:

- `redroadjiujitsu@protonmail.com`
- `wjinselman@gmail.com`

No Google account linking is required. Both use Email/Password Auth.

## Security rules

Publish the included `firestore.rules` before real member data is entered.
The rules:

- deny everything by default;
- let a member read only the member document matching their authenticated email;
- let Owner/Developer staff load the member roster only with an explicit limit of 250;
- let only Developer accounts load/manage Owner access, capped at 50 records;
- prohibit client-side document deletion;
- prohibit any browser/client creation or modification of Developer access.

## Firestore usage behavior

- Member login/session restore: one member-document read.
- Staff access check: Developer document check; Owner document check only if not Developer.
- Owner dashboard: one bounded member query, maximum 250 documents.
- Developer dashboard additionally: one bounded Owner query, maximum 50 documents.
- Refresh happens only when the staff member presses Refresh.
- Add/edit/enable/disable/remove: one explicit Firestore write per action.
- Password changes/reset emails use Firebase Authentication, not Firestore.
- No `onSnapshot()`.
- No polling.
- No `setInterval()` database activity.
- No Cloud Functions.
- No destructive member delete button.

## Member workflow

1. Jeff or William signs into `owner.html`.
2. Add a member with name, email, plan, rank, join date, paid/current, active, and portal-enabled state.
3. Member opens `members.html`.
4. First-time member enters the exact roster email and chooses a password, then activates the account.
5. Returning member signs in normally.
6. Member sees rank, plan, join date, Active/Inactive, and Paid/Past Due status only.
7. Staff can send a password-reset email from the member row.

## Owner / Developer workflow

Jeff (Owner) can:

- add/edit/disable/remove members;
- enable/disable member portal access;
- change rank/plan/status;
- mark Paid/Past Due and Active/Inactive;
- view roster percentages;
- manually refresh the roster;
- send member password-reset emails;
- change his own password.

William (Developer) can do everything an Owner can, plus:

- load Owner/Coach access;
- add Owner/Coach access;
- enable/disable Owner/Coach access.

Developer elevation remains Firebase-console-only.

## Before custom domain launch

1. Test Jeff Owner sign-in.
2. Test William Developer sign-in and confirm the Developer Access panel appears.
3. Add one test member.
4. Activate that member account from `members.html`.
5. Verify rank, payment and Active status display correctly.
6. Test member password reset and Jeff's password change.
7. Disable the test member and verify the portal shows disabled status.
8. Disable/enable the test member, then permanently remove a disposable test member.
9. Firebase Authentication → Settings → Authorized domains: add the purchased domain when known.
10. Connect the domain to the chosen static host and retest password-reset links on the real domain.

## Hosting

The site is static and can be deployed to GitHub Pages or Firebase Hosting. The Firebase backend does not need to move when the domain changes. Keep links relative (`members.html`, `owner.html`, etc.).

## Coach-controlled ranks
Member rank is staff-managed only. Each member document stores `rank` (belt) plus `stripes` (integer 0–4). Members can read their own rank but cannot edit their Firestore member record.
