import { createServiceClient } from "@/lib/supabase/service";
import { encrypt, decrypt } from "@/lib/crypto";
import { exchangeCode, fetchUserInfo, refreshAccessToken, revokeToken, type GoogleTokens } from "./oauth";

interface IntegrationRow {
  user_id: string;
  email: string | null;
  scopes: string[];
  access_token_enc: string;
  refresh_token_enc: string | null;
  expires_at: string | null;
  gmail_extraction_enabled: boolean;
  calendar_sync_enabled: boolean;
}

export async function persistFromCode(userId: string, code: string): Promise<void> {
  const tokens = await exchangeCode(code);
  const info = await fetchUserInfo(tokens.access_token);
  const supabase = createServiceClient();
  const expiresAt = new Date(Date.now() + (tokens.expires_in - 60) * 1000).toISOString();
  const scopes = tokens.scope?.split(" ") ?? [];

  await supabase.from("google_integrations").upsert({
    user_id: userId,
    email: info.email ?? null,
    scopes,
    access_token_enc: encrypt(tokens.access_token),
    refresh_token_enc: tokens.refresh_token ? encrypt(tokens.refresh_token) : null,
    expires_at: expiresAt,
    updated_at: new Date().toISOString(),
  });
}

export async function getIntegration(userId: string): Promise<IntegrationRow | null> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("google_integrations")
    .select("user_id, email, scopes, access_token_enc, refresh_token_enc, expires_at, gmail_extraction_enabled, calendar_sync_enabled")
    .eq("user_id", userId)
    .single();
  if (error || !data) return null;
  return data as IntegrationRow;
}

/**
 * Get a valid access token for the user. If the cached one is within 60s of
 * expiry, refresh via the refresh token and persist the new pair.
 *
 * Throws if the user has no integration or refresh fails.
 */
export async function getAccessToken(userId: string): Promise<string> {
  const row = await getIntegration(userId);
  if (!row) throw new Error("no google integration");

  if (row.expires_at && new Date(row.expires_at).getTime() > Date.now() + 60_000) {
    return decrypt(row.access_token_enc);
  }

  if (!row.refresh_token_enc) {
    throw new Error("access token expired and no refresh token available");
  }

  const refresh = decrypt(row.refresh_token_enc);
  let next: GoogleTokens;
  try {
    next = await refreshAccessToken(refresh);
  } catch (e) {
    // Refresh failed — token revoked on the Google side. Wipe the row so
    // the UI shows disconnected and the user can reconnect.
    const supabase = createServiceClient();
    await supabase.from("google_integrations").delete().eq("user_id", userId);
    throw e;
  }

  const supabase = createServiceClient();
  await supabase
    .from("google_integrations")
    .update({
      access_token_enc: encrypt(next.access_token),
      refresh_token_enc: next.refresh_token ? encrypt(next.refresh_token) : row.refresh_token_enc,
      expires_at: new Date(Date.now() + (next.expires_in - 60) * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId);

  return next.access_token;
}

export async function disconnect(userId: string): Promise<void> {
  const row = await getIntegration(userId);
  if (!row) return;
  // Best-effort revoke at Google; ignore errors.
  try {
    if (row.refresh_token_enc) await revokeToken(decrypt(row.refresh_token_enc));
  } catch {}
  const supabase = createServiceClient();
  await supabase.from("google_integrations").delete().eq("user_id", userId);
}
