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

  const hour = userHour(prefs.timezone, now);
  if (prefs.quietStart < prefs.quietEnd) {
    return hour >= prefs.quietStart && hour < prefs.quietEnd;
  }
  // Overnight: quiet is start..23 OR 0..end
  return hour >= prefs.quietStart || hour < prefs.quietEnd;
}

/**
 * Next instant (UTC) when the quiet window ends for this user. Used to set
 * `deferred_until` on notifications that arrive during quiet hours so a
 * flush cron can fire push/email when the user wakes up. Returns null if
 * quiet hours aren't configured.
 */
export function nextQuietEnd(prefs: NotificationPrefs, now = new Date()): Date | null {
  if (prefs.quietStart == null || prefs.quietEnd == null) return null;
  if (prefs.quietStart === prefs.quietEnd) return null;

  const tz = prefs.timezone;
  const todayKey = ymdInTz(tz, now);
  const quietEndToday = utcInstantOfLocalHour(tz, todayKey, prefs.quietEnd);

  // If we haven't yet reached today's quietEnd, that's the next one.
  if (quietEndToday.getTime() > now.getTime()) return quietEndToday;

  // Otherwise it's tomorrow's quietEnd (overnight window case, after midnight).
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const tomorrowKey = ymdInTz(tz, tomorrow);
  return utcInstantOfLocalHour(tz, tomorrowKey, prefs.quietEnd);
}

function userHour(tz: string, at: Date): number {
  return parseInt(
    new Intl.DateTimeFormat("en-US", { hour: "2-digit", hour12: false, timeZone: tz }).format(at),
    10,
  );
}

function ymdInTz(tz: string, at: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(at);
}

/**
 * Compute the UTC instant corresponding to YYYY-MM-DD at `hour:00` local in
 * `tz`. Done by probing the offset of midnight-UTC of that date and
 * subtracting the local offset.
 */
function utcInstantOfLocalHour(tz: string, ymd: string, hour: number): Date {
  const probe = new Date(`${ymd}T00:00:00Z`);
  const offsetMin = tzOffsetMinutes(tz, probe);
  const localMidnightUtc = probe.getTime() - offsetMin * 60 * 1000;
  return new Date(localMidnightUtc + hour * 60 * 60 * 1000);
}

function tzOffsetMinutes(tz: string, at: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    timeZoneName: "shortOffset",
  }).formatToParts(at);
  const tzName = parts.find((p) => p.type === "timeZoneName")?.value ?? "GMT";
  const m = tzName.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/);
  if (!m) return 0;
  const sign = m[1] === "+" ? 1 : -1;
  return sign * (parseInt(m[2], 10) * 60 + (m[3] ? parseInt(m[3], 10) : 0));
}
