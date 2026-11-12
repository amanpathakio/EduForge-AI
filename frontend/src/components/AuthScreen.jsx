import React, { useState, useEffect } from 'react';
import { loginAccount, registerAccount } from '../lib/auth';
import BrandMark from './BrandMark';
import ThemeToggle from './ThemeToggle';
import NeuralBackdrop from './NeuralBackdrop';

const WAVE_BARS = [
  28, 56, 40, 82, 64, 94, 48, 72, 88, 54, 96, 62,
  44, 78, 90, 52, 68, 86, 42, 74, 58, 80, 46, 34,
];

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
  const [showcaseRole, setShowcaseRole] = useState('professor');
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

  const handlePointerMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    e.currentTarget.style.setProperty('--mx', `${e.clientX - rect.left}px`);
    e.currentTarget.style.setProperty('--my', `${e.clientY - rect.top}px`);
  };

  const switchMode = (nextMode) => {
    setMode(nextMode);
    setMessage('');
    setIsError(false);
  };

  const hasMinLen = password.length >= 8;
  const hasMixedChars = /[a-zA-Z]/.test(password) && /\d/.test(password);

  const submit = async (event) => {
    event.preventDefault();
    if (mode === 'reset') {
      setIsError(false);
      setMessage('Ask your institutional administrator to reset an existing account password.');
      return;
    }

    setBusy(true);
    setMessage('');
    setIsError(false);

    try {
      setMessage(mode === 'login' ? 'Signing in securely…' : 'Creating your account…');
      const session =
        mode === 'signup'
          ? await registerAccount({
              email,
              password,
              fullName,
              requestedRole: signupRole,
              educatorCode: signupRole === 'professor' ? educatorCode : undefined,
            })
          : await loginAccount({ email, password });

      if (!session?.access_token) {
        setIsError(true);
        setMessage('Authentication did not return an active session. Please try again.');
        return;
      }

      setIsError(false);
      setMessage(mode === 'signup' ? 'Account created. Opening your workspace…' : 'Signed in. Opening your workspace…');
      if (window.location.pathname !== '/') {
        window.history.pushState({}, '', '/');
      }
    } catch (error) {
      setIsError(true);
      setMessage(error.message || 'Authentication failed.');
    } finally {
      setBusy(false);
    }
  };

  const title =
    mode === 'signup'
      ? 'Create your studio.'
      : mode === 'reset'
        ? 'Reset password.'
        : 'Welcome back.';

  const helper =
    mode === 'signup'
      ? 'Launch a role-isolated course workspace powered by cited RAG.'
      : mode === 'reset'
        ? 'Enter your academic email and we will send a recovery link.'
        : 'Sign in to resume your lectures, courses, and grounded AI workspace.';

  const modeLabel =
    mode === 'signup'
      ? 'NEW ACADEMIC ACCESS'
      : mode === 'reset'
        ? 'ACCOUNT RECOVERY'
        : 'ROLE-VERIFIED LOGIN';

  return (
    <main className="auth-shell" onPointerMove={handlePointerMove}>
      <NeuralBackdrop theme={theme} />
      <div className="auth-grid-bg" aria-hidden="true" />
      <div className="auth-spotlight" aria-hidden="true" />
      <div className="auth-orb auth-orb-one" aria-hidden="true" />
      <div className="auth-orb auth-orb-two" aria-hidden="true" />

      <header className="auth-topbar">
        {onBackToLanding ? (
          <button type="button" className="auth-back-btn" onClick={onBackToLanding}>
            ← Back to overview
          </button>
        ) : (
          <span />
        )}
        {onToggleTheme && <ThemeToggle theme={theme} onToggle={onToggleTheme} compact />}
      </header>

      <div className="auth-grid">
        {/* LEFT: LIVE KINETIC ENGINE SHOWCASE */}
        <section className="auth-showcase">
          <div className="auth-brand-wrap">
            <BrandMark size="md" sublabel="Course-Grounded AI Teaching Studio" />
          </div>

          <p className="eyebrow">NEXT-GEN ACADEMIC ENGINE</p>
          <h1>
            Living lectures.
            <br />
            <em>Audited truth.</em>
          </h1>
          <p className="auth-showcase-lead">
            Turn static course PDFs into grounded slide decks, voice-narrated teaching modules, and cited student Q&amp;A with strict role boundaries.
          </p>

          {/* Animated Kinetic Stage */}
          <div className="kinetic-stage">
            <div className="kinetic-stage-head">
              <div className="kinetic-role-pills" role="tablist" aria-label="Role architecture preview">
                <button
                  type="button"
                  role="tab"
                  aria-selected={showcaseRole === 'professor'}
                  className={showcaseRole === 'professor' ? 'active' : ''}
                  onClick={() => setShowcaseRole('professor')}
                >
                  Professor Studio
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={showcaseRole === 'student'}
                  className={showcaseRole === 'student' ? 'active teal' : 'teal'}
                  onClick={() => setShowcaseRole('student')}
                >
                  Student Space
                </button>
              </div>
              <span className="kinetic-live-pill">
                <i aria-hidden="true" />
                {showcaseRole === 'professor' ? 'VOICE + SLIDES' : 'CITED ACCESS'}
              </span>
            </div>

            {showcaseRole === 'professor' ? (
              <div className="kinetic-body">
                {/* Animated Pipeline Packet Flow */}
                <div className="kinetic-beam-rail">
                  <div className="beam-node">CS301.pdf</div>
                  <div className="beam-track" aria-hidden="true">
                    <span className="beam-pulse" />
                  </div>
                  <div className="beam-node mid">Indexed Vault</div>
                  <div className="beam-track" aria-hidden="true">
                    <span className="beam-pulse delay" />
                  </div>
                  <div className="beam-node end">Lecture Studio</div>
                </div>

                {/* Live Voice Synthesis Visualizer */}
                <div className="voice-wave-card">
                  <div className="voice-wave-meta">
                    <span>PROFESSOR VOICE SYNTHESIS PREVIEW</span>
                    <code>ACTIVE STREAM</code>
                  </div>
                  <div className="voice-wave-bars" aria-hidden="true">
                    {WAVE_BARS.map((height, idx) => (
                      <span
                        key={idx}
                        style={{
                          '--bar-h': `${height}%`,
                          '--bar-delay': `${(idx * 0.07).toFixed(2)}s`,
                        }}
                      />
                    ))}
                  </div>
                  <div className="voice-caption-bar">
                    <span className="caption-tag">SLIDE 03</span>
                    <p>&ldquo;Round Robin guarantees bounded response across circular queues…&rdquo;</p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="kinetic-body">
                <div className="student-rag-stage">
                  <div className="student-match-row">
                    <div>
                      <span className="match-kicker">SEMANTIC CHUNK RETRIEVAL</span>
                      <b>OS_Principles.pdf · Page 14</b>
                    </div>
                    <span className="match-score-pill">82% Match</span>
                  </div>
                  <div className="kinetic-scan-bar" aria-hidden="true">
                    <span className="scan-sweep" />
                  </div>
                  <div className="student-boundary-grid">
                    <div className="boundary-pill allowed">
                      <span>✓</span>
                      <div>
                        <b>Published Lectures &amp; Quizzes</b>
                        <small>Unlocked upon course access</small>
                      </div>
                    </div>
                    <div className="boundary-pill locked">
                      <span>⌘</span>
                      <div>
                        <b>Draft Decks &amp; Answer Keys</b>
                        <small>Restricted to Professor role</small>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* RIGHT: ROTATING CONIC BEAM AUTH CARD */}
        <div className="auth-card-beam">
          <section className="auth-card" aria-label="Authentication form">
            <div className="auth-mobile-brand">
              <BrandMark size="sm" />
            </div>

            {mode !== 'reset' && (
              <div className="auth-mode-tabs" role="tablist" aria-label="Authentication mode">
                <span
                  className={`auth-tab-slider ${mode === 'signup' ? 'right' : ''}`}
                  aria-hidden="true"
                />
                <button
                  type="button"
                  role="tab"
                  aria-selected={mode === 'login'}
                  className={mode === 'login' ? 'active' : ''}
                  onClick={() => switchMode('login')}
                >
                  Sign In
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={mode === 'signup'}
                  className={mode === 'signup' ? 'active' : ''}
                  onClick={() => switchMode('signup')}
                >
                  Create Account
                </button>
              </div>
            )}

            <div className="auth-card-top">
              <p className="eyebrow">{modeLabel}</p>
              <h2>{title}</h2>
              <p>{helper}</p>
            </div>

            {mode === 'signup' && (
              <div className="role-selector-grid" role="group" aria-label="Workspace role">
                <button
                  type="button"
                  className={`role-tile ${signupRole === 'student' ? 'selected teal' : ''}`}
                  onClick={() => setSignupRole('student')}
                >
                  <span className="role-tile-dot" aria-hidden="true" />
                  <div>
                    <b>Student</b>
                    <small>Published lectures &amp; tutor</small>
                  </div>
                </button>
                <button
                  type="button"
                  className={`role-tile ${signupRole === 'professor' ? 'selected indigo' : ''}`}
                  onClick={() => setSignupRole('professor')}
                >
                  <span className="role-tile-dot" aria-hidden="true" />
                  <div>
                    <b>Professor</b>
                    <small>PDFs, lectures &amp; grading</small>
                  </div>
                </button>
              </div>
            )}

            <form onSubmit={submit}>
              {mode === 'signup' && (
                <label className="auth-field-group">
                  <span>Full Name</span>
                  <div className="auth-input-shell">
                    <span className="auth-input-icon" aria-hidden="true">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                        <circle cx="12" cy="8" r="4" strokeWidth="1.8" />
                        <path d="M5 20a7 7 0 0114 0" strokeWidth="1.8" strokeLinecap="round" />
                      </svg>
                    </span>
                    <input
                      type="text"
                      autoComplete="name"
                      placeholder={signupRole === 'professor' ? 'Dr. Maya Rao' : 'Aarav Sharma'}
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                    />
                  </div>
                </label>
              )}

              {mode === 'signup' && signupRole === 'professor' && (
                <label className="auth-field-group">
                  <span>Educator Access Code</span>
                  <div className="auth-input-shell">
                    <span className="auth-input-icon">
                      <LockIcon />
                    </span>
                    <input
                      type="text"
                      required
                      placeholder="Enter institutional educator code"
                      value={educatorCode}
                      onChange={(e) => setEducatorCode(e.target.value)}
                    />
                  </div>
                </label>
              )}

              <label className="auth-field-group">
                <span>University Email</span>
                <div className="auth-input-shell">
                  <span className="auth-input-icon">
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

              {mode !== 'reset' && (
                <label className="auth-field-group">
                  <span>Password</span>
                  <div className="auth-input-shell password-field">
                    <span className="auth-input-icon">
                      <LockIcon />
                    </span>
                    <input
                      type={showPassword ? 'text' : 'password'}
                      autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                      required
                      minLength={8}
                      placeholder="Minimum 8 characters"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                    <button
                      type="button"
                      className="password-toggle"
                      onClick={() => setShowPassword((value) => !value)}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                      title={showPassword ? 'Hide password' : 'Show password'}
                    >
                      <EyeIcon open={showPassword} />
                    </button>
                  </div>

                  {mode === 'signup' && (
                    <div className="password-strength-row" aria-live="polite">
                      <span className={`pw-check ${hasMinLen ? 'met' : ''}`}>
                        <i>{hasMinLen ? '✓' : '·'}</i> 8+ chars
                      </span>
                      <span className={`pw-check ${hasMixedChars ? 'met' : ''}`}>
                        <i>{hasMixedChars ? '✓' : '·'}</i> Letters &amp; digits
                      </span>
                    </div>
                  )}
                </label>
              )}

              <button type="submit" className="auth-submit auth-submit-shimmer" disabled={busy}>
                <span>
                  {busy
                    ? 'Please wait…'
                    : mode === 'signup'
                      ? `Create ${signupRole === 'professor' ? 'Educator' : 'Student'} Account`
                      : mode === 'reset'
                        ? 'Send recovery link'
                        : 'Enter EduForge'}
                </span>
                {!busy && <i aria-hidden="true">→</i>}
              </button>
            </form>

            {message && (
              <p
                className={`auth-message ${isError ? 'auth-message-error' : 'auth-message-success'}`}
                role="status"
              >
                {message}
              </p>
            )}

            <div className="auth-links">
              {mode !== 'reset' ? (
                <>
                  <button
                    type="button"
                    onClick={() => switchMode(mode === 'signup' ? 'login' : 'signup')}
                  >
                    {mode === 'signup'
                      ? 'Already have an account? Sign in'
                      : 'New to EduForge? Create an account'}
                  </button>
                  {mode === 'login' && (
                    <button type="button" onClick={() => switchMode('reset')}>
                      Forgot password?
                    </button>
                  )}
                </>
              ) : (
                <>
                  <button type="button" onClick={() => switchMode('login')}>
                    ← Back to sign in
                  </button>
                  <button type="button" onClick={() => switchMode('signup')}>
                    Create a new account
                  </button>
                </>
              )}
            </div>

            <p className="auth-privacy-note">
              {mode === 'signup' && signupRole === 'professor'
                ? 'Educator accounts require a verified institutional code · Drafts stay private until published.'
                : 'Role boundaries enforced server-side · Draft materials isolated from students.'}
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}
