// Web Push helper — server-only. Sends a push to a user's stored subscription.
// If push isn't configured (no VAPID keys) this is a no-op so dev still works.

import webpush from "web-push";
import { createServiceClient } from "@/lib/supabase/service";

interface PushBody {
  title: string;
  body: string;
  url?: string;
}

let configured = false;
function configure() {
  if (configured) return true;
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT ?? "mailto:hello@ru.app";
  if (!pub || !priv) return false;
  webpush.setVapidDetails(subject, pub, priv);
  configured = true;
  return true;
}

export async function sendPushToUser(userId: string, payload: PushBody): Promise<void> {
  if (!configure()) {
    console.warn("[push] VAPID keys missing — skipping notification for", userId);
    return;
  }
  const supabase = createServiceClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("push_subscription")
    .eq("id", userId)
    .single();
  const sub = profile?.push_subscription as
    | { endpoint: string; keys: { p256dh: string; auth: string } }
    | null;
  if (!sub?.endpoint) return;

  try {
    await webpush.sendNotification(sub, JSON.stringify(payload));
  } catch (e) {
    const err = e as { statusCode?: number };
    // 404/410 — subscription gone, clear it
    if (err.statusCode === 404 || err.statusCode === 410) {
      await supabase.from("profiles").update({ push_subscription: null }).eq("id", userId);
    } else {
      console.error("[push] sendNotification failed for", userId, e);
    }
  }
}
