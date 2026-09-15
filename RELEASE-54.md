# Release 54 — waiver and enrollment scrolling

The R51 scrolling correction covered owner/member pages but omitted waiver and enrollment. Both Try a Free Class and Waiver open waiver.html, so both inherited the mobile overflow conflict.

All four account/form pages now use the same document-scrolling rules and request version 54 of the shared styles and navigation scripts. This covers standalone waivers, free-trial waivers and enrollment waivers. On phone widths, the embedded PDF is hidden to avoid consuming page swipes. The existing Open Full Waiver PDF button remains available; visitors read the full unchanged agreement in a separate viewer and return to sign. Desktop inline viewing remains available.

Upload this complete package to the existing site's source, replacing matching files. After GitHub Pages finishes publishing, reload and test both homepage links on a phone: scroll from introduction to agreement, open/return from the full PDF, reach the signature/submit controls, and open/close the navigation menu. No new Firebase rules changes are required beyond the existing R49 setup.

Includes R53 weekday schedule, R52 deletion correction and previous saved-waiver functionality. No live deployment or real waiver submission was performed. Isolated checks cover page references, CSS, scrolling configuration, menu release and mocked form flows; actual phone/browser rendering still needs verification.
