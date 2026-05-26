"use server";

// Server actions for the connections + notifications settings page.
// Each one resolves the current user via the SSR Supabase client and writes
// to either `profiles` (notification prefs + email) or `google_integrations`
// (per-feature toggles). All paths revalidate the connections page so the
// server-rendered toggle/select state stays in sync.

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

type Channel = "inapp" | "push" | "email";

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("unauthorized");
  return { supabase, user };
}

export async function setNotifyChannel(channel: Channel, enabled: boolean): Promise<void> {
  const { supabase, user } = await requireUser();
  const update =
    channel === "inapp"
      ? { notify_inapp_enabled: enabled }
      : channel === "push"
        ? { notify_push_enabled: enabled }
        : channel === "email"
          ? { notify_email_enabled: enabled }
          : null;
  if (!update) throw new Error("invalid channel");
  const { error } = await supabase.from("profiles").update(update).eq("id", user.id);
  if (error) throw error;
  revalidatePath("/settings/connections");
}

export async function setQuietHours(start: number | null, end: number | null): Promise<void> {
  const { supabase, user } = await requireUser();
  const clean = (h: number | null) => {
    if (h === null || Number.isNaN(h)) return null;
    if (h < 0 || h > 23) return null;
    return Math.floor(h);
  };
  const { error } = await supabase
    .from("profiles")
    .update({
      notify_quiet_start: clean(start),
      notify_quiet_end: clean(end),
    })
    .eq("id", user.id);
  if (error) throw error;
  revalidatePath("/settings/connections");
}

export async function setDigest(enabled: boolean, hour: number): Promise<void> {
  const { supabase, user } = await requireUser();
  const safeHour = Number.isFinite(hour) && hour >= 0 && hour <= 23 ? Math.floor(hour) : 8;
  const { error } = await supabase
    .from("profiles")
    .update({
      notify_digest_enabled: enabled,
      notify_digest_hour: safeHour,
    })
    .eq("id", user.id);
  if (error) throw error;
  revalidatePath("/settings/connections");
}

export async function setNotifyEmail(address: string | null): Promise<void> {
  const { supabase, user } = await requireUser();
  const trimmed = address?.trim() ?? "";
  const { error } = await supabase
    .from("profiles")
    .update({ notify_email_address: trimmed.length === 0 ? null : trimmed })
    .eq("id", user.id);
  if (error) throw error;
  revalidatePath("/settings/connections");
}

export async function setGoogleFeature(
  feature: "gmail_extraction" | "calendar_sync",
  enabled: boolean,
): Promise<void> {
  const { supabase, user } = await requireUser();
  const update =
    feature === "gmail_extraction"
      ? { gmail_extraction_enabled: enabled }
      : { calendar_sync_enabled: enabled };
  const { error } = await supabase
    .from("google_integrations")
    .update(update)
    .eq("user_id", user.id);
  if (error) throw error;
  revalidatePath("/settings/connections");
}
