/**
 * BASIS Auth — Keycloak OIDC mit PKCE
 * Kein extra Dependency, reines Browser-OAuth2.
 */

const KEYCLOAK_URL = process.env.NEXT_PUBLIC_KEYCLOAK_URL ?? 'http://localhost:8080';
const REALM        = process.env.NEXT_PUBLIC_KEYCLOAK_REALM ?? 'basis';
const CLIENT_ID    = process.env.NEXT_PUBLIC_KEYCLOAK_CLIENT_ID ?? 'basis-dashboard';

const TOKEN_KEY    = 'basis_access_token';
const REFRESH_KEY  = 'basis_refresh_token';
const EXPIRES_KEY  = 'basis_token_expires';
const VERIFIER_KEY = 'basis_pkce_verifier';

// ─── Token Storage ────────────────────────────────────────────────────────────

export function getAccessToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function isTokenExpired(): boolean {
  if (typeof window === 'undefined') return true;
  const exp = localStorage.getItem(EXPIRES_KEY);
  if (!exp) return true;
  return Date.now() > parseInt(exp, 10);
}

export function saveTokens(access_token: string, refresh_token: string, expires_in: number) {
  localStorage.setItem(TOKEN_KEY, access_token);
  localStorage.setItem(REFRESH_KEY, refresh_token);
  localStorage.setItem(EXPIRES_KEY, String(Date.now() + expires_in * 1000 - 30_000));
}

export function clearTokens() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_KEY);
  localStorage.removeItem(EXPIRES_KEY);
}

export function getRefreshToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(REFRESH_KEY);
}

// ─── PKCE Helpers ─────────────────────────────────────────────────────────────

function base64urlEncode(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function generateCodeVerifier(): Promise<string> {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return base64urlEncode(array.buffer);
}

async function generateCodeChallenge(verifier: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return base64urlEncode(digest);
}

// ─── Redirect URI Helper ──────────────────────────────────────────────────────
// Uses NEXT_PUBLIC_BASE_URL if set (recommended in .env.local) so the
// redirect_uri is always stable regardless of which port the browser uses.

export function getRedirectUri(): string {
  const base =
    process.env.NEXT_PUBLIC_BASE_URL ??
    (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3002');
  return `${base}/auth/callback`;
}

// ─── Login Redirect ───────────────────────────────────────────────────────────

export async function redirectToLogin(redirectUri: string) {
  const verifier = await generateCodeVerifier();
  const challenge = await generateCodeChallenge(verifier);
  sessionStorage.setItem(VERIFIER_KEY, verifier);

  const params = new URLSearchParams({
    response_type: 'code',
    client_id:     CLIENT_ID,
    redirect_uri:  redirectUri,
    scope:         'openid profile email',
    code_challenge: challenge,
    code_challenge_method: 'S256',
  });

  window.location.href =
    `${KEYCLOAK_URL}/realms/${REALM}/protocol/openid-connect/auth?${params}`;
}

// ─── Code Exchange ────────────────────────────────────────────────────────────

export async function exchangeCode(code: string, redirectUri: string): Promise<void> {
  const verifier = sessionStorage.getItem(VERIFIER_KEY);
  if (!verifier) throw new Error('PKCE verifier fehlt — bitte neu einloggen.');

  const res = await fetch(
    `${KEYCLOAK_URL}/realms/${REALM}/protocol/openid-connect/token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type:    'authorization_code',
        client_id:     CLIENT_ID,
        code,
        redirect_uri:  redirectUri,
        code_verifier: verifier,
      }),
    },
  );

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error_description ?? `Token exchange fehlgeschlagen (${res.status})`);
  }

  const data = await res.json();
  saveTokens(data.access_token, data.refresh_token, data.expires_in);
  sessionStorage.removeItem(VERIFIER_KEY);
}

// ─── Token Refresh ────────────────────────────────────────────────────────────

export async function refreshAccessToken(): Promise<boolean> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return false;

  try {
    const res = await fetch(
      `${KEYCLOAK_URL}/realms/${REALM}/protocol/openid-connect/token`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type:    'refresh_token',
          client_id:     CLIENT_ID,
          refresh_token: refreshToken,
        }),
      },
    );

    if (!res.ok) {
      clearTokens();
      return false;
    }

    const data = await res.json();
    saveTokens(data.access_token, data.refresh_token, data.expires_in);
    return true;
  } catch {
    clearTokens();
    return false;
  }
}

// ─── Logout ───────────────────────────────────────────────────────────────────

export function logout(redirectUri: string) {
  const refreshToken = getRefreshToken();
  clearTokens();

  if (refreshToken) {
    const params = new URLSearchParams({
      client_id:     CLIENT_ID,
      post_logout_redirect_uri: redirectUri,
    });
    window.location.href =
      `${KEYCLOAK_URL}/realms/${REALM}/protocol/openid-connect/logout?${params}`;
  } else {
    window.location.href = '/login';
  }
}
