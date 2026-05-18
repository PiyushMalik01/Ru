import { inngest } from "../client";
import { createServiceClient } from "@/lib/supabase/service";

// Daily at 4am UTC: write a quantitative daily summary per active user. No AI call yet —
// the AI-generated `message_summary` is filled in by a separate enrichment job in v2.
export const dailySummary = inngest.createFunction(
  { id: "daily-summary", triggers: [{ cron: "0 4 * * *" }] },
  async ({ step }) => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const dateKey = yesterday.toISOString().slice(0, 10);
    const startIso = new Date(`${dateKey}T00:00:00.000Z`).toISOString();
    const endIso = new Date(`${dateKey}T23:59:59.999Z`).toISOString();

    const users = await step.run("active-users", async () => {
      const supabase = createServiceClient();
      const { data, error } = await supabase
        .from("messages")
        .select("user_id")
        .gte("created_at", startIso)
        .lte("created_at", endIso);
      if (error) throw new Error(error.message);
      const ids = new Set<string>();
      for (const row of data ?? []) ids.add(row.user_id);
      return [...ids];
    });

    let written = 0;
    for (const userId of users) {
      written += await step.run(`summary-${userId}`, async () => {
        const supabase = createServiceClient();

        const [tasksRes, routineLogsRes, activitiesRes] = await Promise.all([
          supabase
            .from("tasks")
            .select("status, created_at, completed_at")
            .eq("user_id", userId)
            .or(`created_at.gte.${startIso},completed_at.gte.${startIso}`)
            .lte("created_at", endIso),
          supabase
            .from("routine_logs")
            .select("routine_id, completed")
            .eq("user_id", userId)
            .eq("logged_date", dateKey),
          supabase
            .from("activity_log")
            .select("id, sentiment")
            .eq("user_id", userId)
            .gte("timestamp", startIso)
            .lte("timestamp", endIso),
        ]);

        const tasks = tasksRes.data ?? [];
        const routineLogs = routineLogsRes.data ?? [];
        const activities = activitiesRes.data ?? [];

        const tasksCreated = tasks.filter(
          (t) => new Date(t.created_at).toISOString() >= startIso
        ).length;
        const tasksCompleted = tasks.filter(
          (t) => t.completed_at && new Date(t.completed_at).toISOString() >= startIso
        ).length;
        const routinesCompleted = routineLogs.filter((l) => l.completed).length;
        const routinesTotal = routineLogs.length;
        const activitiesLogged = activities.length;
        const sentiments = activities.map((a) => a.sentiment).filter((s): s is number => typeof s === "number");
        const avgSentiment = sentiments.length ? sentiments.reduce((a, b) => a + b, 0) / sentiments.length : null;

        const { error } = await supabase
          .from("daily_summaries")
          .upsert(
            {
              user_id: userId,
              date: dateKey,
              tasks_created: tasksCreated,
              tasks_completed: tasksCompleted,
              routines_completed: routinesCompleted,
              routines_total: routinesTotal,
              activities_logged: activitiesLogged,
              avg_sentiment: avgSentiment,
              active_streaks: {},
              message_summary: null,
            },
            { onConflict: "user_id,date" }
          );
        return error ? 0 : 1;
      });
    }

    return { written };
  }
);
