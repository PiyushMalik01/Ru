import type { ToolContext, ToolOutcome } from "../executor";

export async function declareRoutine(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolOutcome> {
  const title = String(args.title ?? "");
  if (!title) return { ok: false, message: "title required" };

  const { data, error } = await ctx.supabase.from("routines").insert({
    user_id: ctx.userId,
    title,
    description: args.description ? String(args.description) : null,
    frequency: (args.frequency as "daily" | "weekdays" | "weekly" | "custom") ?? "daily",
    custom_days: (args.custom_days as number[]) ?? null,
    time_of_day: args.time_of_day ? String(args.time_of_day) : null,
    origin: "user_declared",
    detection_confidence: 1,
    nudge_level: (args.nudge_level as "silent" | "gentle" | "active") ?? "gentle",
    is_active: true,
  }).select().single();

  if (error || !data) return { ok: false, message: error?.message ?? "insert failed" };

  return {
    ok: true,
    message: `Routine added: ${title}`,
    cardKind: "routine",
    card: { id: data.id, title, frequency: data.frequency, time_of_day: data.time_of_day, streak: 0 },
  };
}
