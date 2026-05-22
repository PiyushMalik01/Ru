import type { NormalizedMessage } from "../types";
import type { MemoryProfile, ProfileDoc, BehavioralModel } from "@/lib/queries/memory";
import type { TurnEnrichment } from "./enrich";
import type { Episode } from "./retrieve";

const SECTION_ORDER = ["identity", "preferences", "current_themes", "active_projects", "ru_and_me"] as const;

function humanLabel(key: string): string {
  switch (key) {
    case "identity":         return "Identity";
    case "preferences":      return "Preferences";
    case "current_themes":   return "Current themes";
    case "active_projects":  return "Active projects";
    case "ru_and_me":        return "Ru & me";
    default: return key;
  }
}

export function buildProfileBlock(doc: ProfileDoc): string | null {
  const parts: string[] = [];
  for (const key of SECTION_ORDER) {
    const section = doc[key];
    if (section && section.content?.trim()) {
      parts.push(`${humanLabel(key)}:\n${section.content.trim()}`);
    }
  }
  if (parts.length === 0) return null;
  return `What Ru knows about this user (their profile):\n\n${parts.join("\n\n")}`;
}

export function buildBehavioralBlock(model: BehavioralModel): string | null {
  const lines: string[] = [];
  if (model.typical_activity_hour) {
    const items = Object.entries(model.typical_activity_hour)
      .map(([cat, h]) => `${cat} at ~${h}:00`)
      .join(", ");
    if (items) lines.push(`Typical activity times: ${items}.`);
  }
  if (model.routine_completion_by_dow) {
    const lowDays = Object.entries(model.routine_completion_by_dow)
      .filter(([, v]) => v < 0.4)
      .map(([d]) => d);
    if (lowDays.length > 0) lines.push(`Tends to skip routines on: ${lowDays.join(", ")}.`);
  }
  if (typeof model.task_creation_to_completion_hours_p50 === "number") {
    lines.push(`Median task-to-completion: ${model.task_creation_to_completion_hours_p50}h.`);
  }
  if (model.nudge_response_rate) {
    const best = Object.entries(model.nudge_response_rate)
      .filter(([, v]) => typeof v === "number")
      .sort((a, b) => (b[1] as number) - (a[1] as number))[0];
    if (best) lines.push(`Responds best to '${best[0]}' nudges.`);
  }
  if (typeof model.sentiment_trend_7d === "number" && Math.abs(model.sentiment_trend_7d) > 0.05) {
    const dir = model.sentiment_trend_7d > 0 ? "trending up" : "trending down";
    lines.push(`Sentiment is ${dir} over the last week.`);
  }
  if (lines.length === 0) return null;
  return `Behavioral patterns Ru has noticed:\n${lines.join("\n")}`;
}

export function buildEpisodicBlock(episodes: Episode[]): string | null {
  if (episodes.length === 0) return null;
  const items = episodes.map((e) => {
    const dateStr = new Date(e.created_at).toISOString().slice(0, 10);
    return `- ${e.content.trim()}  (${dateStr})`;
  });
  return `Things Ru remembers that might matter right now:\n${items.join("\n")}`;
}

export function buildEnrichmentBlock(enrichment: TurnEnrichment | null): string | null {
  if (!enrichment) return null;
  const parts: string[] = [];
  const r = enrichment.resolvedEntities;
  const resolved: string[] = [];
  for (const t of r.tasks)      resolved.push(`task "${t.title}" (id ${t.id}) mentioned as "${t.mentioned_as}"`);
  for (const t of r.routines)   resolved.push(`routine "${t.title}" (id ${t.id}) mentioned as "${t.mentioned_as}"`);
  for (const t of r.trackers)   resolved.push(`tracker "${t.name}" (id ${t.id}) mentioned as "${t.mentioned_as}"`);
  for (const t of r.workspaces) resolved.push(`workspace "${t.title}" (id ${t.id}) mentioned as "${t.mentioned_as}"`);
  for (const d of r.dates)      resolved.push(`date ${d.iso} mentioned as "${d.mentioned_as}"`);
  if (resolved.length > 0) parts.push(`Resolved references in this turn:\n${resolved.map((s) => "- " + s).join("\n")}`);
  if (enrichment.intentHints.length > 0) parts.push(`Likely intents: ${enrichment.intentHints.join(", ")}.`);
  if (enrichment.memorySignals.length > 0) {
    const sigs = enrichment.memorySignals.map((s) => `${s.kind}: "${s.span}"`).join("; ");
    parts.push(`Memory-worthy signals detected: ${sigs}. Consider note_episode or update_memory_profile if appropriate.`);
  }
  if (enrichment.sentiment) parts.push(`User tone: ${enrichment.sentiment}.`);
  if (parts.length === 0) return null;
  return `Turn enrichment (hints for this turn — confirm or override as needed):\n${parts.join("\n")}`;
}

export function injectMemoryBlocks(
  messages: NormalizedMessage[],
  blocks: { profile: MemoryProfile | null; episodes: Episode[]; enrichment: TurnEnrichment | null }
): NormalizedMessage[] {
  const profileBlock = blocks.profile ? buildProfileBlock(blocks.profile.profile_doc) : null;
  const behavioralBlock = blocks.profile ? buildBehavioralBlock(blocks.profile.behavioral_model) : null;
  const episodicBlock = buildEpisodicBlock(blocks.episodes);
  const enrichmentBlock = buildEnrichmentBlock(blocks.enrichment);

  const newBlocks: NormalizedMessage[] = [];
  if (profileBlock)    newBlocks.push({ role: "system", content: profileBlock });
  if (behavioralBlock) newBlocks.push({ role: "system", content: behavioralBlock });
  if (episodicBlock)   newBlocks.push({ role: "system", content: episodicBlock });
  if (enrichmentBlock) newBlocks.push({ role: "system", content: enrichmentBlock });

  if (newBlocks.length === 0) return messages;

  const out: NormalizedMessage[] = [];
  let inserted = false;
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i];
    if (!inserted && m.role !== "system") {
      out.push(...newBlocks);
      inserted = true;
    }
    out.push(m);
  }
  if (!inserted) out.push(...newBlocks);
  return out;
}
