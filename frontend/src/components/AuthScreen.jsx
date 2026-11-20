import React, { useState, useEffect } from 'react';
import { loginAccount, registerAccount, resetPasswordAccount } from '../lib/auth';
import BrandMark from './BrandMark';
import ThemeToggle from './ThemeToggle';
import NeuralBackdrop from './NeuralBackdrop';

function MailIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
      <rect x="3" y="5" width="18" height="14" rx="2.5" strokeWidth="1.8" />
      <path d="M4 7l8 6 8-6" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
      <rect x="4" y="11" width="16" height="9" rx="2.5" strokeWidth="1.8" />
      <path d="M8 11V7.5a4 4 0 018 0V11" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function UserIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
      <circle cx="12" cy="8" r="4" strokeWidth="1.8" />
      <path d="M5 20a7 7 0 0114 0" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function KeyIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
      <circle cx="7.5" cy="15.5" r="4.5" strokeWidth="1.8" />
      <path d="M10.8 12.2L20 3m-3 3l2 2m-4 0l2 2" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function EyeIcon({ open }) {
  return open ? (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
      <path
        d="M3 12s3.5-6 9-6 9 6 9 6-3.5 6-9 6-9-6-9-6z"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12" r="2.6" strokeWidth="1.8" />
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
      <path
        d="M3 3l18 18M10.6 10.6a2 2 0 002.8 2.8M9.9 5.2A9.7 9.7 0 0112 5c5.5 0 9 7 9 7a16.5 16.5 0 01-3.2 4.1M6.6 6.6A16.5 16.5 0 003 12s3.5 7 9 7a9.7 9.7 0 003.9-.8"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function AuthScreen({
  initialMode = 'login',
  onBackToLanding,
  theme = 'dark',
  onToggleTheme,
}) {
  const [mode, setMode] = useState(initialMode || 'login');
  const [signupRole, setSignupRole] = useState('student');
  const [fullName, setFullName] = useState('');
  const [educatorCode, setEducatorCode] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [isError, setIsError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    setMode(initialMode || 'login');
    setMessage('');
    setIsError(false);
  }, [initialMode]);

  const switchMode = (nextMode) => {
    setMode(nextMode);
    setMessage('');
    setIsError(false);
  };

  const hasMinLen = password.length >= 8;
  const hasMixedChars = /[a-zA-Z]/.test(password) && /\d/.test(password);

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setMessage('');
    setIsError(false);

    try {
      let session = null;
      if (mode === 'reset') {
        setMessage('Updating credentials…');
        session = await resetPasswordAccount({ email, newPassword: password });
      } else if (mode === 'signup') {
        setMessage('Configuring academic workspace…');
        session = await registerAccount({
          email,
          password,
          fullName,
          requestedRole: signupRole,
          educatorCode: signupRole === 'professor' ? educatorCode : undefined,
        });
      } else {
        setMessage('Authenticating credentials…');
        session = await loginAccount({ email, password });
      }

      if (!session?.access_token) {
        setIsError(true);
        setMessage('Authentication did not return an active session. Please check your credentials.');
        return;
      }

      setIsError(false);
      setMessage(
        mode === 'signup'
          ? 'Workspace initialized. Redirecting…'
          : mode === 'reset'
            ? 'Password updated. Entering workspace…'
            : 'Signed in. Redirecting to workspace…'
      );

      if (window.location.pathname !== '/') {
        window.history.pushState({}, '', '/');
        window.dispatchEvent(new PopStateEvent('popstate'));
      }
    } catch (error) {
      setIsError(true);
      const rawMsg = error.message || '';
      setMessage(rawMsg || 'Authentication failed. Please check your credentials.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="auth-shell auth-monolith-shell">
      <NeuralBackdrop theme={theme} />
      <div className="auth-grid-bg" aria-hidden="true" />
      <div className="auth-glow-top" aria-hidden="true" />
      <div className="auth-glow-bottom" aria-hidden="true" />

      {/* Top Floating Anchor Bar */}
      <header className="auth-monolith-topbar">
        {onBackToLanding ? (
          <button
            type="button"
            className="auth-back-pill"
            onClick={onBackToLanding}
            title="Return to home page"
          >
            ← Back to Home
          </button>
        ) : (
          <span />
        )}
        {onToggleTheme && <ThemeToggle theme={theme} onToggle={onToggleTheme} compact />}
      </header>

      {/* Centerpiece Golden-Ratio Monolith Card */}
      <div className="auth-monolith-container">
        <section className="auth-monolith-card">
          <div className="auth-monolith-rim" aria-hidden="true" />

          {/* Clean Brand Mark (Clickable to return Home) */}
          <div className="auth-monolith-brand">
            {onBackToLanding ? (
              <button
                type="button"
                className="auth-brand-btn"
                onClick={onBackToLanding}
                title="EduForge AI — Click to return to Home"
              >
                <BrandMark size="md" sublabel="Course-Grounded AI Studio" />
              </button>
            ) : (
              <BrandMark size="md" sublabel="Course-Grounded AI Studio" />
            )}
          </div>

          {/* Mode Switcher Segmented Pills */}
          {mode !== 'reset' && (
            <div className="auth-segmented-dock" role="tablist">
              <div className="auth-segmented-pills">
                <button
                  type="button"
                  role="tab"
                  aria-selected={mode === 'login'}
                  className={`auth-segmented-pill ${mode === 'login' ? 'active' : ''}`}
                  onClick={() => switchMode('login')}
                >
                  Sign In
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={mode === 'signup'}
                  className={`auth-segmented-pill ${mode === 'signup' ? 'active' : ''}`}
                  onClick={() => switchMode('signup')}
                >
                  Create Account
                </button>
              </div>
            </div>
          )}

          {/* Editorial Title & Subtitle */}
          <div className="auth-monolith-head">
            <h2>
              {mode === 'signup' ? (
                <>
                  Create your <em className="auth-title-serif">studio.</em>
                </>
              ) : mode === 'reset' ? (
                <>
                  Reset your <em className="auth-title-serif">password.</em>
                </>
              ) : (
                <>
                  Welcome to <em className="auth-title-serif">the studio.</em>
                </>
              )}
            </h2>
            <p>
              {mode === 'signup'
                ? 'Select your role to initialize an isolated academic workspace.'
                : mode === 'reset'
                  ? 'Enter your institutional email and choose a new password.'
                  : 'Course-grounded neural lectures & cited intelligence.'}
            </p>
          </div>

          {/* Role Grid for Sign Up */}
          {mode === 'signup' && (
            <div className="auth-role-grid" role="group" aria-label="Account Role">
              <button
                type="button"
                className={`role-card-btn ${signupRole === 'student' ? 'active stud' : ''}`}
                onClick={() => setSignupRole('student')}
              >
                <div className="role-card-header">
                  <span className="role-card-badge stud">STUDENT</span>
                  <span className="role-card-dot" />
                </div>
                <b>Student Space</b>
                <small>Lectures &amp; cited tutor</small>
              </button>

              <button
                type="button"
                className={`role-card-btn ${signupRole === 'professor' ? 'active prof' : ''}`}
                onClick={() => setSignupRole('professor')}
              >
                <div className="role-card-header">
                  <span className="role-card-badge prof">FACULTY</span>
                  <span className="role-card-dot" />
                </div>
                <b>Educator Studio</b>
                <small>Decks &amp; quiz engine</small>
              </button>
            </div>
          )}

          {/* Main Auth Form */}
          <form className="auth-monolith-form" onSubmit={submit}>
            {mode === 'signup' && (
              <label className="auth-field">
                <span className="auth-field-label">Full Name</span>
                <div className="auth-input-wrapper">
                  <span className="auth-icon" aria-hidden="true">
                    <UserIcon />
                  </span>
                  <input
                    type="text"
                    autoComplete="name"
                    required
                    placeholder={signupRole === 'professor' ? 'Dr. Maya Rao' : 'Aarav Sharma'}
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                  />
                </div>
              </label>
            )}

            {mode === 'signup' && signupRole === 'professor' && (
              <label className="auth-field">
                <div className="auth-field-row">
                  <span className="auth-field-label">Faculty Authorization Key</span>
                </div>
                <div className="auth-input-wrapper">
                  <span className="auth-icon" aria-hidden="true">
                    <KeyIcon />
                  </span>
                  <input
                    type="text"
                    required
                    placeholder="Enter institutional authorization key"
                    value={educatorCode}
                    onChange={(e) => setEducatorCode(e.target.value)}
                  />
                </div>
              </label>
            )}

            <label className="auth-field">
              <span className="auth-field-label">Institutional Email</span>
              <div className="auth-input-wrapper">
                <span className="auth-icon" aria-hidden="true">
                  <MailIcon />
                </span>
                <input
                  type="email"
                  autoComplete="email"
                  required
                  placeholder="you@university.edu"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
            </label>

            <label className="auth-field">
              <div className="auth-field-row">
                <span className="auth-field-label">
                  {mode === 'reset' ? 'New Password' : 'Password'}
                </span>
                {mode === 'login' && (
                  <button
                    type="button"
                    className="auth-link-inline"
                    onClick={() => switchMode('reset')}
                  >
                    Forgot?
                  </button>
                )}
              </div>
              <div className="auth-input-wrapper">
                <span className="auth-icon" aria-hidden="true">
                  <LockIcon />
                </span>
                <input
                  type={showPassword ? 'text' : 'password'}
                  autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                  required
                  minLength={8}
                  placeholder={mode === 'reset' ? 'New password (min. 8 characters)' : 'Minimum 8 characters'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <button
                  type="button"
                  className="auth-eye-btn"
                  onClick={() => setShowPassword((prev) => !prev)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  <EyeIcon open={showPassword} />
                </button>
              </div>

              {(mode === 'signup' || mode === 'reset') && (
                <div className="auth-pw-criteria">
                  <span className={`pw-criterion ${hasMinLen ? 'valid' : ''}`}>
                    <i>{hasMinLen ? '✓' : '·'}</i> 8+ characters
                  </span>
                  <span className={`pw-criterion ${hasMixedChars ? 'valid' : ''}`}>
                    <i>{hasMixedChars ? '✓' : '·'}</i> Letters &amp; digits
                  </span>
                </div>
              )}
            </label>

            {/* Primary Action Button */}
            <button type="submit" className="auth-submit-btn" disabled={busy}>
              <span>
                {busy
                  ? 'Verifying…'
                  : mode === 'signup'
                    ? `Launch ${signupRole === 'professor' ? 'Educator Studio' : 'Student Space'}`
                    : mode === 'reset'
                      ? 'Update Password & Enter Studio'
                      : 'Sign In to Workspace'}
              </span>
              {!busy && <i>→</i>}
            </button>
          </form>

          {/* Feedback Status Toast */}
          {message && (
            <div
              className={`auth-status-toast ${isError ? 'error' : 'success'}`}
              role="status"
            >
              <span>{isError ? '⚠' : '✓'}</span>
              <span>{message}</span>
            </div>
          )}

          {/* Footer Navigation */}
          <div className="auth-monolith-footer">
            {mode !== 'reset' ? (
              <button
                type="button"
                className="auth-switch-link"
                onClick={() => switchMode(mode === 'signup' ? 'login' : 'signup')}
              >
                {mode === 'signup' ? (
                  <>
                    Already have an account? <em>Sign in →</em>
                  </>
                ) : (
                  <>
                    New to EduForge AI? <em>Create an account →</em>
                  </>
                )}
              </button>
            ) : (
              <button
                type="button"
                className="auth-switch-link"
                onClick={() => switchMode('login')}
              >
                ← Back to sign in
              </button>
            )}

            <span className="auth-monolith-footnote">
              <LockIcon /> Strict role isolation enforced • AES encrypted
            </span>
          </div>
        </section>
      </div>
    </main>
  );
}
