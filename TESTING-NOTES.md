# Red Road Jiu Jitsu — GitHub Testing Build

This is historical context. See `MOBILE-RELEASE-49.md` for the current release, required Firebase deployment and verification limits.

## Changes in this build
- Added a dedicated iPad attendance kiosk at `kiosk.html` with member name search, four-digit PIN confirmation, duplicate blocking and automatic reset.
- Added staff attendance review/undo, Developer-controlled kiosk access, per-member PIN setup and member attendance history.
- Removed the repository `CNAME` file so this package does not force GitHub Pages toward `redroadbjj.com` during testing.
- Removed the old coaches/purple-belt homepage placement and replaced homepage photo usage with the new supplied photos.
- Added the supplied Bully Proofing Program artwork and a dedicated homepage section with an enrollment link.
- Added `enroll.html` for new-member enrollment.
- Added `waiver.html` for standalone waiver viewing and electronic-signature testing.
- Added the supplied waiver PDF at `assets/red-road-liability-waiver.pdf`.
- Added View / Sign Waiver access from the homepage and member-login flow.

## Important: electronic waiver storage
Release 49 saves standalone waivers to Firebase, alongside the existing Firebase-backed member and trial flows. It requires the included rules and Anonymous Authentication to be enabled. Jeff can find saved records in Signed Waivers and print a signature record plus the original agreement. GitHub Pages only serves the interface; it does not store private signatures. See `MOBILE-RELEASE-49.md` for deployment, retention warnings and remaining live tests.

## GitHub Pages domain testing
This ZIP does not contain a `CNAME` file. If GitHub still redirects to `redroadbjj.com`, clear the Custom domain field in Repository > Settings > Pages while testing. You can add the custom domain back after the domain is purchased and ready.
