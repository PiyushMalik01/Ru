import { revalidatePath } from "next/cache";
import type { ToolContext, ToolOutcome } from "../executor";
import { coerceFields, coerceValues, findTracker } from "./tracker-helpers";

export async function logTrackerEntry(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolOutcome> {
  const hint = String(args.tracker ?? args.tracker_name ?? args.tracker_id ?? "").trim();
  if (!hint) return { ok: false, message: "tracker name or id required" };

  const tracker = await findTracker(ctx, hint);
  if (!tracker) {
    return {
      ok: false,
      message: `No tracker matched "${hint}". Create it first with create_tracker.`,
    };
  }

  const fields = coerceFields(tracker.fields);
  const { values, missing } = coerceValues(fields, args.values);

  if (Object.keys(values).length === 0) {
    return {
      ok: false,
      message: `No values to log. Tracker fields: ${fields.map((f) => f.label).join(", ")}.`,
    };
  }

  const entered_at = args.entered_at
    ? new Date(String(args.entered_at)).toISOString()
    : new Date().toISOString();

  const notes = args.notes ? String(args.notes) : null;

  const { data, error } = await ctx.supabase
    .from("tracker_entries")
    .insert({
      user_id: ctx.userId,
      tracker_id: tracker.id,
      values,
      notes,
      entered_at,
      source_message_id: ctx.messageId,
    })
    .select()
    .single();

  if (error || !data) return { ok: false, message: error?.message ?? "insert failed" };

  try {
    revalidatePath("/routines");
    revalidatePath(`/trackers/${tracker.id}`);
  } catch {}

  return {
    ok: true,
    message:
      missing.length > 0
        ? `Logged to ${tracker.name}. Missing: ${missing.join(", ")}.`
        : `Logged to ${tracker.name}.`,
    cardKind: "tracker",
    card: {
      kind: "entry",
      tracker_id: tracker.id,
      tracker_name: tracker.name,
      values,
      missing,
      entered_at,
      fields,
    },
  };
}
