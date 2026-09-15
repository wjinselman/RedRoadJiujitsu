# Release 61 — QR phone attendance

- Members can scan the gym QR, sign in on their own phone and confirm the inferred class.
- Verified, enabled and active members can create only their own attendance record.
- A deterministic member/class/date ID prevents duplicate check-ins.
- The staff dashboard includes a downloadable, print-ready QR code and retains attendance correction.
- Shared kiosk UI, setup and data loading are hidden behind `kioskAttendance: false`.
- Direct visits to `kiosk.html` explain that phone check-in is the active method.

Deploy the included Firestore rules together with the site. The member write is
denied until those rules are live.
