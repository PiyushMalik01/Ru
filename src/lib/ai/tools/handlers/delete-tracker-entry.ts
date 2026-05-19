import { revalidatePath } from "next/cache";
import type { ToolContext, ToolOutcome } from "../executor";
import { findTracker } from "./tracker-helpers";

/**
 * Delete the most recent entry from a tracker (default), or a specific entry
 * by id. Use this when the user says "scratch that last run" or similar.
 */
export async function deleteTrackerEntry(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolOutcome> {
  const trackerHint = String(args.tracker ?? args.tracker_name ?? args.tracker_id ?? "");
  const entryIdArg = args.entry_id ? String(args.entry_id) : null;

  if (!trackerHint && !entryIdArg) {
    return { ok: false, message: "tracker or entry_id required" };
  }

  let entryId: string;
  let trackerId: string | null = null;
  let trackerName: string | null = null;

  if (entryIdArg) {
    // Direct id — look up the entry to confirm ownership and grab the
    // tracker_id for revalidation.
    const { data } = await ctx.supabase
      .from("tracker_entries")
      .select("id, tracker_id")
      .eq("user_id", ctx.userId)
      .eq("id", entryIdArg)
      .maybeSingle();
    if (!data) return { ok: false, message: "entry not found" };
    entryId = data.id;
    trackerId = data.tracker_id;
  } else {
    const tracker = await findTracker(ctx, trackerHint);
    if (!tracker) return { ok: false, message: `No tracker matched "${trackerHint}".` };
    trackerId = tracker.id;
    trackerName = tracker.name;

    // Most recent entry on this tracker
    const { data } = await ctx.supabase
      .from("tracker_entries")
      .select("id")
      .eq("user_id", ctx.userId)
      .eq("tracker_id", tracker.id)
      .order("entered_at", { ascending: false })
      .limit(1);
    if (!data?.[0]) return { ok: false, message: `${tracker.name} has no entries to delete.` };
    entryId = data[0].id;
  }

  const { error } = await ctx.supabase
    .from("tracker_entries")
    .delete()
    .eq("id", entryId)
    .eq("user_id", ctx.userId);
  if (error) return { ok: false, message: error.message };

  if (trackerId) {
    try {
      revalidatePath("/routines");
      revalidatePath(`/trackers/${trackerId}`);
    } catch {}
  }

  return {
    ok: true,
    message: trackerName ? `Removed last entry from ${trackerName}.` : `Removed entry.`,
  };
}
