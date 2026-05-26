import { createServiceClient } from "@/lib/supabase/service";
import type { DispatchInput, NotificationChannel } from "../types";

export async function deliverInApp(
  input: DispatchInput,
  channelsFired: NotificationChannel[]
): Promise<string | null> {
  const supabase = createServiceClient();
  const channelsMap = Object.fromEntries(channelsFired.map((c) => [c, true]));

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
    })
    .select("id")
    .single();
  if (error) {
    console.error("[notify:inapp] insert failed", error);
    return null;
  }
  return data?.id ?? null;
}
