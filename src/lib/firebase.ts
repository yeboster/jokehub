
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

let app: FirebaseApp | undefined;
let db: Firestore | undefined;
let auth: Auth | undefined;

// Log the presence of critical Firebase config values to help diagnose
// This does not log the values themselves for security, just whether they are set.
console.log('Firebase Config Check:');
console.log(`- NEXT_PUBLIC_FIREBASE_API_KEY is ${firebaseConfig.apiKey ? 'set' : 'MISSING or empty'}`);
console.log(`- NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN is ${firebaseConfig.authDomain ? 'set' : 'MISSING or empty'}`);
console.log(`- NEXT_PUBLIC_FIREBASE_PROJECT_ID is ${firebaseConfig.projectId ? 'set' : 'MISSING or empty'}`);

if (!firebaseConfig.apiKey || !firebaseConfig.authDomain || !firebaseConfig.projectId) {
  console.error(
    "CRITICAL: Firebase configuration is incomplete. Essential keys (apiKey, authDomain, projectId) are missing or empty. " +
    "Please ensure NEXT_PUBLIC_FIREBASE_API_KEY, NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN, and NEXT_PUBLIC_FIREBASE_PROJECT_ID are correctly set in your .env.local file or environment. " +
    "Firebase will NOT be initialized, and related app functionality will fail."
  );
  // app, db, and auth will remain undefined.
  // Downstream code (e.g., Contexts) will need to handle this gracefully or will error out.
} else {
  // Initialize Firebase
  if (!getApps().length) {
    app = initializeApp(firebaseConfig);
  } else {
    app = getApp();
  }

  db = getFirestore(app);
  // The getAuth() call itself can throw 'auth/invalid-api-key' if firebaseConfig.apiKey is present but deemed invalid by Firebase.
  auth = getAuth(app); 
  console.log('Firebase initialized successfully.');
}

export { db, auth };
