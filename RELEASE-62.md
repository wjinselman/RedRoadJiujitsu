# Release 62 — optional kiosk mode

- Staff Settings now includes a Shared Kiosk dropdown with Disabled and Enabled modes.
- The setting is stored centrally, so all browsers and the kiosk page use the same mode.
- Disabled remains the default; QR phone check-in remains active in either mode.
- Enabling reveals the preserved kiosk setup controls and permits the kiosk login page to open.
- Only an owner or developer can change the setting.

Deploy the included Firestore rules with this release so the central attendance
option can be read and saved.
