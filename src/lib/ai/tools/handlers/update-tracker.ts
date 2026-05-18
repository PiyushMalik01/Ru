import type { ToolContext, ToolOutcome } from "../executor";
import { coerceFields, findTracker, normalizeKey, type RawField } from "./tracker-helpers";

/**
 * Mutates a tracker's structure. Supported actions:
 *   - add_field     { field: { key?, label, type?, unit? } }
 *   - remove_field  { field_key }      ← historical entries keep their values
 *   - rename_field  { field_key, new_label }
 *   - rename_tracker{ new_name }
 *   - set_chart_type{ chart_type }
 *   - archive       (soft delete)
 */
export async function updateTracker(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolOutcome> {
  const hint = String(args.tracker ?? args.tracker_name ?? args.tracker_id ?? "").trim();
  if (!hint) return { ok: false, message: "tracker name or id required" };

  const action = String(args.action ?? "").trim();
  if (!action) return { ok: false, message: "action required" };

  const tracker = await findTracker(ctx, hint);
  if (!tracker) return { ok: false, message: `No tracker matched "${hint}".` };

  const fields = coerceFields(tracker.fields);

  switch (action) {
    case "add_field": {
      const fieldArg = args.field as Record<string, unknown> | undefined;
      if (!fieldArg) return { ok: false, message: "field required" };
      const label = String(fieldArg.label ?? "").trim();
      if (!label) return { ok: false, message: "field.label required" };
      const key = normalizeKey(String(fieldArg.key ?? label));
      if (fields.some((f) => f.key === key)) {
        return { ok: false, message: `Field "${label}" already exists.` };
      }
      const t = String(fieldArg.type ?? "number").toLowerCase();
      const type: RawField["type"] =
        t === "text" ? "text" : t === "duration" ? "duration" : "number";
      const next: RawField[] = [
        ...fields,
        { key, label, type, unit: fieldArg.unit ? String(fieldArg.unit) : undefined },
      ];
      return await persistFields(ctx, tracker.id, tracker.name, next, "added");
    }

    case "remove_field": {
      const fieldKey = normalizeKey(String(args.field_key ?? args.field_label ?? ""));
      if (!fieldKey) return { ok: false, message: "field_key required" };
      const next = fields.filter((f) => f.key !== fieldKey && normalizeKey(f.label) !== fieldKey);
      if (next.length === fields.length) {
        return { ok: false, message: `Field "${fieldKey}" not found.` };
      }
      return await persistFields(ctx, tracker.id, tracker.name, next, "removed");
    }

    case "rename_field": {
      const fieldKey = normalizeKey(String(args.field_key ?? args.field_label ?? ""));
      const newLabel = String(args.new_label ?? "").trim();
      if (!fieldKey || !newLabel) return { ok: false, message: "field_key and new_label required" };
      let touched = false;
      const next = fields.map((f) => {
        if (f.key === fieldKey || normalizeKey(f.label) === fieldKey) {
          touched = true;
          return { ...f, label: newLabel };
        }
        return f;
      });
      if (!touched) return { ok: false, message: `Field "${fieldKey}" not found.` };
      return await persistFields(ctx, tracker.id, tracker.name, next, "renamed");
    }

    case "rename_tracker": {
      const newName = String(args.new_name ?? "").trim();
      if (!newName) return { ok: false, message: "new_name required" };
      const { error } = await ctx.supabase
        .from("trackers")
        .update({ name: newName, updated_at: new Date().toISOString() })
        .eq("id", tracker.id);
      if (error) return { ok: false, message: error.message };
      return outcome(tracker.id, newName, fields, `Renamed to ${newName}.`);
    }

    case "set_chart_type": {
      const chart = String(args.chart_type ?? "").toLowerCase();
      if (!["line", "bar", "area"].includes(chart)) {
        return { ok: false, message: "chart_type must be line, bar, or area" };
      }
      const { error } = await ctx.supabase
        .from("trackers")
        .update({
          display_config: { chart_type: chart },
          updated_at: new Date().toISOString(),
        })
        .eq("id", tracker.id);
      if (error) return { ok: false, message: error.message };
      return outcome(tracker.id, tracker.name, fields, `Chart set to ${chart}.`);
    }

    case "archive": {
      const { error } = await ctx.supabase
        .from("trackers")
        .update({ archived: true, updated_at: new Date().toISOString() })
        .eq("id", tracker.id);
      if (error) return { ok: false, message: error.message };
      return {
        ok: true,
        message: `Archived ${tracker.name}.`,
        cardKind: "tracker",
        card: { kind: "archived", id: tracker.id, name: tracker.name },
      };
    }

    default:
      return { ok: false, message: `Unknown action "${action}".` };
  }
}

async function persistFields(
  ctx: ToolContext,
  trackerId: string,
  name: string,
  fields: RawField[],
  verb: string,
): Promise<ToolOutcome> {
  const { error } = await ctx.supabase
    .from("trackers")
    .update({
      fields: fields as unknown as Record<string, unknown>[],
      updated_at: new Date().toISOString(),
    })
    .eq("id", trackerId);
  if (error) return { ok: false, message: error.message };
  return outcome(trackerId, name, fields, `Field ${verb} in ${name}.`);
}

function outcome(
  id: string,
  name: string,
  fields: RawField[],
  message: string,
): ToolOutcome {
  return {
    ok: true,
    message,
    cardKind: "tracker",
    card: { kind: "updated", id, name, fields },
  };
}
