import type { ToolContext, ToolOutcome } from "../executor";
import { createEmbedder } from "@/lib/ai/embedder";
import { matchEpisodeByText } from "../fuzzy";

const SECTIONS = ["identity", "preferences", "current_themes", "active_projects", "ru_and_me"] as const;
type Section = (typeof SECTIONS)[number];

export async function noteEpisode(
  args: Record<string, unknown>,
  ctx: ToolContext
): Promise<ToolOutcome> {
  const summary = typeof args.summary === "string" ? args.summary.trim() : "";
  if (!summary) return { ok: false, message: "summary is required" };

  const rawImportance = typeof args.importance === "number" ? args.importance : 0.5;
  const importance = Math.max(0, Math.min(1, rawImportance));

  const entityRefs = (args.entity_refs as Record<string, unknown> | undefined) ?? {};

  let embedding: number[] | null = null;
  try {
    const embedder = createEmbedder();
    const [vec] = await embedder.embed([summary]);
    embedding = vec ?? null;
  } catch (e) {
    // Embedding failure is non-fatal — episode still gets written, just without
    // an embedding (consolidation can backfill later).
    console.error("note_episode embedding failed", e);
  }

  const sourceIds = ctx.messageId ? [ctx.messageId] : [];

  const { data, error } = await ctx.supabase
    .from("episodes")
    .insert({
      user_id: ctx.userId,
      content: summary,
      source_message_ids: sourceIds,
      entity_refs: entityRefs,
      importance,
      embedding,
    })
    .select()
    .single();

  if (error || !data) {
    return { ok: false, message: error?.message ?? "episode insert failed" };
  }

  await ctx.supabase.from("memory_audit").insert({
    user_id: ctx.userId,
    kind: "learned",
    summary,
    payload: { entity_refs: entityRefs, importance },
    episode_ids: [data.id],
    reversible: true,
  });

  return {
    ok: true,
    message: "noted",
    cardKind: "insight",
    card: { id: data.id, summary, importance },
  };
}

export async function updateProfile(
  args: Record<string, unknown>,
  ctx: ToolContext
): Promise<ToolOutcome> {
  const section = args.section as Section;
  const update = typeof args.update === "string" ? args.update.trim() : "";
  if (!SECTIONS.includes(section)) return { ok: false, message: "invalid section" };
  if (!update) return { ok: false, message: "update text required" };

  // Write a memory_corrections row (empty `original` = pure addition, the
  // consolidation pass merges into the section).
  const { error: corrErr } = await ctx.supabase.from("memory_corrections").insert({
    user_id: ctx.userId,
    section,
    original: "",
    corrected: update,
  });
  if (corrErr) return { ok: false, message: corrErr.message };

  // Bump version + light patch: append the line to the section's content with
  // a "pending consolidation" marker. The sleep-time job rewrites cleanly.
  const { data: profile } = await ctx.supabase
    .from("profiles")
    .select("profile_doc, profile_version")
    .eq("id", ctx.userId)
    .single();

  const doc = (profile?.profile_doc as Record<string, { content: string; sources: string[]; updated_at: string }> | null) ?? {};
  const existing = doc[section]?.content ?? "";
  const merged = existing ? `${existing}\n${update}` : update;
  const sources = doc[section]?.sources ?? [];
  if (ctx.messageId) sources.push(ctx.messageId);

  doc[section] = {
    content: merged,
    sources,
    updated_at: new Date().toISOString(),
  };

  await ctx.supabase
    .from("profiles")
    .update({
      profile_doc: doc,
      profile_version: (profile?.profile_version ?? 0) + 1,
    })
    .eq("id", ctx.userId);

  await ctx.supabase.from("memory_audit").insert({
    user_id: ctx.userId,
    kind: "profile_rewrite",
    summary: `Updated ${section}: ${update}`,
    payload: { section, update, mode: "tool_light_patch" },
    reversible: true,
  });

  return { ok: true, message: "profile updated" };
}

export async function forget(
  args: Record<string, unknown>,
  ctx: ToolContext
): Promise<ToolOutcome> {
  const target = typeof args.target_description === "string" ? args.target_description.trim() : "";
  const reason = typeof args.reason === "string" ? args.reason : "user retraction";
  if (!target) return { ok: false, message: "target_description is required" };

  const match = await matchEpisodeByText(ctx.supabase, ctx.userId, target);
  if (!match) {
    return { ok: false, message: "no memory matched that description" };
  }

  // Mark the matched episode superseded (no replacement — pure removal).
  await ctx.supabase
    .from("episodes")
    .update({ superseded_by: null, superseded_reason: reason, archived_at: new Date().toISOString() })
    .eq("id", match.id)
    .eq("user_id", ctx.userId);

  await ctx.supabase.from("memory_audit").insert({
    user_id: ctx.userId,
    kind: "forgot",
    summary: `Forgot: ${match.content}`,
    payload: { episode_id: match.id, reason, original_content: match.content },
    episode_ids: [match.id],
    reversible: true,
  });

  return { ok: true, message: "forgotten" };
}
