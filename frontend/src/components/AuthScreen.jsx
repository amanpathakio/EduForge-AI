import { useState } from 'react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';

export default function AuthScreen() {
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const submit = async (event) => {
    event.preventDefault(); setBusy(true); setMessage('');
    const redirectTo = window.location.origin;
    try {
      setMessage(mode === 'login' ? 'Signing in securely…' : 'Contacting Supabase…');
      const result = mode === 'signup'
        ? await supabase.auth.signUp({ email, password, options: { emailRedirectTo: redirectTo } })
        : mode === 'reset'
          ? await supabase.auth.resetPasswordForEmail(email, { redirectTo })
          : await supabase.auth.signInWithPassword({ email, password });
      if (result.error) { setMessage(result.error.message); return; }
      if (mode === 'login') {
        if (!result.data?.access_token) { setMessage('Supabase did not return a login session. Please try again.'); return; }
        setMessage('Signed in. Opening your workspace…');
        window.setTimeout(() => window.location.assign(window.location.origin), 250);
        return;
      }
      setMessage(mode === 'signup' ? 'Check your email to confirm your account.' : 'Password reset email sent.');
    } catch (error) {
      setMessage(`Could not reach Supabase: ${error.message || 'network request failed.'}`);
    } finally { setBusy(false); }
  };
  if (!isSupabaseConfigured) return <main className="auth-shell"><section className="auth-card"><h1>EduForge AI</h1><p>Authentication has not been configured. Add the public Supabase URL and anon key to the frontend environment.</p></section></main>;
  const title = mode === 'signup' ? 'Create your learning studio.' : mode === 'reset' ? 'Reset your password.' : 'Welcome back.';
  const helper = mode === 'signup' ? 'Start as a learner. Your role is secured by the platform, never your browser.' : mode === 'reset' ? 'We’ll send a secure reset link to your inbox.' : 'Continue building learning experiences that stay connected to the source.';
  const modeLabel = mode === 'signup' ? 'CREATE ACCOUNT' : mode === 'reset' ? 'ACCOUNT RECOVERY' : 'SIGN IN';
  return <main className="auth-shell">
    <div className="auth-orb auth-orb-one" /><div className="auth-orb auth-orb-two" />
    <section className="auth-showcase">
      <div className="auth-brand"><span className="auth-mark">↗</span><b>EduForge<span>AI</span></b></div>
      <p className="eyebrow">THE LEARNING INTELLIGENCE PLATFORM</p>
      <h1>Teach what matters.<br /><em>See what changes.</em></h1>
      <p>EduForge turns course evidence into teachable experiences—and helps every learner find the next right step.</p>
      <div className="auth-learning-map" aria-label="EduForge learning workflow">
        <div><span>01</span><b>Course evidence</b><small>PDFs, readings, sources</small></div>
        <i aria-hidden="true">→</i>
        <div><span>02</span><b>Teaching assets</b><small>Lectures, video, assessment</small></div>
        <i aria-hidden="true">→</i>
        <div><span>03</span><b>Learning signals</b><small>Progress and next actions</small></div>
      </div>
      <div className="auth-proof"><span>Source-grounded</span><span>Professor-reviewed</span><span>Built for progress</span></div>
    </section>
    <section className="auth-card">
      <div className="auth-card-top"><p className="eyebrow">{modeLabel}</p><h2>{title}</h2><p>{helper}</p></div>
      <form onSubmit={submit}>
        <label>Email address<input type="email" autoComplete="email" required placeholder="you@university.edu" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
        {mode !== 'reset' && <label>Password<div className="password-field"><input type={showPassword ? 'text' : 'password'} autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} required minLength="8" placeholder="At least 8 characters" value={password} onChange={(e) => setPassword(e.target.value)} /><button type="button" className="password-toggle" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? 'Hide password' : 'Show password'}>{showPassword ? 'Hide' : 'Show'}</button></div></label>}
        <button className="auth-submit" disabled={busy}>{busy ? 'Please wait…' : mode === 'signup' ? 'Create secure account →' : mode === 'reset' ? 'Send reset link →' : 'Enter EduForge →'}</button>
      </form>
      {message && <p className="auth-message">{message}</p>}
      <div className="auth-links"><button onClick={() => setMode(mode === 'signup' ? 'login' : 'signup')}>{mode === 'signup' ? 'Already have an account? Sign in' : 'New to EduForge? Create an account'}</button>{mode !== 'signup' && <button onClick={() => setMode('reset')}>Forgot password?</button>}{mode === 'reset' && <button onClick={() => setMode('login')}>Back to sign in</button>}</div>
      <p className="auth-privacy-note">Protected sign-in · Your account controls access to your courses and learning history.</p>
    </section>
  </main>;
}
