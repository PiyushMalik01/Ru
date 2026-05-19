import type { ToolContext, ToolOutcome } from "../executor";

/**
 * Find a recent activity by id or fuzzy title (most recent that matches).
 * Activities are append-only logs, so "fix the one I just logged" needs to
 * scope to the latest match.
 */
async function findActivity(
  ctx: ToolContext,
  hint: string,
): Promise<{ id: string; activity: string; category: string; timestamp: string } | null> {
  const h = hint.trim();
  if (!h) return null;

  if (/^[0-9a-f-]{36}$/i.test(h)) {
    const { data } = await ctx.supabase
      .from("activity_log")
      .select("id, activity, category, timestamp")
      .eq("user_id", ctx.userId)
      .eq("id", h)
      .maybeSingle();
    if (data) return data;
  }

  const { data } = await ctx.supabase
    .from("activity_log")
    .select("id, activity, category, timestamp")
    .eq("user_id", ctx.userId)
    .ilike("activity", `%${h}%`)
    .order("timestamp", { ascending: false })
    .limit(1);
  return data?.[0] ?? null;
}

export async function modifyActivity(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolOutcome> {
  const hint = String(args.activity ?? args.activity_id ?? args.activity_description ?? "");
  const activity = await findActivity(ctx, hint);
  if (!activity) return { ok: false, message: `No matching activity for "${hint}".` };

  const updates = (args.updates as Record<string, unknown>) ?? {};
  const allowed: Record<string, unknown> = {};
  if (updates.activity != null) allowed.activity = String(updates.activity);
  if (updates.category != null) allowed.category = String(updates.category);
  if (updates.duration_minutes != null) {
    const n = Number(updates.duration_minutes);
    if (Number.isFinite(n)) allowed.duration_minutes = n;
  }
  if (updates.timestamp != null) allowed.timestamp = String(updates.timestamp);
  if (updates.metadata != null && typeof updates.metadata === "object") {
    allowed.metadata = updates.metadata;
  }

  if (Object.keys(allowed).length === 0) {
    return { ok: false, message: "no recognized fields in updates" };
  }

  const { data, error } = await ctx.supabase
    .from("activity_log")
    .update(allowed as never)
    .eq("id", activity.id)
    .eq("user_id", ctx.userId)
    .select()
    .single();
  if (error || !data) return { ok: false, message: error?.message ?? "update failed" };

  return {
    ok: true,
    message: `Updated activity: ${data.activity}`,
    cardKind: "activity",
    card: {
      id: data.id,
      activity: data.activity,
      category: data.category,
      duration_minutes: data.duration_minutes,
      timestamp: data.timestamp,
    },
  };
}

export async function deleteActivity(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolOutcome> {
  const hint = String(args.activity ?? args.activity_id ?? args.activity_description ?? "");
  const activity = await findActivity(ctx, hint);
  if (!activity) return { ok: false, message: `No matching activity for "${hint}".` };

  const { error } = await ctx.supabase
    .from("activity_log")
    .delete()
    .eq("id", activity.id)
    .eq("user_id", ctx.userId);
  if (error) return { ok: false, message: error.message };

  return { ok: true, message: `Deleted activity: ${activity.activity}` };
}
