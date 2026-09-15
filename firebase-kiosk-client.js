// A separately named Firebase app keeps the iPad kiosk session isolated from
// staff/member portal sessions opened in another tab on the same device.
import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js';
import {
  getAuth,
  browserLocalPersistence,
  setPersistence,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
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
  app = initializeApp(firebaseConfig, 'red-road-check-in-kiosk');
  auth = getAuth(app);
  db = getFirestore(app);
  setPersistence(auth, browserLocalPersistence).catch(() => {});
}

export {
  firebaseConfigured, auth, db,
  signInWithEmailAndPassword, createUserWithEmailAndPassword,
  signOut, deleteUser, onAuthStateChanged,
  doc, getDoc, getDocs, setDoc, collection, query, limit, serverTimestamp
};
