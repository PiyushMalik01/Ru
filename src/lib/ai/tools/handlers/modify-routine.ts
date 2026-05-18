import type { ToolContext, ToolOutcome } from "../executor";
import { matchRoutine } from "../fuzzy";

export async function modifyRoutine(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolOutcome> {
  let routineId = args.routine_id ? String(args.routine_id) : null;
  if (!routineId && args.routine_description) {
    const m = await matchRoutine(ctx.supabase, ctx.userId, String(args.routine_description));
    if (!m) return { ok: false, message: `No routine matches "${args.routine_description}"` };
    routineId = m.id;
  }
  if (!routineId) return { ok: false, message: "routine_id or routine_description required" };

  const updates = (args.updates as Record<string, unknown>) ?? {};
  if (Object.keys(updates).length === 0) return { ok: false, message: "no updates given" };

  const { data, error } = await ctx.supabase
    .from("routines")
    .update(updates as never)
    .eq("id", routineId)
    .eq("user_id", ctx.userId)
    .select()
    .single();
  if (error || !data) return { ok: false, message: error?.message ?? "update failed" };

  return {
    ok: true,
    message: `Updated routine: ${data.title}`,
    cardKind: "routine",
    card: { id: data.id, title: data.title, frequency: data.frequency, time_of_day: data.time_of_day, streak: 0 },
  };
}
