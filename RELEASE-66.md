# Red Road — coach dues exemption and gallery fixes

Jeff: open the Owner Dashboard, edit the member, check "Coach — dashboard access, dues exempt, always current", and save.

Coach status grants the existing limited coach dashboard access, automatically saves Paid and Payment Exempt, and displays Paid / Current with a dues-exemption label. Existing coach records are also treated as current without a migration. Coaches are excluded from billable dues and past-due calculations; this is an exemption, not a recorded payment transaction.

Only owners/developers can manage this designation under the existing rules. No Firebase rules changes, Functions, billing upgrades, or database migrations are needed.

To return someone to normal billing, uncheck Coach AND Payment Exempt and set Paid / Current appropriately before saving. Removing coach access alone intentionally preserves the separately editable exemption.

Includes the full portrait training photo on phones and removal of the Carlson Gracie caption. Updated website files: index.html, experience.css, owner.html, members.html, portal.js.

Verification: 41 automated checks pass, including coach saves, legacy coach display, and past-due filtering. Gallery visually checked at mobile and desktop layouts. Not deployed to the live site.
