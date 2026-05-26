import { inngest } from "../client";
import { createServiceClient } from "@/lib/supabase/service";
import { syncUser } from "@/lib/google/gmail-sync";

/**
 * Gmail sync cron — runs every hour. For every google_integrations row with
 * gmail_extraction_enabled=true, runs syncUser. Each user is wrapped in its
 * own step.run so a single user's failure doesn't kill the rest of the batch.
 */
export const gmailSync = inngest.createFunction(
  {
    id: "gmail-sync",
    concurrency: { limit: 10 },
    triggers: [{ cron: "0 * * * *" }],
  },
  async ({ step }) => {
    const userIds = await step.run("load-enabled-users", async () => {
      const supabase = createServiceClient();
      const { data, error } = await supabase
        .from("google_integrations")
        .select("user_id")
        .eq("gmail_extraction_enabled", true);
      if (error) throw new Error(error.message);
      return (data ?? []).map((r) => r.user_id as string);
    });

    let totalInserted = 0;
    let totalScanned = 0;
    const failures: string[] = [];

    for (const userId of userIds) {
      const r = await step.run(`sync-${userId}`, async () => {
        try {
          const out = await syncUser(userId);
          return { inserted: out.inserted, scanned: out.scanned, errors: out.errors };
        } catch (e) {
          return { inserted: 0, scanned: 0, errors: [(e as Error).message] };
        }
      });
      totalInserted += r.inserted;
      totalScanned += r.scanned;
      if (r.errors.length > 0) failures.push(`${userId}: ${r.errors.join("; ")}`);
    }

    return {
      users: userIds.length,
      scanned: totalScanned,
      inserted: totalInserted,
      failures: failures.length > 0 ? failures : undefined,
    };
  },
);
