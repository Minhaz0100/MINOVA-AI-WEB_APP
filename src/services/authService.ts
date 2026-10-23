import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  updateProfile,
  onAuthStateChanged,
  GoogleAuthProvider,
  signInWithPopup,
  User as FirebaseUser,
} from 'firebase/auth';
import {
  auth,
  getResolvedFirebaseConfig,
  isFirebaseConfigured,
} from '../firebase';
import { AuthSession, AuthUserProfile } from '../types/chat';
import { MINOVA_BACKEND_URL } from './minovaApi';

/**
 * Documented Authentication Service Interface for MINOVA AI Web.
 *
 * Architectural Contract & Security Rules:
 * 1. Uses Firebase Authentication (`firebase/auth`) when configured (`firebase-applet-config.json`
 *    or `VITE_FIREBASE_*` env vars), while also probing the existing MINOVA AI backend (`/api/auth/*`).
 * 2. Never stores plaintext passwords in localStorage, sessionStorage, or memory.
 * 3. Never exposes service-account secrets or private API keys in browser bundles.
 * 4. Never fakes a successful sign-in or sign-up when a provider is disabled or returns an error.
 * 5. Preserves local guest conversations (`minova_ai_web_threads_v1`) and settings untouched
 *    across guest usage, sign-in, session restoration, and sign-out.
 */

export const AUTH_SESSION_STORAGE_KEY = 'minova_ai_auth_session_v1';

export interface SignInPayload {
  email: string;
  password: string;
}

export interface SignUpPayload {
  displayName: string;
  email: string;
  password: string;
  confirmPassword: string;
  acceptedTerms: boolean;
}

export interface AuthValidationResult {
  valid: boolean;
  fieldErrors: Partial<
    Record<
      'displayName' | 'email' | 'password' | 'confirmPassword' | 'acceptedTerms',
      string
    >
  >;
  summaryError?: string;
}

export interface AuthOperationResult {
  ok: boolean;
  statusCode?: number;
  errorCode?: string;
  message: string;
  session?: AuthSession;
  backendNotImplemented?: boolean;
  providerSetupRequired?: boolean;
}

