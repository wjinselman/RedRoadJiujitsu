# Red Road — click-to-set paid date (patch 53)

Apply this small patch ON TOP OF RedRoad-Paid-Date-Update-52.
This is not a full-site replacement. It was prepared from the saved update-52
source, not downloaded from or deployed to the live site.

## Install

Keep a backup of the current owner.html and portal.js. Upload these FOUR files
to the same site-root folder that already contains owner.html:

- owner.html — replacement; loads the new portal version and adds the date dialog.
- portal.js — replacement; makes eligible payment badges clickable.
- paid-date.js — new; date picker and transaction using the existing billing model.
- paid-date.css — new; badge interaction and the compact date dialog.

Keep every other current site file. The tests folder and this README are optional
local developer materials and do not need to be uploaded to the website.

After the normal site deployment finishes, reload the owner dashboard. The page
requests portal.js?v=88-paid-date-calendar to avoid the old browser-cached entry.
No deployment was performed while preparing this patch.

## Use

Click the payment/date badge in a member's row (for example, PAID · THROUGH ...,
PAID · DATE NOT SET, or PAST DUE). The Paid on date calendar opens without entering
the full Edit form. An existing saved date is prefilled; an undated member stays
blank until you choose a date. Select the actual payment date and press Save date.
Cancel or Escape before saving makes no changes.

The preview shows the calculated paid-through and next-due dates. Saving uses
update 52's calendar-month coverage and the existing Central-time expiry logic.
Saving an older month can therefore leave a member showing Past Due today.
The separate Paid/Unpaid button remains the existing manual status toggle.

Owner and Developer access is required, matching existing payment editing.
Payment-exempt, archived, and family-covered records do not get a direct-date
button. Set a family's date on its payer; covered members inherit that status.
In a browser without automatic showPicker support, the standard date field is
still available with the browser's own input/calendar control.

## Payment-report behavior (unchanged from Edit)

This shortcut uses the existing planSave function, categories, rates, coverage
calculation, receipt format, sequence and revision fields. Saving the SAME paid
date again does not append another receipt. Saving a DIFFERENT paid date records
another payment, just like the current Edit workflow; this is not a receipt-
correction feature. Previously recorded receipts are not rewritten or deleted.

Status, billing dates and any new receipt commit in one transaction. Saving is
locked against duplicate clicks. Competing revisions, missing members, unavailable
billing, failed saves and insufficient access are reported without a false success.
Only paid and updatedAt are written on the member record by this shortcut. Belt,
name, access, waiver, attendance, PIN and directory fields are not overwritten.

## Firestore rules and unchanged components

No firestore.rules file is included. Do NOT replace or redeploy Firebase rules
for this UI shortcut. Keep the already-applied rules from the latest working setup.
The billing model/store/UI/report, manual toggle module, payment-alert module and
members.html were all left byte-for-byte unchanged from update 52. Existing
Firestore permissions remain authoritative; no roles or permissions were added.

## Checks completed

- 16 automated transaction/model tests passed using an in-memory Firebase mock.
- 27 Chromium integration checks passed against the actual updated owner page and
  portal module, using fictional member records and mocked Firebase operations.
- The real Chromium native calendar opened from a badge without an exception.
- Desktop and 390-pixel mobile layouts were inspected. This was not an iOS/Safari
  device test.
- Opening, changing, cancelling, saving, retrying a failed save, duplicate-submit
  protection, role restrictions, family inheritance, the original manual toggle,
  the full Edit form and post-save focus restoration were exercised.
- Month-end/leap-year/Central rollover cases, same-date receipt deduplication,
  stale data protection and minimal member-field writes were checked.
- Updated JavaScript syntax, unique page IDs and local script/stylesheet references
  were checked. No production account or live Firebase data was accessed.

These checks do not constitute a live Firestore-rules audit or a complete
regression test of every existing site feature. After deployment, use a test
member or an already-saved paid date for the initial check, avoiding an unintended
additional real payment entry. Confirm the roster value survives a page reload.

## Optional local test commands

Copy the test files into the updated site's tests folder, keeping the existing
billing and other site modules available. From the site folder:

    node --experimental-vm-modules --test tests/paid-date.test.cjs

The browser test requires Python, playwright, beautifulsoup4 and a local Chromium
installation. It uses only locally supplied markup and Blob modules; it performs
no web navigation, real authentication, or live database writes:

    python tests/paid-date-browser.py

Optional environment variables: REDROAD_SITE (site folder), CHROMIUM_PATH
(browser executable), and REDROAD_TEST_OUTPUT (test output folder).
