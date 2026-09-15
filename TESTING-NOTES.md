# Red Road Jiu Jitsu — GitHub Testing Build

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
The form flow is fully testable on static GitHub Pages and creates a local/downloadable signed receipt. GitHub Pages is static hosting and is not a suitable legal-record database by itself. Before treating these signatures as the academy's production records, connect the submit action to secure server-side/Firebase storage and review the final electronic-signature workflow with the academy's attorney.

## GitHub Pages domain testing
This ZIP does not contain a `CNAME` file. If GitHub still redirects to `redroadbjj.com`, clear the Custom domain field in Repository > Settings > Pages while testing. You can add the custom domain back after the domain is purchased and ready.
