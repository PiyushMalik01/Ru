import type { ToolContext, ToolOutcome } from "../executor";
import { matchRoutine } from "../fuzzy";

/**
 * Delete a routine permanently. For "I want to stop being nudged about X
 * temporarily", use modify_routine to set is_active=false instead.
 */
export async function deleteRoutine(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolOutcome> {
  let routineId = args.routine_id ? String(args.routine_id) : null;
  let title: string | null = null;

  if (!routineId && args.routine_description) {
    const match = await matchRoutine(ctx.supabase, ctx.userId, String(args.routine_description));
    if (match) {
      routineId = match.id;
      title = match.title;
    }
  }
  if (!routineId) return { ok: false, message: "routine_id or routine_description required" };

  const { error } = await ctx.supabase
    .from("routines")
    .delete()
    .eq("id", routineId)
    .eq("user_id", ctx.userId);
  if (error) return { ok: false, message: error.message };

  return { ok: true, message: `Deleted routine: ${title ?? routineId}` };
}

/**
 * Skip a routine for today — writes a routine_logs row with completed=false
 * and a "skipped" note. The streak calculation honors completed=true only,
 * so this keeps the streak from breaking while recording the user's intent.
 */
export async function skipRoutineToday(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolOutcome> {
  let routineId = args.routine_id ? String(args.routine_id) : null;
  let title: string | null = null;

  if (!routineId && args.routine_description) {
    const match = await matchRoutine(ctx.supabase, ctx.userId, String(args.routine_description));
    if (!match) return { ok: false, message: `No matching routine for "${args.routine_description}"` };
    routineId = match.id;
    title = match.title;
  }
  if (!routineId) return { ok: false, message: "routine_id or routine_description required" };

  const today = new Date().toISOString().slice(0, 10);
  const reason = args.reason ? String(args.reason) : "Skipped";

  // Upsert keyed by (user_id, routine_id, logged_date) — if the user already
  // marked it complete today and then asks to skip, we override.
  const { error } = await ctx.supabase
    .from("routine_logs")
    .upsert(
      {
        user_id: ctx.userId,
        routine_id: routineId,
        logged_date: today,
        completed: false,
        notes: reason,
      },
      { onConflict: "routine_id,logged_date" },
    );
  if (error) return { ok: false, message: error.message };

  return {
    ok: true,
    message: `Skipped today: ${title ?? "routine"}`,
    cardKind: "routine",
    card: { id: routineId, title: title ?? "routine", status: "skipped_today" },
  };
}
