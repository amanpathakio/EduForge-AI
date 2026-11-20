const API_BASE_URL = import.meta.env.DEV ? '' : (import.meta.env.VITE_API_BASE_URL || '');
const STORAGE_KEY = 'eduforge.session';
const LEGACY_SUPABASE_KEY = 'eduforge.supabase.session';

function readStoredSession() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY) || localStorage.getItem(LEGACY_SUPABASE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeSession(session) {
  try {
    if (session?.access_token) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    } else {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(LEGACY_SUPABASE_KEY);
    }
  } catch {
    // Ignore storage quota errors in restricted browsing modes
  }
  window.dispatchEvent(new Event('eduforge-auth'));
}

async function parseError(res, fallback) {
  try {
    const data = await res.json();
    if (typeof data?.detail === 'string') return data.detail;
    if (Array.isArray(data?.detail) && data.detail[0]?.msg) return data.detail[0].msg;
    return data?.message || fallback;
  } catch {
    return fallback;
  }
}

export function getAccessToken() {
  return readStoredSession()?.access_token || null;
}

export async function getSession() {
  const stored = readStoredSession();
  if (!stored?.access_token) return null;
  try {
    const res = await fetch(`${API_BASE_URL}/auth/me`, {
      headers: { Authorization: `Bearer ${stored.access_token}` },
    });
    if (res.status === 401) {
      writeSession(null);
      return null;
    }
    if (!res.ok) return stored;
    const user = await res.json();
    const updated = { access_token: stored.access_token, token_type: 'bearer', user };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    } catch {
      // ignore
    }
    return updated;
  } catch {
    return stored;
  }
}

async function authFetch(url, options) {
  try {
    return await fetch(url, options);
  } catch (err) {
    if (err?.name === 'TypeError' || err?.message?.includes('fetch')) {
      throw new Error('Backend service is currently unreachable (port 8010). Please verify the server is running.');
    }
    throw err;
  }
}

export async function loginAccount({ email, password }) {
  const res = await authFetch(`${API_BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    throw new Error(await parseError(res, 'Sign-in failed.'));
  }
  const session = await res.json();
  writeSession(session);
  return session;
}

export async function registerAccount({ email, password, fullName, requestedRole, educatorCode }) {
  const res = await authFetch(`${API_BASE_URL}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email,
      password,
      full_name: fullName || null,
      requested_role: requestedRole || 'student',
      educator_code: educatorCode || null,
    }),
  });
  if (!res.ok) {
    throw new Error(await parseError(res, 'Account creation failed.'));
  }
  const session = await res.json();
  writeSession(session);
  return session;
}

export async function resetPasswordAccount({ email, newPassword }) {
  const res = await authFetch(`${API_BASE_URL}/auth/reset-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, new_password: newPassword }),
  });
  if (!res.ok) {
    throw new Error(await parseError(res, 'Password reset failed.'));
  }
  const session = await res.json();
  writeSession(session);
  return session;
}

export async function upgradeToEducator(educatorCode) {
  const token = getAccessToken();
  if (!token) throw new Error('Please sign in first.');
  const res = await fetch(`${API_BASE_URL}/auth/upgrade-role`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ educator_code: educatorCode }),
  });
  if (!res.ok) {
    throw new Error(await parseError(res, 'Could not verify educator code.'));
  }
  const session = await res.json();
  writeSession(session);
  return session;
}

export function signOut() {
  writeSession(null);
}

export function onAuthStateChange(callback) {
  const listener = () => callback(readStoredSession());
  window.addEventListener('eduforge-auth', listener);
  window.addEventListener('storage', listener);
  return () => {
    window.removeEventListener('eduforge-auth', listener);
    window.removeEventListener('storage', listener);
  };
}
