import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient as createSupabaseAdmin } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

/**
 * Fan-out mobile push send. Called by the reminder-dispatcher and
 * anticipation-sweep Inngest jobs (server-side) — protected by a shared
 * secret in the header so external clients can't trigger arbitrary pushes.
 *
 * Body:
 *   { user_id: uuid, title: string, body: string, data?: Record<string,string> }
 *
 * Auth:
 *   x-internal-secret: must match process.env.INTERNAL_PUSH_SECRET
 *
 * Implementation: reads `mobile_push_tokens` rows for the user, splits
 * by platform, and calls FCM HTTP v1 for each. iOS tokens go through
 * the FCM APNs proxy (configured in the Firebase console with your APNs
 * auth key); Android tokens go to FCM directly.
 *
 * FCM HTTP v1 needs an OAuth2 token from a service account. We use the
 * `FIREBASE_SERVICE_ACCOUNT_JSON` env var (the full JSON, stringified)
 * and mint a token per request — caching can be added later if rate
 * becomes a concern (FCM allows ~100 QPS per project on the default tier).
 */

const BodySchema = z.object({
  user_id: z.string().uuid(),
  title: z.string().min(1).max(120),
  body: z.string().min(1).max(500),
  data: z.record(z.string(), z.string()).optional(),
});

export async function POST(req: NextRequest) {
  const secret = req.headers.get("x-internal-secret");
  if (!process.env.INTERNAL_PUSH_SECRET || secret !== process.env.INTERNAL_PUSH_SECRET) {
    return new Response("unauthorized", { status: 401 });
  }

  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return new Response("invalid body", { status: 400 });
  }

  if (!process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    return new Response("FIREBASE_SERVICE_ACCOUNT_JSON not configured", { status: 500 });
  }

  // Service-role Supabase client — bypasses RLS to read tokens for any user.
  const supabase = createSupabaseAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  const { data: tokens, error } = await supabase
    .from("mobile_push_tokens")
    .select("platform, token")
    .eq("user_id", parsed.data.user_id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!tokens || tokens.length === 0) {
    return NextResponse.json({ sent: 0, reason: "no_tokens" });
  }

  const accessToken = await mintFcmAccessToken();
  const projectId = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON).project_id as string;

  const sendUrl = `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`;
  const results = await Promise.allSettled(
    tokens.map(async (t) => {
      const message = {
        token: t.token,
        notification: { title: parsed.data.title, body: parsed.data.body },
        data: parsed.data.data ?? {},
        ...(t.platform === "ios"
          ? {
              apns: {
                payload: {
                  aps: {
                    alert: { title: parsed.data.title, body: parsed.data.body },
                    sound: "default",
                  },
                },
              },
            }
          : {
              android: {
                priority: "HIGH" as const,
                notification: { channel_id: "ru_default" },
              },
            }),
      };
      const res = await fetch(sendUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ message }),
      });
      if (!res.ok) {
        const body = await res.text();
        // 404 / 410 → token is dead, prune it so we don't keep retrying.
        if (res.status === 404 || res.status === 410) {
          await supabase
            .from("mobile_push_tokens")
            .delete()
            .eq("user_id", parsed.data.user_id)
            .eq("token", t.token);
        }
        throw new Error(`fcm ${res.status}: ${body}`);
      }
    })
  );

  const sent = results.filter((r) => r.status === "fulfilled").length;
  const failed = results.length - sent;
  return NextResponse.json({ sent, failed });
}

/**
 * Mint an FCM access token from the service account JSON via a signed
 * JWT (RS256) exchange. Standard OAuth2 service-account flow — no
 * external SDK needed for one endpoint.
 *
 * Reuses the system crypto API; doesn't pull `google-auth-library` to
 * keep the route's cold-start bundle slim.
 */
async function mintFcmAccessToken(): Promise<string> {
  const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON!) as {
    client_email: string;
    private_key: string;
    token_uri: string;
  };

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: sa.token_uri,
    iat: now,
    exp: now + 3600,
  };

  const enc = (o: object) =>
    Buffer.from(JSON.stringify(o))
      .toString("base64")
      .replaceAll("=", "")
      .replaceAll("+", "-")
      .replaceAll("/", "_");

  const unsigned = `${enc(header)}.${enc(payload)}`;

  const { createSign } = await import("node:crypto");
  const signer = createSign("RSA-SHA256");
  signer.update(unsigned);
  const signature = signer
    .sign(sa.private_key)
    .toString("base64")
    .replaceAll("=", "")
    .replaceAll("+", "-")
    .replaceAll("/", "_");

  const jwt = `${unsigned}.${signature}`;

  const tokenRes = await fetch(sa.token_uri, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });
  if (!tokenRes.ok) {
    throw new Error(`FCM token exchange failed: ${await tokenRes.text()}`);
  }
  const tokenJson = (await tokenRes.json()) as { access_token: string };
  return tokenJson.access_token;
}
