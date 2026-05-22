import { NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { resolveSnoozeUntil } from "../../_helpers/snooze";

export const dynamic = "force-dynamic";

/**
 * POST /api/suggestions/[id]/snooze
 *
 * Defer a suggestion until `until` — either an ISO timestamp or one of the
 * keywords "1h" | "3h" | "tomorrow" | "next_morning". Keyword resolution
 * uses the user's profile timezone for the day-relative options.
 */

const BodySchema = z.object({
  until: z.string().min(1),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Response("unauthorized", { status: 401 });

  const { id } = await params;
  if (!id) return new Response("missing id", { status: 400 });

  const rawBody = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(rawBody);
  if (!parsed.success) return new Response("invalid body", { status: 400 });
  const { until } = parsed.data;

  // Ownership check first — no point in resolving snooze for a non-existent row.
  const { data: existing } = await supabase
    .from("suggestions")
    .select("id, user_id")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();
  if (!existing) return new Response("not found", { status: 404 });

  // Profile timezone for day-relative keywords.
  const { data: profile } = await supabase
    .from("profiles")
    .select("timezone")
    .eq("id", user.id)
    .single();
  const tz = profile?.timezone ?? "UTC";

  let resolved: { until: Date; keyword: ReturnType<typeof resolveSnoozeUntil>["keyword"] };
  try {
    resolved = resolveSnoozeUntil(until, tz, new Date());
  } catch {
    return new Response("invalid body", { status: 400 });
  }
  const snoozeIso = resolved.until.toISOString();

  const { error: updErr } = await supabase
    .from("suggestions")
    .update({ status: "snoozed", snooze_until: snoozeIso })
    .eq("id", id)
    .eq("user_id", user.id);
  if (updErr) {
    return new Response(`db error: ${updErr.message}`, { status: 500 });
  }

  const { error: logErr } = await supabase.from("suggestion_actions").insert({
    suggestion_id: id,
    user_id: user.id,
    action: "snoozed",
    metadata: { until: snoozeIso, keyword: resolved.keyword },
  });
  if (logErr) {
    console.error("suggestion_actions insert failed", logErr);
  }

  return Response.json({ ok: true, snooze_until: snoozeIso });
}
