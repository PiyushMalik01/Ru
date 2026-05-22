import { inngest } from "../client";
import { createServiceClient } from "@/lib/supabase/service";
import {
  runAnticipationForUser,
  expireStaleSuggestions,
} from "@/lib/ai/anticipation/orchestrator";

/**
 * Anticipation cron — runs every 30 minutes. For every active user whose
 * anticipation_level isn't 'off', runs the detector pipeline and inserts
 * new suggestions. After the per-user sweep, the janitor expires stale
 * pending suggestions whose show window has passed.
 *
 * Concurrency: limit 20 so we never starve other Inngest workloads when
 * the active user count grows. Each user takes <500ms typically (detectors
 * are all SQL; the LLM phraser is the slow part but it's capped at 5
 * concurrent OpenAI calls per user).
 */
export const anticipationSweep = inngest.createFunction(
  {
    id: "anticipation-sweep",
    concurrency: { limit: 20 },
    triggers: [{ cron: "*/30 * * * *" }],
  },
  async ({ step }) => {
    const users = await step.run("load-active-users", async () => {
      const supabase = createServiceClient();
      const { data } = await supabase
        .from("profiles")
        .select("id, anticipation_level")
        .neq("anticipation_level", "off");
      return (data ?? []).map((p) => p.id as string);
    });

    let detected = 0;
    let ranked = 0;
    let inserted = 0;
    const allErrors: string[] = [];

    // Fan out per user. We could parallelize, but Inngest's step.run wrapper
    // already gives us retry + idempotency per step, and the cron only fires
    // every 30 min so wall-clock time isn't tight.
    for (const userId of users) {
      const result = await step.run(`user-${userId}`, () =>
        runAnticipationForUser(userId),
      );
      detected += result.detected;
      ranked += result.ranked;
      inserted += result.inserted;
      if (result.errors.length > 0) {
        allErrors.push(`${userId}: ${result.errors.join("; ")}`);
      }
    }

    const expired = await step.run("janitor-expire", () => expireStaleSuggestions());

    return {
      users: users.length,
      detected,
      ranked,
      inserted,
      expired,
      errorsCount: allErrors.length,
      errors: allErrors.slice(0, 10), // cap for log readability
    };
  },
);
