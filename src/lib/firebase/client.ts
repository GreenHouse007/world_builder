import type { Auth } from 'firebase/auth';

type FirebaseBundle = {
  auth: Auth;
  authModule: typeof import('firebase/auth');
};

let firebasePromise: Promise<FirebaseBundle | null> | null = null;

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

export const loadFirebase = async (): Promise<FirebaseBundle | null> => {
  if (firebasePromise) return firebasePromise;

  firebasePromise = (async () => {
    try {
      const appModule = await import('firebase/app');
      const authModule = await import('firebase/auth');

      const { initializeApp, getApp, getApps } = appModule;
      const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
      const auth = authModule.getAuth(app);

      return { auth, authModule };
    } catch (error) {
      console.warn('Firebase SDK failed to load. Auth features are disabled.', error);
      return null;
    }
  })();

  return firebasePromise;
};
