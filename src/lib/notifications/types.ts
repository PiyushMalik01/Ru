import type { Database } from "@/types/database";

export type NotificationKind = Database["public"]["Enums"]["notification_kind"];
export type NotificationChannel = Database["public"]["Enums"]["notification_channel"];

export interface DispatchInput {
  userId: string;
  kind: NotificationKind;
  title: string;
  body?: string;
  url?: string;
  entityKind?: string;
  entityId?: string;
  // Override per-user prefs for this specific notification. Use sparingly —
  // e.g. extracted items always go to in-app, never email.
  forceChannels?: NotificationChannel[];
  // Skip quiet-hours check (urgent reminders may bypass).
  bypassQuietHours?: boolean;
  // Dedup: if a notification with this tag was sent in the past hour, skip.
  dedupTag?: string;
}

export interface NotificationPrefs {
  userId: string;
  inappEnabled: boolean;
  pushEnabled: boolean;
  emailEnabled: boolean;
  emailAddress: string | null;       // override; falls back to auth email
  quietStart: number | null;
  quietEnd: number | null;
  digestEnabled: boolean;
  digestHour: number;
  timezone: string;
}
