/*
  Red Road Jiu Jitsu — intentionally small Firebase client
  ----------------------------------------------------------
  - Firebase Auth: email/password only
  - Firestore: one-time getDoc/getDocs + explicit button-triggered writes
  - NO onSnapshot listeners
  - NO polling
  - NO background refresh
  - NO Cloud Functions
*/
import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js';
import {
  getAuth,
  browserLocalPersistence,
  setPersistence,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  sendEmailVerification,
  updatePassword,
  reauthenticateWithCredential,
  EmailAuthProvider,
  signOut,
  deleteUser,
  onAuthStateChanged
} from 'https://www.gstatic.com/firebasejs/12.18.0/firebase-auth.js';
import {
  getFirestore,
  doc,
  getDoc,
  getDocs,
  setDoc,
  deleteDoc,
  collection,
  query,
  limit,
  serverTimestamp
} from 'https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js';
import { firebaseConfig, firebaseConfigured } from './firebase-config.js';

let app = null;
let auth = null;
let db = null;

if (firebaseConfigured) {
  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);
  // Auth session persistence only. This is not a Firestore read/write.
  setPersistence(auth, browserLocalPersistence).catch(() => {});
}

export {
  firebaseConfigured,
  auth,
  db,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  sendEmailVerification,
  updatePassword,
  reauthenticateWithCredential,
  EmailAuthProvider,
  signOut,
  deleteUser,
  onAuthStateChanged,
  doc,
  getDoc,
  getDocs,
  setDoc,
  deleteDoc,
  collection,
  query,
  limit,
  serverTimestamp
};
