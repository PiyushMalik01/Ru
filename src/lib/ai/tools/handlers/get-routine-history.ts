import type { ToolContext, ToolOutcome } from "../executor";
import { matchRoutine } from "../fuzzy";

export async function getRoutineHistory(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolOutcome> {
  let routineId = args.routine_id ? String(args.routine_id) : null;
  if (!routineId && args.routine_description) {
    const m = await matchRoutine(ctx.supabase, ctx.userId, String(args.routine_description));
    if (!m) return { ok: false, message: `No routine matches "${args.routine_description}"` };
    routineId = m.id;
  }
  if (!routineId) return { ok: false, message: "routine_id or routine_description required" };

  const days = Math.min(Math.max(Number(args.days_back ?? 30), 1), 365);
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);

  const { data, error } = await ctx.supabase
    .from("routine_logs")
    .select("logged_date, completed")
    .eq("routine_id", routineId)
    .gte("logged_date", cutoff.toISOString().slice(0, 10))
    .order("logged_date", { ascending: false });

  if (error) return { ok: false, message: error.message };

  const completed = data?.filter((d) => d.completed).length ?? 0;
  const rate = data?.length ? Math.round((completed / data.length) * 100) : 0;

  return {
    ok: true,
    message: `${completed}/${days} days complete (${rate}%)`,
    cardKind: "insight",
    card: { kind: "routine_history", days, completed, rate, logs: data ?? [] },
  };
}
