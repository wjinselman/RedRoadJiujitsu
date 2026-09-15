# Release 56 — signed-in account navigation

The homepage has Try a Free Class beneath the One Path / One Family / One Red Road headline. The mobile bottom bar has one red Sign Up button leading to enrollment. These placements follow the final requested layout.

The free-class links and bottom Sign Up button switch to My Account when Firebase restores a signed-in, non-anonymous account. My Account opens members.html. Signing out restores each original label and destination. Anonymous trial sessions do not get an account button. All R54 waiver/mobile scrolling, R53 schedule and R52 deletion changes are included. This release supersedes the two-button layout described in RELEASE-55.md.

Account labels use Firebase Authentication state only; no member, waiver or roster reads are added to public pages. If authentication cannot load, the normal public links remain usable. The label may update shortly after page load while the session is restored.

Upload this complete package, replacing matching website files. Navigation and shared UI files use fresh version 56 URLs. No new Firestore rules changes are needed beyond the existing R49 setup. No live deployment was performed. Verify signed-out, signed-in and signed-out-again navigation and phone scrolling after publishing.
