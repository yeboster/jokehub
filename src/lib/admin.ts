import { initializeApp, getApps, cert, App } from 'firebase-admin/app';
import { getFirestore as getAdminFirestore, FieldValue, Firestore } from 'firebase-admin/firestore';

let adminDbInstance: Firestore | null = null;

function getAdminDb(): Firestore {
  if (adminDbInstance) {
    return adminDbInstance;
  }

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

  adminDbInstance = getAdminFirestore();
  return adminDbInstance;
}

export { FieldValue };
export const adminDb = new Proxy({} as Firestore, {
  get(_, prop) {
    return getAdminDb()[prop as keyof Firestore];
  }
});
