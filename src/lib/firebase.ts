
import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app';
import { getFirestore, type Firestore } from 'firebase/firestore';
import { getAuth, type Auth } from 'firebase/auth';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

if (process.env.NODE_ENV !== 'production') {
  // Log the presence of critical Firebase config values to help diagnose.
  // This does not log the values themselves for security, just whether they are set.
  console.log('Firebase Config Check:');
  console.log(`- NEXT_PUBLIC_FIREBASE_API_KEY is ${firebaseConfig.apiKey ? 'set' : 'MISSING or empty'}`);
  console.log(`- NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN is ${firebaseConfig.authDomain ? 'set' : 'MISSING or empty'}`);
  console.log(`- NEXT_PUBLIC_FIREBASE_PROJECT_ID is ${firebaseConfig.projectId ? 'set' : 'MISSING or empty'}`);
}

if (!firebaseConfig.apiKey || !firebaseConfig.authDomain || !firebaseConfig.projectId) {
  throw new Error(
    'Firebase configuration is incomplete. Essential keys (apiKey, authDomain, projectId) are missing or empty. ' +
    'Please ensure NEXT_PUBLIC_FIREBASE_API_KEY, NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN, and NEXT_PUBLIC_FIREBASE_PROJECT_ID ' +
    'are correctly set in your .env.local file or environment.'
  );
}

// Initialize Firebase eagerly so exports are always non-nullable.
const app: FirebaseApp = getApps().length ? getApp() : initializeApp(firebaseConfig);
// The getAuth() call itself can throw 'auth/invalid-api-key' if firebaseConfig.apiKey is present but deemed invalid by Firebase.
const db: Firestore = getFirestore(app);
const auth: Auth = getAuth(app);

if (process.env.NODE_ENV !== 'production') {
  console.log('Firebase initialized successfully.');
}

export { db, auth, app };
