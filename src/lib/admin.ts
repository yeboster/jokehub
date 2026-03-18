import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

function initAdmin() {
  if (getApps().length === 0) {
    // On Vercel, use implicit credentials from environment
    // The FIREBASE_PROJECT_ID env var is automatically set by Vercel when Firebase is configured
    const projectId = process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
    
    if (!projectId) {
      throw new Error('Firebase project ID not configured');
    }

    initializeApp({
      projectId,
      // credential: cert({...}) is not needed on Vercel - uses attached service account automatically
    });
  }
  return getFirestore();
}

export const adminDb = initAdmin();
export { FieldValue };
