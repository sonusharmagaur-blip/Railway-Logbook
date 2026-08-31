# RailwayLogbook local replica

This is a new local project that reproduces the supplied Railway Logbook app as
the working baseline for further changes.

## Run locally

```powershell
pnpm dev
```

Open the local address printed by the development server. App data is stored in
the browser on this device.

To open it on an iPhone while the phone and PC are on the same Wi-Fi, use the
PC's Wi-Fi IPv4 address with port `3000` (for example,
`http://192.168.1.11:3000/`). The PC and local server must remain on.

## Free data protection

- Every field autosaves locally while you type.
- One device-local recovery snapshot is kept per day, with only the latest 30
  days available from Settings. Active duty records remain until you delete
  them; this 30-day rule applies to recovery snapshots, not live records.
- Settings can export a JSON backup file to the PC or phone and restore it later.
- Google Drive backup uses the free Google Drive API and writes one dated JSON
  file per day after you configure your own OAuth Web Client ID. RailwayLogbook
  never auto-deletes these Drive files, so they remain for the life of the
  Google Drive account unless you delete them or the account runs out of space.
- Google requires a fresh user gesture after a browser access token expires, so
  the app shows when the daily Drive backup is due and the **Backup Now** button
  reconnects and completes it. Local saving and local snapshots continue even
  when Drive is disconnected or the device is offline.
- Duty Adjustment records can also be linked to a Google Sheet from Settings.
  The app can create a new Sheet or link an existing one, automatically appends
  saved adjustment rows while Google access is active, and keeps offline rows
  pending until **Sync Pending Records** is tapped. Enable the Google Sheets API
  for the same Google Cloud project used by the OAuth Client ID.

The replicated app source is in `public/replica/`; the Sites wrapper and page
metadata are in `app/`.

## Locomotive entry

Locomotive details are entered directly inside each Duty Entry: numeric loco
number, type, 3–4 letter uppercase shed code, and Cab-1/Cab-2. Re-entering a
previously used loco number recalls its latest type and shed automatically.
Legacy locomotive-list records remain stored for lookup and backup compatibility,
even though the separate Locomotives tab is no longer shown.
