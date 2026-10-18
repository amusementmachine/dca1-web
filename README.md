# DCA1 Web

Public frontend for the private DCA1 trading dashboard.

**This repository must never contain private DCA1 data, account identifiers that are not intentionally public, API credentials, Firebase Admin credentials, Coinbase credentials, tokens, seed phrases, or private keys.**

## Architecture

- Public frontend: `amusementmachine/dca1-web`
- Private DCA1 source/config/history: `amusementmachine/dca1-dashboard`
- Hosting/Auth/Data: Firebase Hosting + Google Authentication + Cloud Firestore
- Browser reads only authenticated Firestore dashboard documents.

## Firestore model expected by the frontend

- `access/{firebaseAuthUid}` — document existence grants dashboard read access to that signed-in Google/Firebase user.
- `dashboard/current` — latest dashboard snapshot.
- `iterations/{iterationId}` — dashboard-safe immutable iteration snapshots, with a sortable `timestamp` field.

Client writes are denied by `firestore.rules`. Dashboard data should be written by the trusted DCA1 synchronization path, not by browser JavaScript.

## Firebase setup

In the Firebase project:

1. Enable Firebase Hosting.
2. Enable Cloud Firestore.
3. Enable Google as an Authentication provider.
4. Deploy `firestore.rules`.
5. Sign in once, obtain the Firebase Authentication UID for the intended user, and create `access/{uid}` using a trusted/admin path.
6. Deploy Hosting with the `public` directory.

The frontend loads the modular Firebase SDK and obtains public configuration from Firebase Hosting's `/__/firebase/init.json`. It connects explicitly to the named `dca1` database.

## Deployed instance

- Project: `dca1-dashboard-20261018`
- Dashboard: https://dca1-dashboard-20261018.web.app
- Firestore: `dca1`, Enterprise Native, `us-east4`, realtime enabled, free tier
- Google sign-in is enabled. Access still requires `access/{uid}`.
- Trusted publishing lives only in the private source repository. No private JSON is bundled into this app.

## Local validation and deployment

Use Node 22 or newer. Run `npm ci`, `npm test`, and `npm run build`.
Security tests require Java 21+: `npx -y firebase-tools@latest emulators:exec --only firestore --project demo-dca1 "npm run test:rules"`.
The emulator uses port 8180; these tests validate rules behavior, not Enterprise pricing or query features.
Deploy with `npx -y firebase-tools@latest deploy --only hosting,firestore:rules,auth`.
Hosting deploys only the three built files in `dist/`; the predeploy hook builds them.
For local sign-in with the Hosting emulator, add localhost to Auth authorized domains first.

## Dashboard contract

`dashboard/current` contains ISO UTC timestamps, `portfolio` (`total_usd`, `available_usd`),
`wave` (`phase`, `score`, `breadth`, `synchronization`), `active_campaigns`, `vault`,
`fee_tier`, `current_thinking`, `insights`, `direction`, and `assistant_response`.
Unknown numbers remain null and display as an em dash. No portfolio total or historical response is invented.
`iterations/{id}` uses the same wave and narrative fields and a normalized ISO UTC `timestamp`.
The latest 200 iterations are read in realtime, charted, and shown in the journal.
The score table exposes exact values. Historical entries lacking scores or narratives remain visibly incomplete.
Text is inserted as text nodes, and all data is cleared on sign-out. Revoked access hides the dashboard.

## Security

Authentication alone is not the authorization boundary. Firestore rules require an `access/{uid}` document before dashboard data can be read. Browser writes are denied.

The private repository remains the durable DCA1 rule/history source. This public repository contains only presentation/authentication code.
