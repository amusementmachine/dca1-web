# DCA1 Web — legacy frontend source

This repository contains the **previous public frontend source** for the DCA1 trading dashboard.

The intended single source of truth has moved to the private repository:
`amusementmachine/dca1-dashboard`, including the Firebase Hosting frontend under `web/` and the dashboard-safe Firestore publisher.

The live dashboard remains:
https://dca1-dashboard-20261018.web.app

The existing Firebase Hosting deployment may still reflect this repository's last deployed build until the private repository deployment identity is granted Firebase Hosting access. Do not make new DCA1 UI changes here.

**Never commit private DCA1 data, credentials, Firebase Admin credentials, Coinbase credentials, tokens, seed phrases, private keys, prompts, strategy rules, or order details to this public repository.**
