import { randomBytes, createHmac } from "node:crypto";
import { GOOGLE_AUTH_URL, GOOGLE_REVOKE_URL, GOOGLE_SCOPES, GOOGLE_TOKEN_URL, GOOGLE_USERINFO_URL } from "./scopes";

function env(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not configured`);
  return v;
}

function clientId(): string { return env("GOOGLE_OAUTH_CLIENT_ID"); }
function clientSecret(): string { return env("GOOGLE_OAUTH_CLIENT_SECRET"); }
function redirectUri(): string {
  return process.env.GOOGLE_OAUTH_REDIRECT_URI
    ?? `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/api/google/callback`;
}

// Sign the state with a key derived from ENCRYPTION_KEY so we can verify
// the callback wasn't tampered with and tie it back to the right user.
function stateKey(): string {
  const k = process.env.ENCRYPTION_KEY;
  if (!k) throw new Error("ENCRYPTION_KEY required for OAuth state signing");
  return k;
}

export function buildAuthUrl(userId: string): { url: string; state: string } {
  const nonce = randomBytes(12).toString("hex");
  const payload = `${userId}.${nonce}`;
  const sig = createHmac("sha256", stateKey()).update(payload).digest("hex").slice(0, 32);
  const state = `${payload}.${sig}`;

  const params = new URLSearchParams({
    client_id: clientId(),
    redirect_uri: redirectUri(),
    response_type: "code",
    scope: GOOGLE_SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  });
  return { url: `${GOOGLE_AUTH_URL}?${params.toString()}`, state };
}

export function verifyState(state: string): string | null {
  const parts = state.split(".");
  if (parts.length !== 3) return null;
  const [userId, nonce, sig] = parts;
  const expected = createHmac("sha256", stateKey()).update(`${userId}.${nonce}`).digest("hex").slice(0, 32);
  if (expected !== sig) return null;
  return userId;
}

export interface GoogleTokens {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope: string;
  token_type: string;
  id_token?: string;
}

export async function exchangeCode(code: string): Promise<GoogleTokens> {
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId(),
      client_secret: clientSecret(),
      redirect_uri: redirectUri(),
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) throw new Error(`token exchange failed: ${res.status} ${await res.text()}`);
  return res.json() as Promise<GoogleTokens>;
}

export async function refreshAccessToken(refreshToken: string): Promise<GoogleTokens> {
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: clientId(),
      client_secret: clientSecret(),
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) throw new Error(`token refresh failed: ${res.status} ${await res.text()}`);
  return res.json() as Promise<GoogleTokens>;
}

export async function revokeToken(token: string): Promise<void> {
  await fetch(`${GOOGLE_REVOKE_URL}?token=${encodeURIComponent(token)}`, {
    method: "POST",
  });
}

export async function fetchUserInfo(accessToken: string): Promise<{ email?: string; name?: string }> {
  const res = await fetch(GOOGLE_USERINFO_URL, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return {};
  return res.json() as Promise<{ email?: string; name?: string }>;
}
