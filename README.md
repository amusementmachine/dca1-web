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

The frontend uses Firebase Hosting reserved URLs (`/__/firebase/...` and `/__/firebase/init.js`), so no Firebase project config or secret is committed here. These reserved URLs are provided by Firebase Hosting.

## Security

Authentication alone is not the authorization boundary. Firestore rules require an `access/{uid}` document before dashboard data can be read. Browser writes are denied.

The private repository remains the durable DCA1 rule/history source. This public repository contains only presentation/authentication code.
