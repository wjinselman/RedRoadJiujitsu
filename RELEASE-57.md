# R57 — R53 layout with page scrolling and center signup button

Built from the exact R53 ZIP, keeping its layout, photos, class schedule, member functions and saved-waiver behavior.

- The homepage hero still says Try One Class Free and opens the free-trial waiver.
- The mobile bottom bar stays three columns: Schedule, Sign Up Now, Members. Only the center button label/destination changed; it now opens enroll.html.
- All application pages use the document as their vertical scroller. This overrides inherited body overflow rules that created an extra scrolling container on mobile. Nested photo galleries, navigation panels and the PDF viewer retain their own controls.
- No automatic My Account button replacement is included. The Members button remains available.
- Every page requests version 57 of shared navigation/styles to avoid mixing cached releases. Existing portal/database scripts stay at the R53 versions.

Upload this complete package to the existing GitHub Pages source, replacing matching files. Wait for publication, then reload. Old account-nav.js left over from R56 is not imported by this release.

No new Firebase rules changes are needed if the included R49 rules were already published. No production data was accessed or changed.

Verification: static asset references, CSS syntax, menu lock release and form logic can be checked with the included isolated tests. Browser/device rendering and touch gestures are not verified in this environment. After publishing, test page scrolling outside and beside the embedded PDF, then reach the signature controls, as well as member/staff pages and enrollment.
