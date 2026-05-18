import type { ToolContext, ToolOutcome } from "../executor";
import { matchRoutine } from "../fuzzy";

export async function completeRoutine(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolOutcome> {
  let routineId = args.routine_id ? String(args.routine_id) : null;
  let title: string | null = null;
  if (!routineId && args.routine_description) {
    const m = await matchRoutine(ctx.supabase, ctx.userId, String(args.routine_description));
    if (!m) return { ok: false, message: `No routine matches "${args.routine_description}". Ask the user.` };
    routineId = m.id;
    title = m.title;
  }
  if (!routineId) return { ok: false, message: "routine_id or routine_description required" };

  const today = new Date().toISOString().slice(0, 10);
  const { error } = await ctx.supabase.from("routine_logs").upsert({
    routine_id: routineId,
    user_id: ctx.userId,
    logged_date: today,
    completed: true,
    completed_at: new Date().toISOString(),
    source_message_id: ctx.messageId,
    notes: args.notes ? String(args.notes) : null,
    metadata: (args.metadata as Record<string, unknown>) ?? {},
  }, { onConflict: "routine_id,logged_date" });

  if (error) return { ok: false, message: error.message };

  const { data: logs } = await ctx.supabase
    .from("routine_logs")
    .select("logged_date, completed")
    .eq("routine_id", routineId)
    .eq("completed", true)
    .order("logged_date", { ascending: false })
    .limit(365);

  let streak = 0;
  if (logs) {
    const dates = new Set(logs.map((l) => l.logged_date));
    const cursor = new Date();
    while (dates.has(cursor.toISOString().slice(0, 10))) {
      streak += 1;
      cursor.setDate(cursor.getDate() - 1);
    }
  }

  return {
    ok: true,
    message: `Done. Streak: ${streak}`,
    cardKind: "routine",
    card: { id: routineId, title: title ?? "Routine", streak, logged_date: today },
  };
}
