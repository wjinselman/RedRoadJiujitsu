# Permanent member deletion fix 52

Upload the website files in this patch to the existing site root, replacing matching files. This includes the R51 mobile scroll fix. No photo changes are included.

Deletion previously reconstructed the member document path from the email address. A legacy record stored under another ID could remain on the server while the UI removed the row. The fix uses the actual Firestore snapshot ID, preserves that ID even if legacy data contains an id field, and verifies member/kiosk/waiver deletion with server-only reads. Roster refresh also requires a server response. Failed verification does not report success.

The HTML requests portal.js?v=52, which requests firebase-client.js?v=52. Upload both scripts as well as the HTML so cached code does not retain the previous behavior.

After GitHub Pages publishes, reload, remove the test member, check the displayed result, then Refresh. No live data was accessed or deleted while preparing this patch; the reported test account's underlying document ID could not be confirmed here.

The existing permanent-remove confirmation still covers deletion of its attached waiver and kiosk entry. This removes the academy's Firestore membership records; it does not delete another user's Firebase Authentication identity or change developer/owner access records. That separate identity must not be confused with a roster row.

No additional rules changes are needed if R49 firestore.rules has already been published. The included rules are unchanged from R49. Tests are isolated; real Firebase/device verification is still required after upload.
