# Security Notes — Red Road Jiu Jitsu

- Firebase web config/API key is client configuration and will be visible in browser source.
- Protection of roster data comes from Firebase Authentication + Firestore Security Rules.
- Keep the Google API key restricted to approved website referrers and required APIs.
- Keep Firebase on Spark with no attached billing account if the desired failure mode is quota exhaustion rather than paid overage.
- Do not add Cloud Functions, realtime listeners, polling, background jobs, or unrestricted collection reads without a new security/billing review.
- Developer authorization is console-managed only.
- The iPad uses a dedicated `kiosks` role and a separately named Firebase app session. It cannot read the `members` or `waivers` collections.
- The kiosk can read only `checkInDirectory` fields needed for check-in and can create, but not edit/delete, attendance records.
- Four-digit PINs are never stored as plaintext; the directory stores a salted SHA-256 comparison hash. This is a practical front-desk deterrent, not high-assurance identity verification.
- Use iOS Guided Access on the check-in iPad and keep the kiosk account password private.


## Member activation hardening
- Member self-activation creates an Auth identity but does **not** grant portal data access immediately.
- Firebase sends a verification email; the member must verify ownership of the email before Firestore permits self-read access.
- Firestore member self-read also requires `enabled == true` and `archived != true`.
- Developer and owner access remain independent in the `developers` / `owners` permission records. Coach access is an explicit flag on a verified, active member record so waivers and attendance stay linked to one identity.
- Only developers can create owners. Owners can grant or revoke coach access while editing members; coaches receive read/review access but cannot modify or delete member records.
- A member who encounters an existing Auth identity can use password reset to reclaim it through control of the mailbox.
