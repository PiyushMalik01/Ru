import { createServiceClient } from "@/lib/supabase/service";
import type { NotificationPrefs } from "./types";

export async function getPrefs(userId: string): Promise<NotificationPrefs | null> {
  const supabase = createServiceClient();
  const { data: profile, error } = await supabase
    .from("profiles")
    .select(
      "notify_inapp_enabled, notify_push_enabled, notify_email_enabled, notify_email_address, notify_quiet_start, notify_quiet_end, notify_digest_enabled, notify_digest_hour, timezone"
    )
    .eq("id", userId)
    .single();
  if (error || !profile) return null;

  // Fall back to auth email if user hasn't set an override.
  let emailAddress = profile.notify_email_address;
  if (!emailAddress) {
    const { data } = await supabase.auth.admin.getUserById(userId);
    emailAddress = data.user?.email ?? null;
  }

  return {
    userId,
    inappEnabled: profile.notify_inapp_enabled,
    pushEnabled: profile.notify_push_enabled,
    emailEnabled: profile.notify_email_enabled,
    emailAddress,
    quietStart: profile.notify_quiet_start,
    quietEnd: profile.notify_quiet_end,
    digestEnabled: profile.notify_digest_enabled,
    digestHour: profile.notify_digest_hour,
    timezone: profile.timezone ?? "UTC",
  };
}

/**
 * True if `now` falls inside the user's quiet hours. Hours are integers in
 * local time. If start > end the window crosses midnight (e.g. 22→7).
 */
export function inQuietHours(prefs: NotificationPrefs, now = new Date()): boolean {
  if (prefs.quietStart == null || prefs.quietEnd == null) return false;
  if (prefs.quietStart === prefs.quietEnd) return false;

  // Compute local hour in user's timezone. Intl handles DST.
  const hour = parseInt(
    new Intl.DateTimeFormat("en-US", {
      hour: "2-digit",
      hour12: false,
      timeZone: prefs.timezone,
    }).format(now),
    10
  );

  if (prefs.quietStart < prefs.quietEnd) {
    return hour >= prefs.quietStart && hour < prefs.quietEnd;
  }
  // Overnight: quiet is start..23 OR 0..end
  return hour >= prefs.quietStart || hour < prefs.quietEnd;
}
