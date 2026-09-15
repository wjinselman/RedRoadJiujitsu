# R59 — My Account button wording

Apply over R57/R58 by uploading the included HTML files, mobile-nav.js and member-button.js to the site root, replacing matching files.

The center bottom button reads My Account when Firebase reports a signed-in, non-anonymous account, and opens members.html (the existing member dashboard; approved staff are routed by the existing portal). Signed-out visitors continue to see Sign Up Now, leading to enrollment. The hero free-class action and right-hand Members link are unchanged.

The script cache versions are updated so the new wording loads after publishing. No CSS, login logic, database rules or account data changes are included. This wording change does not resolve the separately reported sign-in issue, whose error message is still needed for diagnosis.

No live deployment was performed.
