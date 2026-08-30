# Red Road Jiu Jitsu — Launch Checklist

This portal is intentionally designed to stay small and predictable.

## Non-negotiable billing setup

1. Create a dedicated Firebase project for Red Road Jiu Jitsu.
2. Keep it on the **Spark (no-cost) plan**.
3. **Do not attach a Cloud Billing account.**
4. Use **one Cloud Firestore Standard database only**.
5. Do not enable TTL, backups/PITR, Cloud Functions, Cloud Run, Pub/Sub, or other paid Google Cloud services for this project.

On Spark, exceeding a no-cost quota can interrupt the service, but there is no pay-as-you-go Firestore bill because no billing account is attached.

## 1. Register the web app

Firebase Console → Project settings → Your apps → Add Web App.

Copy the Firebase config into `firebase-config.js`.

## 2. Authentication

Firebase Console → Authentication → Sign-in method → enable **Email/Password** only.

No phone auth is required.

## 3. Firestore

Create one **Standard edition** Cloud Firestore database in Production mode.

Deploy the included rules:

```bash
firebase deploy --only firestore:rules
```

The rules intentionally:

- deny everything by default;
- permit owners only when their authenticated email is listed in `owners`;
- permit a member to read only the member document matching their own email;
- cap owner roster queries at 250 documents;
- prohibit client-side document deletes;
- prohibit members from writing their own status/rank/payment data.

## 4. Add Jeff Davis as Owner

Firestore Console → create collection: `owners`

Create one document whose **document ID is Jeff's lowercase email address**. Example:

`jeff@example.com`

Fields:

- `name` (string): `Jeff Davis`
- `enabled` (boolean): `true`

That's it. Owner documents cannot be created or changed by the website itself.

Jeff then opens `owner.html`, enters that same email and a password, and clicks **Activate owner account** the first time.

## 5. Member workflow

Jeff opens Owner → **Add Member** and enters the member's email, name, plan, rank and status.

The member then opens `members.html`, enters that same email plus a password, and clicks **Activate account**.

The member sees only:

- current rank;
- membership plan;
- Active / Inactive status;
- Paid / Current or Past Due;
- join date.

## Firestore usage behavior

There are intentionally no repeating database operations.

- Member login/session restore: one member document read.
- Owner access check: one owner document read.
- Owner dashboard load: one roster query, capped at 250 documents.
- Manual Refresh: one additional capped roster query only when clicked.
- Add/edit/enable/disable/archive: one explicit member document write per action.
- No `onSnapshot()`.
- No polling.
- No `setInterval()` database calls.
- No Cloud Functions.
- No automatic background writes.
- No destructive member deletes from the website.

## 6. Hosting / domain

The included `firebase.json` is ready for static Firebase Hosting.

From inside this folder:

```bash
firebase login
firebase use --add
firebase deploy --only hosting,firestore:rules
```

Then connect the purchased domain in Firebase Hosting → Add custom domain.

## Pre-launch test

Before pointing the domain at the site, verify:

- Jeff can activate/sign in at `owner.html`.
- Jeff can add a test member.
- Test member can activate/sign in at `members.html`.
- Rank changes appear after member signs back in / refreshes the page.
- Paid, active and enabled toggles display correctly.
- Disabled member sees the disabled message.
- Archive removes a member from active statistics.
- Jeff can change his own Owner password from Account Security.
- Jeff can send a password-reset email to a roster member from the Owner dashboard.
- Member self-service password reset emails arrive.
- Unauthorized email cannot open Owner.
- Unauthorized member email cannot activate into a roster account.



## Password handling

Passwords never go into Firestore. Firebase Authentication owns password storage and reset delivery.

- Staff can change their own password from Owner → Account Security. The UI re-authenticates with the current password first.
- Staff can send a reset email only for a member already present in the loaded roster.
- Members can also use Forgot password on the Member login page.
- The Owner never sees a member's existing password and cannot retrieve it.
- Password reset actions do not perform Firestore reads or writes.
