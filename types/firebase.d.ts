declare module 'firebase/app' {
  export interface FirebaseOptions {
    [key: string]: unknown;
  }

  export interface FirebaseApp {
    name: string;
    options: FirebaseOptions;
  }

  export const initializeApp: (config: FirebaseOptions) => FirebaseApp;
  export const getApps: () => FirebaseApp[];
  export const getApp: () => FirebaseApp;
}

declare module 'firebase/auth' {
  import type { FirebaseApp } from 'firebase/app';

  export type User = {
    uid: string;
    email?: string | null;
    displayName?: string | null;
    photoURL?: string | null;
  };

  export interface Auth {
    currentUser: User | null;
  }

  export class GoogleAuthProvider {
    setCustomParameters: (params: Record<string, unknown>) => void;
  }

  export const getAuth: (app?: FirebaseApp) => Auth;
  export const onAuthStateChanged: (auth: Auth, callback: (user: User | null) => void) => () => void;
  export const signInWithEmailAndPassword: (auth: Auth, email: string, password: string) => Promise<{ user: User }>;
  export const createUserWithEmailAndPassword: (auth: Auth, email: string, password: string) => Promise<{ user: User }>;
  export const signInWithPopup: (auth: Auth, provider: GoogleAuthProvider) => Promise<{ user: User }>;
  export const signOut: (auth: Auth) => Promise<void>;
  export const updateProfile: (
    user: User,
    profile: Partial<Pick<User, 'displayName' | 'photoURL'>>,
  ) => Promise<void>;
}