export interface AuthServiceStatus {
  provider: 'firebase-auth' | 'minova-backend' | 'unconfigured';
  firebaseProjectId?: string;
  firebaseConsoleAuthUrl?: string;
  endpointBase: string;
  authRouteStatus: 'firebase_ready' | 'active' | 'not_implemented_501' | 'unreachable';
  cloudSyncSupported: false;
  passwordResetSupported: false;
  detailMessage: string;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * Validates Sign In form inputs before sending any network request.
 */
export function validateSignInInput(input: SignInPayload): AuthValidationResult {
  const fieldErrors: AuthValidationResult['fieldErrors'] = {};
  const email = (input.email || '').trim();
  const password = input.password || '';

  if (!email) {
    fieldErrors.email = 'Email address is required.';
  } else if (!EMAIL_REGEX.test(email)) {
    fieldErrors.email = 'Please enter a valid email address (e.g., name@domain.com).';
  }

  if (!password) {
    fieldErrors.password = 'Password is required.';
  } else if (password.length < 8) {
    fieldErrors.password = 'Password must be at least 8 characters long.';
  }

  const valid = Object.keys(fieldErrors).length === 0;
  return {
    valid,
    fieldErrors,
    summaryError: valid ? undefined : Object.values(fieldErrors)[0],
  };
}

/**
 * Validates Sign Up (Create Account) form inputs before sending any network request.
 */
export function validateSignUpInput(input: SignUpPayload): AuthValidationResult {
  const fieldErrors: AuthValidationResult['fieldErrors'] = {};
  const displayName = (input.displayName || '').trim();
  const email = (input.email || '').trim();
  const password = input.password || '';
  const confirmPassword = input.confirmPassword || '';

  if (!displayName) {
    fieldErrors.displayName = 'Display name is required.';
  } else if (displayName.length < 2) {
    fieldErrors.displayName = 'Display name must be at least 2 characters.';
  } else if (displayName.length > 80) {
    fieldErrors.displayName = 'Display name cannot exceed 80 characters.';
  }

  if (!email) {
    fieldErrors.email = 'Email address is required.';
  } else if (!EMAIL_REGEX.test(email)) {
    fieldErrors.email = 'Please enter a valid email address (e.g., name@domain.com).';
  }

  if (!password) {
    fieldErrors.password = 'Password is required.';
  } else if (password.length < 8) {
    fieldErrors.password = 'Password must be at least 8 characters long.';
  }

  if (!confirmPassword) {
    fieldErrors.confirmPassword = 'Please confirm your password.';
  } else if (password && password !== confirmPassword) {
    fieldErrors.confirmPassword = 'Passwords do not match.';
  }

  if (!input.acceptedTerms) {
    fieldErrors.acceptedTerms =
      'You must accept the Privacy Policy and Terms of Service to create an account.';
  }

  const valid = Object.keys(fieldErrors).length === 0;
  return {
    valid,
    fieldErrors,
    summaryError: valid ? undefined : Object.values(fieldErrors)[0],
  };
}

/**
 * Checks whether an AuthSession has expired based on its ISO `expiresAt` timestamp.
 */
export function isAuthSessionExpired(session: AuthSession | null): boolean {
  if (!session) return true;
  if (!session.accessToken || !session.user?.email) return true;
  if (session.expiresAt) {
    const expTime = new Date(session.expiresAt).getTime();
    if (!Number.isNaN(expTime) && Date.now() >= expTime) {
      return true;
    }
  }
  return false;
}

/**
 * Restores an active authenticated session from sessionStorage if valid and non-expired.
 * Automatically clears expired sessions without touching local guest threads or settings.
 */
export function restoreAuthSession(): AuthSession | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(AUTH_SESSION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AuthSession;
    if (isAuthSessionExpired(parsed)) {
      window.sessionStorage.removeItem(AUTH_SESSION_STORAGE_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Persists a verified AuthSession token & profile (never plaintext passwords) to sessionStorage.
 */
export function saveAuthSession(session: AuthSession): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(
      AUTH_SESSION_STORAGE_KEY,
      JSON.stringify(session)
    );
  } catch {
    // ignore storage quota errors
  }
}

/**
 * Converts a Firebase Auth User instance into a normalized MINOVA AI AuthSession.
 */
export async function buildSessionFromFirebaseUser(
  fbUser: FirebaseUser,
  fallbackDisplayName?: string
): Promise<AuthSession> {
  const tokenResult = await fbUser.getIdTokenResult();
  const resolvedEmail = fbUser.email || 'user@minova.ai';
  const resolvedName =
    fbUser.displayName?.trim() ||
    fallbackDisplayName?.trim() ||
    resolvedEmail.split('@')[0];

  const userProfile: AuthUserProfile = {
    id: fbUser.uid,
    displayName: resolvedName,
    email: resolvedEmail,
    createdAt: fbUser.metadata?.creationTime || new Date().toISOString(),
  };

  const session: AuthSession = {
    user: userProfile,
    accessToken: tokenResult.token,
    expiresAt: tokenResult.expirationTime
      ? new Date(tokenResult.expirationTime).toISOString()
      : undefined,
    provider: 'firebase-auth',
  };

  saveAuthSession(session);
  return session;
}

/**
 * Subscribes to Firebase Authentication state changes (`onAuthStateChanged`) for live session
 * restoration and token refresh across page reloads.
 */
export function subscribeToAuthChanges(
  onSessionChange: (session: AuthSession | null) => void
): () => void {
  if (!isFirebaseConfigured()) {
    return () => {};
  }

  return onAuthStateChanged(auth, async (fbUser) => {
    if (!fbUser) {
      if (typeof window !== 'undefined') {
        const existing = restoreAuthSession();
        if (!existing || existing.provider === 'firebase-auth') {
          window.sessionStorage.removeItem(AUTH_SESSION_STORAGE_KEY);
          onSessionChange(null);
        }
      } else {
        onSessionChange(null);
      }
      return;
    }

    try {
      const session = await buildSessionFromFirebaseUser(fbUser);
      onSessionChange(session);
    } catch {
      onSessionChange(null);
    }
  });
}

/**
 * Signs out the current user session from both Firebase Auth and sessionStorage
 * while preserving all local guest conversations, study sessions, and personalization settings intact.
 */
export async function signOutMinova(): Promise<void> {
  if (typeof window !== 'undefined') {
    try {
      window.sessionStorage.removeItem(AUTH_SESSION_STORAGE_KEY);
    } catch {
      // ignore
    }
  }
  if (isFirebaseConfigured()) {
    try {
      await firebaseSignOut(auth);
    } catch {
      // ignore sign-out errors if already signed out
    }
  }
}

/**
 * Maps Firebase Auth error codes into clear, user-friendly messages without exposing internals.
 */
export function mapFirebaseAuthError(err: unknown): AuthOperationResult {
  const fbConfig = getResolvedFirebaseConfig();
  const projectId = fbConfig.projectId || 'your-firebase-project';
  const consoleUrl = `https://console.firebase.google.com/project/${projectId}/authentication/providers`;

  const code =
    typeof (err as any)?.code === 'string' ? (err as any).code : '';
  const rawMessage =
    err instanceof Error ? err.message : String(err || 'Authentication error');

  if (
    code === 'auth/invalid-credential' ||
    code === 'auth/wrong-password' ||
    code === 'auth/user-not-found' ||
    code === 'auth/invalid-login-credentials' ||
    rawMessage.includes('INVALID_LOGIN_CREDENTIALS')
  ) {
    return {
      ok: false,
      statusCode: 401,
      errorCode: 'INVALID_CREDENTIALS',
      message:
        'Invalid email or password. Please check your credentials and try again.',
    };
  }

  if (
    code === 'auth/email-already-in-use' ||
    rawMessage.includes('EMAIL_EXISTS')
  ) {
    return {
      ok: false,
      statusCode: 409,
      errorCode: 'DUPLICATE_ACCOUNT',
      message:
        'An account with this email address already exists. Please switch to Sign In.',
    };
  }

  if (code === 'auth/invalid-email' || rawMessage.includes('INVALID_EMAIL')) {
    return {
      ok: false,
      statusCode: 400,
      errorCode: 'INVALID_EMAIL',
      message: 'Please enter a valid email address.',
    };
  }

  if (code === 'auth/weak-password' || rawMessage.includes('WEAK_PASSWORD')) {
    return {
      ok: false,
      statusCode: 400,
      errorCode: 'WEAK_PASSWORD',
      message:
        'Password is too weak. Please choose a stronger password (at least 8 characters).',
    };
  }

  if (code === 'auth/user-disabled' || rawMessage.includes('USER_DISABLED')) {
    return {
      ok: false,
      statusCode: 403,
      errorCode: 'ACCOUNT_DISABLED',
      message: 'This account has been disabled by an administrator.',
    };
  }

  if (
    code === 'auth/too-many-requests' ||
    rawMessage.includes('TOO_MANY_ATTEMPTS_TRY_LATER')
  ) {
    return {
      ok: false,
      statusCode: 429,
      errorCode: 'RATE_LIMITED',
      message:
        'Too many unsuccessful attempts. Please wait a moment before trying again.',
    };
  }

  if (
    code === 'auth/user-token-expired' ||
    code === 'auth/id-token-expired' ||
    code === 'auth/requires-recent-login'
  ) {
    return {
      ok: false,
      statusCode: 401,
      errorCode: 'SESSION_EXPIRED',
      message: 'Your session has expired. Please sign in again.',
    };
  }

  if (code === 'auth/network-request-failed') {
    return {
      ok: false,
      errorCode: 'NETWORK_ERROR',
      message:
        'Network error while connecting to Firebase Authentication. Please verify your internet connection.',
    };
  }

  if (
    code === 'auth/popup-closed-by-user' ||
    code === 'auth/cancelled-popup-request'
  ) {
    return {
      ok: false,
      errorCode: 'POPUP_CLOSED',
      message: 'Sign-in window was closed before completing authentication.',
    };
  }

  if (
    code === 'auth/operation-not-allowed' ||
    code === 'auth/configuration-not-found' ||
    rawMessage.includes('OPERATION_NOT_ALLOWED') ||
    rawMessage.includes('CONFIGURATION_NOT_FOUND')
  ) {
    return {
      ok: false,
      statusCode: 400,
      errorCode: 'FIREBASE_EMAIL_PROVIDER_DISABLED',
      providerSetupRequired: true,
      message: `Email/Password sign-in is not yet enabled in the Firebase Console for project "${projectId}". Enable the Email/Password provider at ${consoleUrl} (or use Google Sign-In / Guest Mode).`,
    };
  }

  return {
    ok: false,
    errorCode: code || 'AUTH_ERROR',
    message: rawMessage,
  };
}

/**
 * Probes the authentication configuration and backend status.
 */
export async function probeAuthBackendStatus(
  signal?: AbortSignal
): Promise<AuthServiceStatus> {
  const fbConfig = getResolvedFirebaseConfig();
  if (isFirebaseConfigured()) {
    const consoleUrl = `https://console.firebase.google.com/project/${fbConfig.projectId}/authentication/providers`;
    return {
      provider: 'firebase-auth',
      firebaseProjectId: fbConfig.projectId,
      firebaseConsoleAuthUrl: consoleUrl,
      endpointBase: `firebase://${fbConfig.projectId}`,
      authRouteStatus: 'firebase_ready',
      cloudSyncSupported: false,
      passwordResetSupported: false,
      detailMessage: `Connected to Firebase Authentication (project: ${fbConfig.projectId}). Local guest chat history remains stored on this device.`,
    };
  }

  try {
    const response = await fetch(`${MINOVA_BACKEND_URL}/api/auth/me`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      mode: 'cors',
      credentials: 'omit',
      signal,
    });

    if (response.status === 501) {
      let msg =
        'The /api/auth endpoint on minova-ai-backend.ai.studio currently returns HTTP 501 (Not Implemented). Guest Mode is active with full local browser storage.';
      try {
        const body = await response.json();
        if (body?.error?.message) {
          msg = `${body.error.message} (HTTP 501 Not Implemented on ${MINOVA_BACKEND_URL})`;
        }
      } catch {
        // ignore
      }
      return {
        provider: 'unconfigured',
        endpointBase: `${MINOVA_BACKEND_URL}/api/auth`,
        authRouteStatus: 'not_implemented_501',
        cloudSyncSupported: false,
        passwordResetSupported: false,
        detailMessage: msg,
      };
    }

    return {
      provider: 'minova-backend',
      endpointBase: `${MINOVA_BACKEND_URL}/api/auth`,
      authRouteStatus: 'active',
      cloudSyncSupported: false,
      passwordResetSupported: false,
      detailMessage: 'Connected to MINOVA AI authentication service.',
    };
  } catch {
    return {
      provider: 'unconfigured',
      endpointBase: `${MINOVA_BACKEND_URL}/api/auth`,
      authRouteStatus: 'unreachable',
      cloudSyncSupported: false,
      passwordResetSupported: false,
      detailMessage:
        'Unable to reach authentication endpoint. Guest Mode remains active locally.',
    };
  }
}

/**
 * Executes a Sign In request using Firebase Email/Password Authentication when configured,
 * falling back to the MINOVA AI backend (`POST /api/auth/login`) if Firebase is not configured.
 * Never fakes a successful login.
 */
export async function signInWithMinova(
  payload: SignInPayload,
  signal?: AbortSignal
): Promise<AuthOperationResult> {
  const validation = validateSignInInput(payload);
  if (!validation.valid) {
    return {
      ok: false,
      errorCode: 'VALIDATION_ERROR',
      message: validation.summaryError || 'Please check your email and password.',
    };
  }

  const normalizedEmail = payload.email.trim().toLowerCase();

  if (isFirebaseConfigured()) {
    try {
      const credential = await signInWithEmailAndPassword(
        auth,
        normalizedEmail,
        payload.password
      );
      const session = await buildSessionFromFirebaseUser(credential.user);
      return {
        ok: true,
        statusCode: 200,
        message: `Signed in as ${session.user.displayName}.`,
        session,
      };
    } catch (err) {
      return mapFirebaseAuthError(err);
    }
  }

  try {
    const response = await fetch(`${MINOVA_BACKEND_URL}/api/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      mode: 'cors',
      credentials: 'omit',
      body: JSON.stringify({
        email: normalizedEmail,
        password: payload.password,
      }),
      signal,
    });

    let body: any = null;
    try {
      body = await response.json();
    } catch {
      // ignore non-json
    }

    if (response.status === 501 || body?.error?.code === 'NOT_IMPLEMENTED') {
      const serverMsg =
        body?.error?.message ||
        'The /api/auth endpoint is scheduled for future release.';
      return {
        ok: false,
        statusCode: 501,
        errorCode: 'NOT_IMPLEMENTED',
        backendNotImplemented: true,
        message: `Authentication Service Not Yet Deployed (HTTP 501): ${serverMsg} You can continue using all MINOVA AI features in Guest Mode with local browser storage.`,
      };
    }

    if (
      response.ok &&
      body?.success &&
      body?.accessToken &&
      body?.user?.email
    ) {
      const user: AuthUserProfile = {
        id: String(body.user.id || `usr_${Date.now()}`),
        displayName: String(
          body.user.displayName ||
            body.user.name ||
            normalizedEmail.split('@')[0]
        ),
        email: String(body.user.email),
        createdAt: body.user.createdAt,
      };
      const session: AuthSession = {
        user,
        accessToken: String(body.accessToken),
        expiresAt: body.expiresAt,
        provider: 'minova-backend-jwt',
      };
      saveAuthSession(session);
      return {
        ok: true,
        statusCode: response.status,
        message: `Signed in as ${user.displayName}.`,
        session,
      };
    }

    return {
      ok: false,
      statusCode: response.status,
      errorCode: body?.error?.code || `HTTP_${response.status}`,
      message:
        body?.error?.message ||
        `Sign in failed (HTTP ${response.status}). Please verify your credentials.`,
    };
  } catch (err) {
    return {
      ok: false,
      errorCode: 'NETWORK_ERROR',
      message:
        err instanceof Error
          ? err.message
          : 'Unable to reach MINOVA AI authentication service.',
    };
  }
}

/**
 * Executes a Create Account (Sign Up) request using Firebase Email/Password Authentication when configured,
 * falling back to the MINOVA AI backend (`POST /api/auth/register`) if Firebase is not configured.
 * Never fakes account creation.
 */
export async function signUpWithMinova(
  payload: SignUpPayload,
  signal?: AbortSignal
): Promise<AuthOperationResult> {
  const validation = validateSignUpInput(payload);
  if (!validation.valid) {
    return {
      ok: false,
      errorCode: 'VALIDATION_ERROR',
      message:
        validation.summaryError || 'Please complete all required fields.',
    };
  }

  const trimmedName = payload.displayName.trim();
  const normalizedEmail = payload.email.trim().toLowerCase();

  if (isFirebaseConfigured()) {
    try {
      const credential = await createUserWithEmailAndPassword(
        auth,
        normalizedEmail,
        payload.password
      );
      try {
        await updateProfile(credential.user, {
          displayName: trimmedName,
        });
      } catch {
        // Non-fatal if profile displayName update fails; fallbackDisplayName handles it
      }
      const session = await buildSessionFromFirebaseUser(
        credential.user,
        trimmedName
      );
      return {
        ok: true,
        statusCode: 201,
        message: `Account created and signed in as ${session.user.displayName}.`,
        session,
      };
    } catch (err) {
      return mapFirebaseAuthError(err);
    }
  }

  try {
    const response = await fetch(`${MINOVA_BACKEND_URL}/api/auth/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      mode: 'cors',
      credentials: 'omit',
      body: JSON.stringify({
        displayName: trimmedName,
        email: normalizedEmail,
        password: payload.password,
        acceptedTerms: Boolean(payload.acceptedTerms),
      }),
      signal,
    });

    let body: any = null;
    try {
      body = await response.json();
    } catch {
      // ignore
    }

    if (response.status === 501 || body?.error?.code === 'NOT_IMPLEMENTED') {
      const serverMsg =
        body?.error?.message ||
        'The /api/auth endpoint is scheduled for future release.';
      return {
        ok: false,
        statusCode: 501,
        errorCode: 'NOT_IMPLEMENTED',
        backendNotImplemented: true,
        message: `Account Registration Service Not Yet Deployed (HTTP 501): ${serverMsg} Your local conversations and settings remain safely stored in Guest Mode.`,
      };
    }

    if (
      response.ok &&
      body?.success &&
      body?.accessToken &&
      body?.user?.email
    ) {
      const user: AuthUserProfile = {
        id: String(body.user.id || `usr_${Date.now()}`),
        displayName: String(body.user.displayName || trimmedName),
        email: String(body.user.email),
        createdAt: body.user.createdAt || new Date().toISOString(),
      };
      const session: AuthSession = {
        user,
        accessToken: String(body.accessToken),
        expiresAt: body.expiresAt,
        provider: 'minova-backend-jwt',
      };
      saveAuthSession(session);
      return {
        ok: true,
        statusCode: response.status,
        message: `Account created and signed in as ${user.displayName}.`,
        session,
      };
    }

    return {
      ok: false,
      statusCode: response.status,
      errorCode: body?.error?.code || `HTTP_${response.status}`,
      message:
        body?.error?.message ||
        `Account creation failed (HTTP ${response.status}).`,
    };
  } catch (err) {
    return {
      ok: false,
      errorCode: 'NETWORK_ERROR',
      message:
        err instanceof Error
          ? err.message
          : 'Unable to reach MINOVA AI authentication service.',
    };
  }
}

/**
 * Signs in with Google via Firebase Authentication popup (`signInWithPopup`).
 */
export async function signInWithGoogleMinova(): Promise<AuthOperationResult> {
  if (!isFirebaseConfigured()) {
    return {
      ok: false,
      errorCode: 'FIREBASE_NOT_CONFIGURED',
      message: 'Firebase Authentication is not configured for this environment.',
    };
  }

  try {
    const provider = new GoogleAuthProvider();
    const credential = await signInWithPopup(auth, provider);
    const session = await buildSessionFromFirebaseUser(credential.user);
    return {
      ok: true,
      statusCode: 200,
      message: `Signed in with Google as ${session.user.displayName}.`,
      session,
    };
  } catch (err) {
    return mapFirebaseAuthError(err);
  }
}
