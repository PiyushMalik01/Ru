import type { ToolContext } from "../executor";

export interface RawField {
  key: string;
  label: string;
  type: "number" | "text" | "duration";
  unit?: string;
}

/** lowercase + snake_case so two trackers don't collide on case differences. */
export function normalizeKey(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/[^\w\s]+/g, "")
    .replace(/\s+/g, "_")
    .slice(0, 60);
}

/** Coerce loosely-typed JSON fields from the model into a clean array. */
export function coerceFields(input: unknown): RawField[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  const out: RawField[] = [];
  for (const f of input) {
    if (typeof f !== "object" || f === null) continue;
    const o = f as Record<string, unknown>;
    const label = String(o.label ?? o.name ?? o.key ?? "").trim();
    if (!label) continue;
    const key = normalizeKey(String(o.key ?? label));
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const t = String(o.type ?? "number").toLowerCase();
    const type: RawField["type"] =
      t === "text" ? "text" : t === "duration" ? "duration" : "number";
    out.push({
      key,
      label,
      type,
      unit: o.unit ? String(o.unit) : undefined,
    });
  }
  return out;
}

/** Look up a tracker by id, exact-name (case-insensitive), or fuzzy contains. */
export async function findTracker(
  ctx: ToolContext,
  hint: string,
): Promise<{ id: string; name: string; fields: unknown } | null> {
  const h = hint.trim();
  if (!h) return null;

  // UUID? short-circuit
  if (/^[0-9a-f-]{36}$/i.test(h)) {
    const { data } = await ctx.supabase
      .from("trackers")
      .select("id, name, fields")
      .eq("user_id", ctx.userId)
      .eq("id", h)
      .maybeSingle();
    if (data) return data;
  }

  // Exact (case-insensitive) name
  const { data: exact } = await ctx.supabase
    .from("trackers")
    .select("id, name, fields")
    .eq("user_id", ctx.userId)
    .eq("archived", false)
    .ilike("name", h)
    .maybeSingle();
  if (exact) return exact;

  // Fuzzy contains
  const { data: fuzzy } = await ctx.supabase
    .from("trackers")
    .select("id, name, fields")
    .eq("user_id", ctx.userId)
    .eq("archived", false)
    .ilike("name", `%${h}%`)
    .limit(1);
  return fuzzy?.[0] ?? null;
}

/** Coerce entry values to the field types. Drops unknown keys. */
export function coerceValues(
  fields: RawField[],
  input: unknown,
): { values: Record<string, number | string>; missing: string[] } {
  if (typeof input !== "object" || input === null) {
    return { values: {}, missing: fields.map((f) => f.label) };
  }
  const blob = input as Record<string, unknown>;
  const out: Record<string, number | string> = {};
  const missing: string[] = [];

  for (const f of fields) {
    // Accept either the key or the label as the lookup. The model is sloppy.
    const raw = blob[f.key] ?? blob[f.label] ?? blob[normalizeKey(f.label)];
    if (raw === undefined || raw === null || raw === "") {
      missing.push(f.label);
      continue;
    }
    if (f.type === "number" || f.type === "duration") {
      const n = typeof raw === "number" ? raw : parseFloat(String(raw));
      if (Number.isFinite(n)) out[f.key] = n;
      else missing.push(f.label);
    } else {
      out[f.key] = String(raw);
    }
  }

  return { values: out, missing };
}
