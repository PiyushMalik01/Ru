import { createServiceClient } from "@/lib/supabase/service";
import type { DispatchInput, NotificationChannel } from "../types";

export interface DeliverInAppOptions {
  /** Channels actually fired immediately (in_app, push, email). */
  channelsFired: NotificationChannel[];
  /**
   * If quiet hours deferred push/email, set the wake-up time and the channels
   * to fire at flush. Push/email get recorded here so the flush cron knows
   * what was originally requested without re-checking prefs.
   */
  deferredUntil?: Date | null;
  deferredChannels?: Partial<Record<NotificationChannel, boolean>> | null;
}

export async function deliverInApp(
  input: DispatchInput,
  opts: DeliverInAppOptions,
): Promise<string | null> {
  const supabase = createServiceClient();
  const channelsMap = Object.fromEntries(opts.channelsFired.map((c) => [c, true]));

  const { data, error } = await supabase
    .from("notifications")
    .insert({
      user_id: input.userId,
      kind: input.kind,
      title: input.title,
      body: input.body ?? null,
      url: input.url ?? null,
      entity_kind: input.entityKind ?? null,
      entity_id: input.entityId ?? null,
      channels: channelsMap,
      deferred_until: opts.deferredUntil ? opts.deferredUntil.toISOString() : null,
      deferred_channels: opts.deferredChannels && Object.keys(opts.deferredChannels).length > 0
        ? opts.deferredChannels
        : null,
    })
    .select("id")
    .single();
  if (error) {
    console.error("[notify:inapp] insert failed", error);
    return null;
  }
  return data?.id ?? null;
}
