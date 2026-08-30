// Red Road Jiu Jitsu — Firebase connection
// Paste the Web App config from Firebase Console > Project settings > Your apps.
// Keep this project on the Spark plan with NO Cloud Billing account attached.
export const firebaseConfig = {
  apiKey: "REPLACE_WITH_FIREBASE_API_KEY",
  authDomain: "REPLACE_WITH_PROJECT.firebaseapp.com",
  projectId: "REPLACE_WITH_PROJECT_ID",
  storageBucket: "REPLACE_WITH_PROJECT.firebasestorage.app",
  messagingSenderId: "REPLACE_WITH_SENDER_ID",
  appId: "REPLACE_WITH_APP_ID"
};

export const firebaseConfigured = Object.values(firebaseConfig).every(
  value => typeof value === "string" && value.length > 0 && !value.startsWith("REPLACE_")
);
