import type { ToolContext, ToolOutcome } from "../executor";
import { getCurrentWorkspaceId, appendToWorkspaceOrder } from "../workspace-helpers";

export async function logActivity(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolOutcome> {
  const activity = String(args.activity ?? "");
  const category = String(args.category ?? "personal");
  const duration_minutes = typeof args.duration_minutes === "number" ? args.duration_minutes : null;
  const metadata = (args.metadata as Record<string, unknown>) ?? {};
  if (!activity) return { ok: false, message: "activity is required" };

  const workspaceId = await getCurrentWorkspaceId(ctx.supabase, ctx.userId);

  const { data, error } = await ctx.supabase.from("activity_log").insert({
    user_id: ctx.userId,
    activity,
    category,
    duration_minutes,
    metadata,
    source_message_id: ctx.messageId,
    timestamp: new Date().toISOString(),
    workspace_id: workspaceId,
  }).select().single();

  if (error || !data) return { ok: false, message: error?.message ?? "insert failed" };

  if (workspaceId) {
    await appendToWorkspaceOrder(ctx.supabase, workspaceId, "activity", data.id);
  }

  return {
    ok: true,
    message: `Logged: ${activity}`,
    cardKind: "activity",
    card: { id: data.id, activity, category, duration_minutes, timestamp: data.timestamp, workspaceId },
  };
}
