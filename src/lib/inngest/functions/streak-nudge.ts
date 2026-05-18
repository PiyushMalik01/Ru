import { inngest } from "../client";
import { createServiceClient } from "@/lib/supabase/service";

// Daily at 6am UTC: compute streaks for all active routines; emit milestone events at 7/30/100.
export const streakCalculator = inngest.createFunction(
  { id: "streak-calculator", triggers: [{ cron: "0 6 * * *" }] },
  async ({ step }) => {
    const routines = await step.run("load-active-routines", async () => {
      const supabase = createServiceClient();
      const { data, error } = await supabase
        .from("routines")
        .select("id, user_id, title")
        .eq("is_active", true);
      if (error) throw new Error(error.message);
      return data ?? [];
    });

    const events: Array<{ name: "streak.milestone"; data: { userId: string; routineId: string; title: string; streak: number } }> = [];

    for (const routine of routines) {
      const streak = await step.run(`streak-${routine.id}`, async () => {
        const supabase = createServiceClient();
        const { data: logs } = await supabase
          .from("routine_logs")
          .select("logged_date, completed")
          .eq("routine_id", routine.id)
          .eq("completed", true)
          .order("logged_date", { ascending: false })
          .limit(365);
        if (!logs) return 0;
        const dates = new Set(logs.map((l) => l.logged_date));
        let s = 0;
        const cursor = new Date();
        while (dates.has(cursor.toISOString().slice(0, 10))) {
          s += 1;
          cursor.setDate(cursor.getDate() - 1);
        }
        return s;
      });

      if ([7, 30, 100, 365].includes(streak)) {
        events.push({
          name: "streak.milestone",
          data: { userId: routine.user_id, routineId: routine.id, title: routine.title, streak },
        });
      }
    }

    if (events.length > 0) {
      await step.sendEvent("milestones", events);
    }

    return { milestones: events.length };
  }
);
