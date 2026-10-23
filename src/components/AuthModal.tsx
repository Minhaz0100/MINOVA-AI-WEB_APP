import React, { useState, useEffect } from 'react';
import {
  X,
  LogIn,
  UserPlus,
  Eye,
  EyeOff,
  AlertCircle,
  CheckCircle2,
  Loader2,
  ShieldCheck,
  HardDrive,
  LogOut,
  Info,
  ExternalLink,
} from 'lucide-react';
import { AuthSession } from '../types/chat';
import {
  AuthServiceStatus,
  AuthValidationResult,
  probeAuthBackendStatus,
  signInWithGoogleMinova,
  signInWithMinova,
  signUpWithMinova,
  validateSignInInput,
  validateSignUpInput,
} from '../services/authService';
import { MinovaLogo } from './MinovaLogo';

export type AuthModalMode = 'signin' | 'signup';

interface AuthModalProps {
  isOpen: boolean;
  initialMode: AuthModalMode;
  authSession: AuthSession | null;
  onClose: () => void;
  onAuthSuccess: (session: AuthSession) => void;
  onSignOut: () => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  initialMode,
  authSession,
  onClose,
  onAuthSuccess,
  onSignOut,
}) => {
  const [mode, setMode] = useState<AuthModalMode>(initialMode);
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [showTermsDetails, setShowTermsDetails] = useState(false);

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [fieldErrors, setFieldErrors] = useState<
    AuthValidationResult['fieldErrors']
  >({});
  const [bannerError, setBannerError] = useState<string | null>(null);
  const [bannerSuccess, setBannerSuccess] = useState<string | null>(null);
  const [providerSetupRequired, setProviderSetupRequired] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGoogleSubmitting, setIsGoogleSubmitting] = useState(false);
  const [serviceStatus, setServiceStatus] = useState<AuthServiceStatus | null>(
    null
  );

  useEffect(() => {
    setMode(initialMode);
    setFieldErrors({});
    setBannerError(null);
    setBannerSuccess(null);
    setProviderSetupRequired(false);
  }, [initialMode, isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const controller = new AbortController();
    probeAuthBackendStatus(controller.signal)
      .then((status) => setServiceStatus(status))
      .catch(() => {});
    return () => controller.abort();
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSwitchMode = (nextMode: AuthModalMode) => {
    setMode(nextMode);
    setFieldErrors({});
    setBannerError(null);
    setBannerSuccess(null);
    setProviderSetupRequired(false);
  };

  const handleGoogleSignIn = async () => {
    if (isSubmitting || isGoogleSubmitting) return;
    setBannerError(null);
    setBannerSuccess(null);
    setProviderSetupRequired(false);
    setIsGoogleSubmitting(true);
    try {
      const result = await signInWithGoogleMinova();
      if (result.ok && result.session) {
        setBannerSuccess(result.message);
        onAuthSuccess(result.session);
      } else {
        setBannerError(result.message);
      }
    } finally {
      setIsGoogleSubmitting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting || isGoogleSubmitting) return;

    setBannerError(null);
    setBannerSuccess(null);
    setProviderSetupRequired(false);

    if (mode === 'signin') {
      const check = validateSignInInput({ email, password });
      setFieldErrors(check.fieldErrors);
      if (!check.valid) {
        setBannerError(
          check.summaryError || 'Please fix the highlighted fields.'
        );
        return;
      }

      setIsSubmitting(true);
      try {
        const result = await signInWithMinova({ email, password });
        if (result.ok && result.session) {
          setBannerSuccess(result.message);
          setPassword('');
          onAuthSuccess(result.session);
        } else {
          setBannerError(result.message);
          if (result.providerSetupRequired) {
            setProviderSetupRequired(true);
          }
        }
      } finally {
        setIsSubmitting(false);
      }
    } else {
      const check = validateSignUpInput({
        displayName,
        email,
        password,
        confirmPassword,
        acceptedTerms,
      });
      setFieldErrors(check.fieldErrors);
      if (!check.valid) {
        setBannerError(
          check.summaryError || 'Please complete all required fields.'
        );
        return;
      }

      setIsSubmitting(true);
      try {
        const result = await signUpWithMinova({
          displayName,
          email,
          password,
          confirmPassword,
          acceptedTerms,
        });
        if (result.ok && result.session) {
          setBannerSuccess(result.message);
          setPassword('');
          setConfirmPassword('');
          onAuthSuccess(result.session);
        } else {
          setBannerError(result.message);
          if (result.providerSetupRequired) {
            setProviderSetupRequired(true);
          }
        }
      } finally {
        setIsSubmitting(false);
      }
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="minova-auth-modal-title"
    >
      <div
        className="fixed inset-0 bg-black/75 backdrop-blur-xs"
        onClick={onClose}
      />
      <div className="relative z-10 w-full max-w-lg rounded-2xl bg-[#0B1120] border border-slate-800 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 sm:px-6 py-4 border-b border-slate-800/80">
          <div className="flex items-center gap-3">
            <MinovaLogo size="sm" />
            <div>
              <h2
                id="minova-auth-modal-title"
                className="text-base font-bold text-white"
              >
                {authSession
                  ? 'MINOVA AI Account'
                  : mode === 'signin'
                  ? 'Sign In to MINOVA AI'
                  : 'Create MINOVA AI Account'}
              </h2>
              <p className="text-xs text-slate-400">
                Developed by Minhaz · Identity & Local Workspace Safety
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
            aria-label="Close authentication modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 sm:p-6 space-y-5 max-h-[84vh] overflow-y-auto text-xs">
          {authSession ? (
            /* Signed In View */
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-[#070B16] border border-emerald-500/40 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="inline-flex items-center gap-1.5 text-emerald-400 font-semibold">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Signed In</span>
                  </span>
                  <span className="font-mono text-[11px] text-slate-400">
                    {authSession.provider}
                  </span>
                </div>
                <div className="text-sm font-bold text-white">
                  {authSession.user.displayName}
                </div>
                <div className="text-slate-400 font-mono">
                  {authSession.user.email}
                </div>
                <div className="text-[11px] text-slate-500 font-mono">
                  UID: {authSession.user.id}
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-[#070B16] border border-slate-800 space-y-1.5 text-slate-300">
                <div className="font-semibold text-white flex items-center gap-1.5">
                  <HardDrive className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Cloud History Sync & Local Data Safety</span>
                </div>
                <p className="text-slate-400 leading-relaxed">
                  Cloud history sync (
                  <code className="text-slate-300">/api/conversations</code>) is
                  not yet enabled on the backend. Your conversations, files, and
                  study sessions remain stored locally in this browser and are
                  never silently uploaded or erased when signing in or signing
                  out.
                </p>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium cursor-pointer"
                >
                  Close
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onSignOut();
                    setBannerSuccess(
                      'Signed out. Local guest workspace preserved.'
                    );
                  }}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/40 text-rose-200 font-semibold cursor-pointer"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Sign Out</span>
                </button>
              </div>
            </div>
          ) : (
            /* Sign In / Sign Up Form View */
            <>
              {/* Mode Switcher Tabs */}
              <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-[#070B16] border border-slate-800">
                <button
                  type="button"
                  onClick={() => handleSwitchMode('signin')}
                  className={`flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg font-semibold transition-colors cursor-pointer ${
                    mode === 'signin'
                      ? 'bg-cyan-500 text-slate-950'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  <LogIn className="w-3.5 h-3.5" />
                  <span>Sign In</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleSwitchMode('signup')}
                  className={`flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg font-semibold transition-colors cursor-pointer ${
                    mode === 'signup'
                      ? 'bg-violet-500 text-white'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  <span>Create Account</span>
                </button>
              </div>

              {/* Live Auth Service Status */}
              {serviceStatus?.authRouteStatus === 'firebase_ready' && (
                <div className="p-3 rounded-xl bg-[#070B16] border border-cyan-500/30 text-slate-300 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
                    <span>
                      Firebase Auth connected (
                      <code className="text-cyan-300">
                        {serviceStatus.firebaseProjectId}
                      </code>
                      )
                    </span>
                  </div>
                  <span className="text-[11px] text-slate-400">
                    Local History Intact
                  </span>
                </div>
              )}

              {serviceStatus?.authRouteStatus === 'not_implemented_501' && (
                <div className="p-3.5 rounded-xl bg-amber-950/30 border border-amber-700/50 text-amber-200/90 space-y-1">
                  <div className="flex items-center gap-1.5 font-semibold text-amber-300">
                    <Info className="w-3.5 h-3.5 shrink-0" />
                    <span>Backend Auth Status: HTTP 501 Not Implemented</span>
                  </div>
                  <p className="text-[11px] text-amber-200/80 leading-relaxed">
                    {serviceStatus.detailMessage} Submitting this form verifies
                    against the live endpoint without faking a login.
                  </p>
                </div>
              )}

              {/* Accessible Error / Success Alert Banners */}
              {bannerError && (
                <div
                  role="alert"
                  className="p-3.5 rounded-xl bg-rose-950/40 border border-rose-700/60 text-rose-200 space-y-2"
                >
                  <div className="flex items-start gap-2.5">
                    <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                    <span className="leading-relaxed">{bannerError}</span>
                  </div>
                  {providerSetupRequired &&
                    serviceStatus?.firebaseConsoleAuthUrl && (
                      <div className="pt-1 pl-6">
                        <a
                          href={serviceStatus.firebaseConsoleAuthUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 text-cyan-300 hover:text-cyan-200 font-semibold underline"
                        >
                          <span>
                            Open Firebase Console Sign-In Providers
                          </span>
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      </div>
                    )}
                </div>
              )}

              {bannerSuccess && (
                <div
                  role="status"
                  className="p-3.5 rounded-xl bg-emerald-950/40 border border-emerald-700/60 text-emerald-200 flex items-start gap-2.5"
                >
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  <span className="leading-relaxed">{bannerSuccess}</span>
                </div>
              )}

              <form onSubmit={handleSubmit} noValidate className="space-y-4">
                {mode === 'signup' && (
                  <div>
                    <label
                      htmlFor="auth-display-name"
                      className="block text-slate-300 mb-1.5 font-medium"
                    >
                      Display Name
                    </label>
                    <input
                      id="auth-display-name"
                      type="text"
                      autoComplete="name"
                      value={displayName}
                      onChange={(e) => {
                        setDisplayName(e.target.value);
                        if (fieldErrors.displayName) {
                          setFieldErrors((prev) => ({
                            ...prev,
                            displayName: undefined,
                          }));
                        }
                      }}
                      placeholder="e.g., Minhaz"
                      aria-invalid={Boolean(fieldErrors.displayName)}
                      className={`w-full px-3.5 py-2.5 rounded-xl bg-[#070B16] border text-slate-100 placeholder:text-slate-500 focus:outline-none ${
                        fieldErrors.displayName
                          ? 'border-rose-500/70 focus:border-rose-400'
                          : 'border-slate-800 focus:border-cyan-500/60'
                      }`}
                    />
                    {fieldErrors.displayName && (
                      <p className="mt-1 text-[11px] text-rose-400">
                        {fieldErrors.displayName}
                      </p>
                    )}
                  </div>
                )}

                <div>
                  <label
                    htmlFor="auth-email"
                    className="block text-slate-300 mb-1.5 font-medium"
                  >
                    Email Address
                  </label>
                  <input
                    id="auth-email"
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      if (fieldErrors.email) {
                        setFieldErrors((prev) => ({
                          ...prev,
                          email: undefined,
                        }));
                      }
                    }}
                    placeholder="you@example.com"
                    aria-invalid={Boolean(fieldErrors.email)}
                    className={`w-full px-3.5 py-2.5 rounded-xl bg-[#070B16] border text-slate-100 placeholder:text-slate-500 focus:outline-none ${
                      fieldErrors.email
                        ? 'border-rose-500/70 focus:border-rose-400'
                        : 'border-slate-800 focus:border-cyan-500/60'
                    }`}
                  />
                  {fieldErrors.email && (
                    <p className="mt-1 text-[11px] text-rose-400">
                      {fieldErrors.email}
                    </p>
                  )}
                </div>

                <div>
                  <label
                    htmlFor="auth-password"
                    className="block text-slate-300 mb-1.5 font-medium"
                  >
                    Password
                  </label>
                  <div className="relative">
                    <input
                      id="auth-password"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete={
                        mode === 'signin' ? 'current-password' : 'new-password'
                      }
                      value={password}
                      onChange={(e) => {
                        setPassword(e.target.value);
                        if (fieldErrors.password) {
                          setFieldErrors((prev) => ({
                            ...prev,
                            password: undefined,
                          }));
                        }
                      }}
                      placeholder="At least 8 characters"
                      aria-invalid={Boolean(fieldErrors.password)}
                      className={`w-full pl-3.5 pr-10 py-2.5 rounded-xl bg-[#070B16] border text-slate-100 placeholder:text-slate-500 focus:outline-none ${
                        fieldErrors.password
                          ? 'border-rose-500/70 focus:border-rose-400'
                          : 'border-slate-800 focus:border-cyan-500/60'
                      }`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((prev) => !prev)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-white cursor-pointer"
                      aria-label={
                        showPassword ? 'Hide password' : 'Show password'
                      }
                    >
                      {showPassword ? (
                        <EyeOff className="w-4 h-4" />
                      ) : (
                        <Eye className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                  {fieldErrors.password && (
                    <p className="mt-1 text-[11px] text-rose-400">
                      {fieldErrors.password}
                    </p>
                  )}
                </div>

                {mode === 'signup' && (
                  <>
                    <div>
                      <label
                        htmlFor="auth-confirm-password"
                        className="block text-slate-300 mb-1.5 font-medium"
                      >
                        Confirm Password
                      </label>
                      <div className="relative">
                        <input
                          id="auth-confirm-password"
                          type={showConfirmPassword ? 'text' : 'password'}
                          autoComplete="new-password"
                          value={confirmPassword}
                          onChange={(e) => {
                            setConfirmPassword(e.target.value);
                            if (fieldErrors.confirmPassword) {
                              setFieldErrors((prev) => ({
                                ...prev,
                                confirmPassword: undefined,
                              }));
                            }
                          }}
                          placeholder="Re-enter your password"
                          aria-invalid={Boolean(fieldErrors.confirmPassword)}
                          className={`w-full pl-3.5 pr-10 py-2.5 rounded-xl bg-[#070B16] border text-slate-100 placeholder:text-slate-500 focus:outline-none ${
                            fieldErrors.confirmPassword
                              ? 'border-rose-500/70 focus:border-rose-400'
                              : 'border-slate-800 focus:border-cyan-500/60'
                          }`}
                        />
                        <button
                          type="button"
                          onClick={() =>
                            setShowConfirmPassword((prev) => !prev)
                          }
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-white cursor-pointer"
                          aria-label={
                            showConfirmPassword
                              ? 'Hide confirm password'
                              : 'Show confirm password'
                          }
                        >
                          {showConfirmPassword ? (
                            <EyeOff className="w-4 h-4" />
                          ) : (
                            <Eye className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                      {fieldErrors.confirmPassword && (
                        <p className="mt-1 text-[11px] text-rose-400">
                          {fieldErrors.confirmPassword}
                        </p>
                      )}
                    </div>

                    {/* Explicit Privacy Policy & Terms Acceptance */}
                    <div className="space-y-1.5">
                      <label className="flex items-start gap-2.5 cursor-pointer select-none">
                        <input
                          id="auth-accept-terms"
                          type="checkbox"
                          checked={acceptedTerms}
                          onChange={(e) => {
                            setAcceptedTerms(e.target.checked);
                            if (fieldErrors.acceptedTerms) {
                              setFieldErrors((prev) => ({
                                ...prev,
                                acceptedTerms: undefined,
                              }));
                            }
                          }}
                          className="mt-0.5 accent-cyan-500 w-4 h-4 cursor-pointer"
                        />
                        <span className="text-slate-300 leading-relaxed">
                          I accept the MINOVA AI{' '}
                          <button
                            type="button"
                            onClick={() =>
                              setShowTermsDetails((prev) => !prev)
                            }
                            className="text-cyan-400 hover:underline font-medium cursor-pointer"
                          >
                            Privacy Policy & Terms of Service
                          </button>
                          .
                        </span>
                      </label>
                      {fieldErrors.acceptedTerms && (
                        <p className="text-[11px] text-rose-400">
                          {fieldErrors.acceptedTerms}
                        </p>
                      )}
                      {showTermsDetails && (
                        <div className="p-3 rounded-xl bg-[#070B16] border border-slate-800 text-[11px] text-slate-400 space-y-1 leading-relaxed">
                          <div className="text-slate-200 font-semibold">
                            MINOVA AI Privacy & Terms Summary
                          </div>
                          <p>
                            1. Local Guest conversations, study sessions, and
                            settings are stored in your browser and are never
                            automatically uploaded to a server when signing in.
                          </p>
                          <p>
                            2. Passwords are never stored in plaintext in
                            browser storage.
                          </p>
                          <p>
                            3. Cloud conversation synchronization (
                            <code className="text-slate-300">
                              /api/conversations
                            </code>
                            ) is not enabled until the backend cloud storage
                            service is active.
                          </p>
                        </div>
                      )}
                    </div>
                  </>
                )}

                <button
                  type="submit"
                  disabled={isSubmitting || isGoogleSubmitting}
                  className={`w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl font-semibold transition-colors cursor-pointer disabled:opacity-50 ${
                    mode === 'signin'
                      ? 'bg-cyan-500 hover:bg-cyan-400 text-slate-950'
                      : 'bg-violet-500 hover:bg-violet-400 text-white'
                  }`}
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>
                        {mode === 'signin'
                          ? 'Verifying Credentials...'
                          : 'Creating Account...'}
                      </span>
                    </>
                  ) : mode === 'signin' ? (
                    <>
                      <LogIn className="w-4 h-4" />
                      <span>Sign In</span>
                    </>
                  ) : (
                    <>
                      <UserPlus className="w-4 h-4" />
                      <span>Create Account</span>
                    </>
                  )}
                </button>
              </form>

              {serviceStatus?.provider === 'firebase-auth' && (
                <div className="space-y-2.5">
                  <div className="relative flex items-center justify-center">
                    <div className="border-t border-slate-800 w-full" />
                    <span className="bg-[#0B1120] px-2.5 text-[11px] text-slate-500 shrink-0">
                      or continue with
                    </span>
                    <div className="border-t border-slate-800 w-full" />
                  </div>
                  <button
                    type="button"
                    onClick={handleGoogleSignIn}
                    disabled={isSubmitting || isGoogleSubmitting}
                    className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-[#070B16] hover:bg-slate-800 border border-slate-700 text-slate-200 font-semibold transition-colors cursor-pointer disabled:opacity-50"
                  >
                    {isGoogleSubmitting ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin text-cyan-400" />
                        <span>Connecting to Google...</span>
                      </>
                    ) : (
                      <span>Continue with Google (Firebase Auth)</span>
                    )}
                  </button>
                </div>
              )}

              {/* Guest Mode & Data Safety Guarantee Footer */}
              <div className="pt-4 border-t border-slate-800/80 space-y-3">
                <div className="flex items-start gap-2.5 text-[11px] text-slate-400 leading-relaxed">
                  <ShieldCheck className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
                  <div>
                    <strong className="text-slate-200">
                      Guest Mode & Local Data Safety:
                    </strong>{' '}
                    You can use all MINOVA AI features without an account. Guest
                    chat history stays in your browser and is never silently
                    uploaded or erased. Account authentication does not
                    automatically enable cloud history sync.
                  </div>
                </div>

                <button
                  type="button"
                  onClick={onClose}
                  className="w-full py-2 px-3 rounded-xl bg-[#070B16] hover:bg-slate-800/80 border border-slate-800 text-slate-300 hover:text-white font-medium transition-colors cursor-pointer"
                >
                  Continue in Guest Mode (Local Workspace)
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
