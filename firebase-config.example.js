// firebase-config.example.js
// ─────────────────────────────────────────────────────────────
// Copy this file to firebase-config.js and fill in your values.
// firebase-config.js is gitignored and should NEVER be committed.
//
// How to get these values:
//   1. Go to https://console.firebase.google.com
//   2. Create a project (or open an existing one)
//   3. Project Settings → Your apps → Add web app
//   4. Copy the config object below and paste into firebase-config.js

const FIREBASE_CONFIG = {
  apiKey:            "YOUR_API_KEY",
  authDomain:        "YOUR_PROJECT_ID.firebaseapp.com",
  projectId:         "YOUR_PROJECT_ID",
  storageBucket:     "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId:             "YOUR_APP_ID"
};
