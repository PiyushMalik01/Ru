// Server-side service that manages a user's ChatGPT OAuth connection.
// Tokens are stored encrypted in profiles.ai_credentials; the pending device-code session
// lives in profiles.preferences.openaiDeviceSession until authorization completes.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { encrypt, decrypt } from "@/lib/crypto";
import {
  requestDeviceCode,
  pollDeviceAuthorization,
  exchangeCodeForTokens,
  refreshAccessToken,
  parseIdToken,
} from "./openai-oauth";

export interface ConnectionStatus {
  connected: boolean;
  authMethod?: "oauth-device";
  email?: string;
  planType?: string;
  tokenExpiresAt?: string;
}

interface StoredOAuthCredentials {
  authMethod: "oauth-device";
  accessToken: string; // encrypted
  refreshToken: string; // encrypted
  idToken?: string; // plaintext jwt (no secrets in payload)
  tokenExpiresAt: string; // ISO
  email?: string;
  accountId?: string;
  planType?: string;
}

interface PendingDeviceSession {
  deviceAuthId: string;
  userCode: string;
  verificationUrl: string;
  expiresAt: string; // ISO
}

type Supabase = SupabaseClient<Database>;

async function readProfile(supabase: Supabase, userId: string) {
  const { data } = await supabase
    .from("profiles")
    .select("ai_provider, ai_credentials, preferences")
    .eq("id", userId)
    .single();
  return data;
}

export async function getChatGPTStatus(
  supabase: Supabase,
  userId: string
): Promise<ConnectionStatus> {
  const profile = await readProfile(supabase, userId);
  if (!profile || profile.ai_provider !== "chatgpt_oauth") return { connected: false };
  const creds = profile.ai_credentials as StoredOAuthCredentials | null;
  if (!creds || creds.authMethod !== "oauth-device") return { connected: false };
  return {
    connected: true,
    authMethod: "oauth-device",
    email: creds.email,
    planType: creds.planType,
    tokenExpiresAt: creds.tokenExpiresAt,
  };
}

export async function initiateChatGPTDeviceCode(
  supabase: Supabase,
  userId: string
): Promise<{ userCode: string; verificationUrl: string; expiresIn: number; interval: number }> {
  const profile = await readProfile(supabase, userId);
  const preferences = (profile?.preferences as Record<string, unknown> | null) ?? {};

  const deviceCode = await requestDeviceCode();

  const session: PendingDeviceSession = {
    deviceAuthId: deviceCode.deviceAuthId,
    userCode: deviceCode.userCode,
    verificationUrl: deviceCode.verificationUrl,
    expiresAt: new Date(Date.now() + deviceCode.expiresIn * 1000).toISOString(),
  };

  const { error } = await supabase
    .from("profiles")
    .update({ preferences: { ...preferences, openaiDeviceSession: session } })
    .eq("id", userId);
  if (error) throw new Error(`Could not save device session: ${error.message}`);

  return {
    userCode: deviceCode.userCode,
    verificationUrl: deviceCode.verificationUrl,
    expiresIn: deviceCode.expiresIn,
    interval: deviceCode.interval,
  };
}

export async function pollChatGPTAuthorization(
  supabase: Supabase,
  userId: string
): Promise<{ authorized: boolean; email?: string; planType?: string }> {
  const profile = await readProfile(supabase, userId);
  const preferences = (profile?.preferences as Record<string, unknown> | null) ?? {};
  const session = preferences.openaiDeviceSession as PendingDeviceSession | undefined;

  if (!session) throw new Error("No pending device session — start the connection again.");
  if (new Date(session.expiresAt).getTime() < Date.now()) {
    const { openaiDeviceSession: _drop, ...rest } = preferences;
    await supabase.from("profiles").update({ preferences: rest }).eq("id", userId);
    throw new Error("Device code expired. Start the connection again.");
  }

  const result = await pollDeviceAuthorization(session.deviceAuthId, session.userCode);
  if (!result) return { authorized: false };

  const tokens = await exchangeCodeForTokens(result.authorizationCode, result.codeVerifier ?? "");
  const claims = tokens.idToken ? parseIdToken(tokens.idToken) : {};

  const stored: StoredOAuthCredentials = {
    authMethod: "oauth-device",
    accessToken: encrypt(tokens.accessToken),
    refreshToken: encrypt(tokens.refreshToken),
    idToken: tokens.idToken,
    tokenExpiresAt: new Date(Date.now() + tokens.expiresIn * 1000).toISOString(),
    email: claims.email,
    accountId: claims.accountId,
    planType: claims.planType,
  };

  const { openaiDeviceSession: _consumed, ...remainingPrefs } = preferences;

  const { error } = await supabase
    .from("profiles")
    .update({
      ai_provider: "chatgpt_oauth",
      ai_credentials: stored as unknown as Record<string, unknown>,
      preferences: remainingPrefs,
    })
    .eq("id", userId);
  if (error) throw new Error(`Could not save tokens: ${error.message}`);

  return { authorized: true, email: claims.email, planType: claims.planType };
}

/**
 * Returns a valid access token + account id, refreshing if expired.
 * Returns null when there's no oauth connection or refresh fails.
 */
export async function getValidChatGPTToken(
  supabase: Supabase,
  userId: string
): Promise<{ accessToken: string; accountId: string } | null> {
  const profile = await readProfile(supabase, userId);
  if (!profile || profile.ai_provider !== "chatgpt_oauth") return null;
  const creds = profile.ai_credentials as StoredOAuthCredentials | null;
  if (!creds || creds.authMethod !== "oauth-device" || !creds.accountId) return null;

  const expiresAt = new Date(creds.tokenExpiresAt).getTime();
  if (expiresAt > Date.now() + 60_000) {
    try {
      return { accessToken: decrypt(creds.accessToken), accountId: creds.accountId };
    } catch {
      return null;
    }
  }

  // Token expired or about to — refresh
  let refreshTokenPlain: string;
  try {
    refreshTokenPlain = decrypt(creds.refreshToken);
  } catch {
    return null;
  }

  try {
    const refreshed = await refreshAccessToken(refreshTokenPlain);
    const claims = refreshed.idToken ? parseIdToken(refreshed.idToken) : {};

    const updated: StoredOAuthCredentials = {
      authMethod: "oauth-device",
      accessToken: encrypt(refreshed.accessToken),
      refreshToken: encrypt(refreshed.refreshToken),
      idToken: refreshed.idToken ?? creds.idToken,
      tokenExpiresAt: new Date(Date.now() + refreshed.expiresIn * 1000).toISOString(),
      email: claims.email ?? creds.email,
      accountId: claims.accountId ?? creds.accountId,
      planType: claims.planType ?? creds.planType,
    };

    await supabase
      .from("profiles")
      .update({ ai_credentials: updated as unknown as Record<string, unknown> })
      .eq("id", userId);

    return { accessToken: refreshed.accessToken, accountId: updated.accountId! };
  } catch {
    return null;
  }
}

export async function disconnectChatGPT(supabase: Supabase, userId: string): Promise<void> {
  const profile = await readProfile(supabase, userId);
  if (!profile) return;
  const preferences = (profile.preferences as Record<string, unknown> | null) ?? {};
  const { openaiDeviceSession: _drop, ...rest } = preferences;

  await supabase
    .from("profiles")
    .update({
      ai_provider: profile.ai_provider === "chatgpt_oauth" ? null : profile.ai_provider,
      ai_credentials: profile.ai_provider === "chatgpt_oauth" ? null : profile.ai_credentials,
      preferences: rest,
    })
    .eq("id", userId);
}
