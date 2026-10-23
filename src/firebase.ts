import { initializeApp, FirebaseApp } from 'firebase/app';
import { getAuth, Auth } from 'firebase/auth';
import {
  getFirestore,
  Firestore,
  doc,
  getDocFromServer,
} from 'firebase/firestore';
import appletFirebaseConfig from '../firebase-applet-config.json';

export interface ResolvedFirebaseConfig {
  projectId: string;
  appId: string;
  apiKey: string;
  authDomain: string;
  firestoreDatabaseId?: string;
  storageBucket?: string;
  messagingSenderId?: string;
}

function getEnvVar(key: string): string {
  try {
    const val = (import.meta as any).env?.[key];
    return typeof val === 'string' ? val.trim() : '';
  } catch {
    return '';
  }
}

export function getResolvedFirebaseConfig(): ResolvedFirebaseConfig {
  return {
    projectId:
      getEnvVar('VITE_FIREBASE_PROJECT_ID') ||
      appletFirebaseConfig.projectId ||
      '',
    appId:
      getEnvVar('VITE_FIREBASE_APP_ID') || appletFirebaseConfig.appId || '',
    apiKey:
      getEnvVar('VITE_FIREBASE_API_KEY') || appletFirebaseConfig.apiKey || '',
    authDomain:
      getEnvVar('VITE_FIREBASE_AUTH_DOMAIN') ||
      appletFirebaseConfig.authDomain ||
      '',
    firestoreDatabaseId:
      getEnvVar('VITE_FIREBASE_FIRESTORE_DATABASE_ID') ||
      appletFirebaseConfig.firestoreDatabaseId ||
      undefined,
    storageBucket:
      getEnvVar('VITE_FIREBASE_STORAGE_BUCKET') ||
      appletFirebaseConfig.storageBucket ||
      undefined,
    messagingSenderId:
      getEnvVar('VITE_FIREBASE_MESSAGING_SENDER_ID') ||
      appletFirebaseConfig.messagingSenderId ||
      undefined,
  };
}

export function isFirebaseConfigured(): boolean {
  const cfg = getResolvedFirebaseConfig();
  return Boolean(
    cfg.projectId &&
      cfg.projectId !== 'remixed-project-id' &&
      cfg.apiKey &&
      cfg.appId &&
      cfg.authDomain
  );
}

const resolvedConfig = getResolvedFirebaseConfig();

export const app: FirebaseApp = initializeApp(resolvedConfig);
export const db: Firestore = resolvedConfig.firestoreDatabaseId
  ? getFirestore(app, resolvedConfig.firestoreDatabaseId)
  : getFirestore(app);
export const auth: Auth = getAuth(app);

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

async function testConnection() {
  if (typeof window === 'undefined') return;
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes('the client is offline')
    ) {
      console.error('Please check your Firebase configuration.');
    }
  }
}

testConnection();
