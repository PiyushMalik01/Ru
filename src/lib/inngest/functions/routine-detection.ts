import { inngest } from "../client";
import { createServiceClient } from "@/lib/supabase/service";

// Daily at 5am UTC: cluster similar activities per user; promote to auto_detected routines
// when the same activity appears 5+ times in the last 14 days. Lightweight — pg_trgm via the
// existing fuzzy match RPC + simple frequency count, no AI call required.
export const routineDetection = inngest.createFunction(
  { id: "routine-detection", triggers: [{ cron: "0 5 * * *" }] },
  async ({ step }) => {
    const users = await step.run("active-users", async () => {
      const supabase = createServiceClient();
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - 14);
      const { data, error } = await supabase
        .from("activity_log")
        .select("user_id")
        .gte("timestamp", cutoff.toISOString());
      if (error) throw new Error(error.message);
      const ids = new Set<string>();
      for (const row of data ?? []) ids.add(row.user_id);
      return [...ids];
    });

    let promoted = 0;

    for (const userId of users) {
      promoted += await step.run(`scan-${userId}`, async () => {
        const supabase = createServiceClient();
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - 14);

        const { data: acts } = await supabase
          .from("activity_log")
          .select("activity, category, timestamp")
          .eq("user_id", userId)
          .gte("timestamp", cutoff.toISOString());
        if (!acts || acts.length === 0) return 0;

        // Bucket by normalized activity (lowercase + trimmed)
        const buckets = new Map<string, { activity: string; category: string; times: number[] }>();
        for (const a of acts) {
          const key = a.activity.toLowerCase().trim();
          if (!buckets.has(key)) {
            buckets.set(key, { activity: a.activity, category: a.category, times: [] });
          }
          buckets.get(key)!.times.push(new Date(a.timestamp).getTime());
        }

        let added = 0;
        for (const bucket of buckets.values()) {
          if (bucket.times.length < 5) continue;

          // Check if a routine with this title already exists for this user
          const { data: existing } = await supabase
            .from("routines")
            .select("id")
            .eq("user_id", userId)
            .ilike("title", bucket.activity)
            .maybeSingle();
          if (existing) continue;

          // Simple time consistency: stdev of hour-of-day < 3 hours
          const hours = bucket.times.map((t) => new Date(t).getHours());
          const mean = hours.reduce((s, h) => s + h, 0) / hours.length;
          const variance = hours.reduce((s, h) => s + (h - mean) ** 2, 0) / hours.length;
          const stdev = Math.sqrt(variance);
          const timeOfDay =
            stdev < 3 ? `${Math.round(mean).toString().padStart(2, "0")}:00:00` : null;

          const confidence = Math.min(1, bucket.times.length / 14) * (stdev < 3 ? 1 : 0.5);

          const { data: inserted, error } = await supabase
            .from("routines")
            .insert({
              user_id: userId,
              title: bucket.activity,
              frequency: "daily",
              time_of_day: timeOfDay,
              origin: "auto_detected",
              detection_confidence: confidence,
              nudge_level: "gentle",
              is_active: confidence > 0.8,
            })
            .select()
            .single();
          if (error || !inserted) continue;

          await inngest.send({
            name: "routine.detected",
            data: {
              userId,
              routineId: inserted.id,
              title: bucket.activity,
              confidence,
            },
          });
          added += 1;
        }

        return added;
      });
    }

    return { promoted };
  }
);
