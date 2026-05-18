import type { ToolContext, ToolOutcome } from "../executor";
import { matchRoutine } from "../fuzzy";

export async function queryAnalytics(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolOutcome> {
  const metric = String(args.metric ?? "");
  const days = Math.min(Math.max(Number(args.days_back ?? 30), 1), 365);
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffDate = cutoff.toISOString().slice(0, 10);

  if (metric === "routine_streak" || metric === "routine_completion_rate") {
    if (!args.routine_description) return { ok: false, message: "routine_description required for routine metrics" };
    const m = await matchRoutine(ctx.supabase, ctx.userId, String(args.routine_description));
    if (!m) return { ok: false, message: `No routine matches "${args.routine_description}"` };

    const { data: logs } = await ctx.supabase
      .from("routine_logs")
      .select("logged_date, completed")
      .eq("routine_id", m.id)
      .gte("logged_date", cutoffDate);

    const completed = logs?.filter((l) => l.completed).length ?? 0;
    const rate = logs?.length ? Math.round((completed / logs.length) * 100) : 0;

    if (metric === "routine_streak") {
      const dates = new Set(logs?.filter((l) => l.completed).map((l) => l.logged_date) ?? []);
      let streak = 0;
      const cursor = new Date();
      while (dates.has(cursor.toISOString().slice(0, 10))) {
        streak += 1;
        cursor.setDate(cursor.getDate() - 1);
      }
      return {
        ok: true,
        message: `${m.title}: ${streak} day streak`,
        cardKind: "insight",
        card: { kind: "routine_streak", title: m.title, streak, days },
      };
    }

    return {
      ok: true,
      message: `${m.title}: ${rate}% over ${days}d`,
      cardKind: "insight",
      card: { kind: "routine_completion_rate", title: m.title, rate, days },
    };
  }

  if (metric === "task_completion_rate") {
    const { data } = await ctx.supabase
      .from("tasks")
      .select("status")
      .eq("user_id", ctx.userId)
      .gte("created_at", cutoff.toISOString());
    const total = data?.length ?? 0;
    const done = data?.filter((t) => t.status === "completed").length ?? 0;
    const rate = total ? Math.round((done / total) * 100) : 0;
    return {
      ok: true,
      message: `${done}/${total} tasks done (${rate}%)`,
      cardKind: "insight",
      card: { kind: "task_completion_rate", rate, done, total, days },
    };
  }

  if (metric === "activity_count") {
    const cat = args.category ? String(args.category) : null;
    let query = ctx.supabase
      .from("activity_log")
      .select("id", { count: "exact", head: true })
      .eq("user_id", ctx.userId)
      .gte("timestamp", cutoff.toISOString());
    if (cat) query = query.eq("category", cat);
    const { count } = await query;
    return {
      ok: true,
      message: `${count ?? 0} activities${cat ? ` in ${cat}` : ""} over ${days}d`,
      cardKind: "insight",
      card: { kind: "activity_count", count: count ?? 0, category: cat, days },
    };
  }

  return { ok: false, message: `unknown metric: ${metric}` };
}
