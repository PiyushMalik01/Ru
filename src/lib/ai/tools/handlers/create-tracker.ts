import { revalidatePath } from "next/cache";
import type { ToolContext, ToolOutcome } from "../executor";
import { coerceFields } from "./tracker-helpers";

export async function createTracker(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolOutcome> {
  const name = String(args.name ?? "").trim();
  if (!name) return { ok: false, message: "name required" };

  const fields = coerceFields(args.fields);
  if (fields.length === 0) {
    return {
      ok: false,
      message:
        "fields required — at least one field with { key, label, type: number|text|duration }",
    };
  }

  const description = args.description ? String(args.description) : null;

  // Default the chart to a line of the first numeric/duration field.
  const primary = fields.find((f) => f.type === "number" || f.type === "duration");
  const display_config = {
    chart_type: "line" as const,
    primary_field: primary?.key,
  };

  const { data, error } = await ctx.supabase
    .from("trackers")
    .insert({
      user_id: ctx.userId,
      name,
      description,
      fields: fields as unknown as Record<string, unknown>[],
      display_config,
    })
    .select()
    .single();

  if (error || !data) {
    // Friendly handling for the unique (user_id, lower(name)) collision.
    if (error?.code === "23505") {
      return {
        ok: false,
        message: `A tracker named "${name}" already exists. Pick a different name or log to the existing one.`,
      };
    }
    return { ok: false, message: error?.message ?? "insert failed" };
  }

  // Bust the routines page cache so the new tracker shows up immediately.
  try { revalidatePath("/routines"); } catch {}

  return {
    ok: true,
    message: `Tracker created: ${name}`,
    cardKind: "tracker",
    card: {
      kind: "created",
      id: data.id,
      name,
      description,
      fields,
      primary_field: primary?.key ?? null,
    },
  };
}
