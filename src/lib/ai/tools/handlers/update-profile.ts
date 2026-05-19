import { revalidatePath } from "next/cache";
import type { ToolContext, ToolOutcome } from "../executor";

/**
 * Update the user's profile via voice/chat. Whitelisted fields only — never
 * pass through arbitrary JSON to the table.
 *
 * Supported:
 *   - display_name  (string)
 *   - timezone      (IANA, e.g. "America/Los_Angeles")
 *   - preferences   (merge; clients use { default_nudge_level, ... })
 */
export async function updateProfile(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolOutcome> {
  const updates = (args.updates as Record<string, unknown>) ?? {};

  const allowed: Record<string, unknown> = {};
  const changed: string[] = [];

  if (typeof updates.display_name === "string") {
    const v = updates.display_name.trim();
    if (v) {
      allowed.display_name = v;
      changed.push(`name → ${v}`);
    }
  }

  if (typeof updates.timezone === "string") {
    const v = updates.timezone.trim();
    // Light validation: must look like Region/City or "UTC". Reject obvious junk.
    if (/^([A-Za-z_]+\/[A-Za-z_+-]+(\/[A-Za-z_+-]+)?|UTC)$/.test(v)) {
      allowed.timezone = v;
      changed.push(`timezone → ${v}`);
    } else {
      return {
        ok: false,
        message: `"${v}" doesn't look like a valid IANA timezone (e.g. America/New_York).`,
      };
    }
  }

  if (updates.preferences && typeof updates.preferences === "object") {
    // Merge into existing preferences rather than clobbering.
    const { data: existing } = await ctx.supabase
      .from("profiles")
      .select("preferences")
      .eq("id", ctx.userId)
      .single();
    const cur = (existing?.preferences as Record<string, unknown>) ?? {};
    allowed.preferences = { ...cur, ...(updates.preferences as Record<string, unknown>) };
    changed.push(`preferences updated`);
  }

  if (Object.keys(allowed).length === 0) {
    return { ok: false, message: "Nothing recognized in updates. Try display_name, timezone, or preferences." };
  }

  const { error } = await ctx.supabase
    .from("profiles")
    .update({ ...allowed, updated_at: new Date().toISOString() } as never)
    .eq("id", ctx.userId);
  if (error) return { ok: false, message: error.message };

  try {
    revalidatePath("/today");
    revalidatePath("/settings");
  } catch {}

  return { ok: true, message: `Updated profile: ${changed.join(", ")}.` };
}
