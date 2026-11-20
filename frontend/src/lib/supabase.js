const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
const storageKey = 'eduforge.supabase.session';
const verifierKey = 'eduforge.supabase.pkce_verifier';
const readSession = () => JSON.parse(localStorage.getItem(storageKey) || 'null');
const writeSession = (session) => { if (session) localStorage.setItem(storageKey, JSON.stringify(session)); else localStorage.removeItem(storageKey); window.dispatchEvent(new Event('eduforge-auth')); };
const request = async (path, body) => { const res = await fetch(`${url}/auth/v1/${path}`, { method: 'POST', headers: { apikey: key, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); const data = await res.json(); return { data, error: res.ok ? null : { message: data.msg || data.message || 'Authentication request failed.' } }; };
const base64url = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const createPkce = async () => { const verifier = base64url(crypto.getRandomValues(new Uint8Array(32))); const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)); sessionStorage.setItem(verifierKey, verifier); return { verifier, challenge: base64url(new Uint8Array(digest)) }; };
const consumeAuthRedirect = async () => {
  // Supabase confirmation and recovery links may return an implicit-token fragment.
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  const access_token = hash.get('access_token');
  const refresh_token = hash.get('refresh_token');
  if (access_token && refresh_token) {
    writeSession({ access_token, refresh_token, token_type: hash.get('token_type') || 'bearer', expires_in: Number(hash.get('expires_in') || 0) });
    window.history.replaceState({}, document.title, window.location.pathname);
  }
  const code = new URLSearchParams(window.location.search).get('code');
  const verifier = sessionStorage.getItem(verifierKey);
  if (code && verifier) {
    const exchange = await request('token?grant_type=pkce', { auth_code: code, code_verifier: verifier });
    if (!exchange.error) { sessionStorage.removeItem(verifierKey); writeSession(exchange.data); window.history.replaceState({}, document.title, window.location.pathname); }
  }
  return readSession();
};
// Minimal Supabase Auth browser client. Only the public anon key is used; no service key reaches the browser.
export const supabase = url && key ? { auth: {
  getSession: async () => ({ data: { session: await consumeAuthRedirect() } }),
  signUp: async ({ email, password, options }) => { const pkce = await createPkce(); const r = await request('signup', { email, password, options, code_challenge: pkce.challenge, code_challenge_method: 's256' }); if (!r.error && r.data.access_token) writeSession(r.data); return r; },
  signInWithPassword: async ({ email, password }) => { const r = await request('token?grant_type=password', { email, password }); if (!r.error) writeSession(r.data); return r; },
  resetPasswordForEmail: ({ email, options }) => request('recover', { email, options }),
  signOut: async () => { writeSession(null); return { error: null }; },
  onAuthStateChange: (callback) => { const listener = () => callback('SIGNED_IN', readSession()); window.addEventListener('eduforge-auth', listener); return { data: { subscription: { unsubscribe: () => window.removeEventListener('eduforge-auth', listener) } } }; },
} } : null;

export const isSupabaseConfigured = Boolean(supabase);
