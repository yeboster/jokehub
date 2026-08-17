import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getAuth as getAdminAuth, Auth } from 'firebase-admin/auth';
import { getFirestore as getAdminFirestore, FieldValue, Firestore } from 'firebase-admin/firestore';

let adminDbInstance: Firestore | null = null;
let adminAuthInstance: Auth | null = null;

function ensureAdminApp(): void {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error('Firebase Admin credentials not configured. Missing: ' + 
      JSON.stringify({ 
        projectId: !!projectId, 
        clientEmail: !!clientEmail, 
        privateKey: !!privateKey 
      })
    );
  }

  if (getApps().length === 0) {
    initializeApp({
      credential: cert({
        projectId,
        clientEmail,
        privateKey,
      }),
    });
  }

}

function getAdminDb(): Firestore {
  if (adminDbInstance) {
    return adminDbInstance;
  }

  ensureAdminApp();
  adminDbInstance = getAdminFirestore();
  return adminDbInstance;
}

function getAuthInstance(): Auth {
  if (adminAuthInstance) {
    return adminAuthInstance;
  }

  ensureAdminApp();
  adminAuthInstance = getAdminAuth();
  return adminAuthInstance;
}

export { FieldValue };
export const adminDb = new Proxy({} as Firestore, {
  get(_, prop) {
    return getAdminDb()[prop as keyof Firestore];
  }
});

// Unlike the Firestore proxy above, methods are bound to the real Auth
// instance: `verifyIdToken` reaches for internal state via `this`, which would
// otherwise resolve to the proxy.
export const adminAuth = new Proxy({} as Auth, {
  get(_, prop) {
    const instance = getAuthInstance();
    const value = instance[prop as keyof Auth];
    return typeof value === 'function' ? value.bind(instance) : value;
  }
});
