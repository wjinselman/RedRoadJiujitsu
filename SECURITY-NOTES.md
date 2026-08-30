# Security Notes — Red Road Jiu Jitsu

- Firebase web config/API key is client configuration and will be visible in browser source.
- Protection of roster data comes from Firebase Authentication + Firestore Security Rules.
- Keep the Google API key restricted to approved website referrers and required APIs.
- Keep Firebase on Spark with no attached billing account if the desired failure mode is quota exhaustion rather than paid overage.
- Do not add Cloud Functions, realtime listeners, polling, background jobs, or unrestricted collection reads without a new security/billing review.
- Developer authorization is console-managed only.


## Member activation hardening
- Member self-activation creates an Auth identity but does **not** grant portal data access immediately.
- Firebase sends a verification email; the member must verify ownership of the email before Firestore permits self-read access.
- Firestore member self-read also requires `enabled == true` and `archived != true`.
- Staff access remains independent and is controlled by the `owners` / `developers` permission records.
- A member who encounters an existing Auth identity can use password reset to reclaim it through control of the mailbox.
