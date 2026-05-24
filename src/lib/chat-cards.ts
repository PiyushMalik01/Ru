import type { CardKind, ChatCard } from "@/lib/stores/chat-store";

const VALID_KINDS: ReadonlySet<CardKind> = new Set<CardKind>([
  "task",
  "routine",
  "activity",
  "reminder",
  "insight",
  "tracker",
]);

/**
 * Pull persisted card data out of a message's `metadata` jsonb column.
 *
 * Server-side, the chat route appends each tool_result's (kind, data) pair
 * to `metadata.cards` when finalizing the assistant message. This helper
 * is the read side — it defends against shape drift (manual DB edits,
 * old rows from before this column was used) and returns only the cards
 * whose kind matches the union the renderer knows how to draw.
 */
export function extractCardsFromMetadata(metadata: unknown): ChatCard[] {
  if (!metadata || typeof metadata !== "object") return [];
  const m = metadata as { cards?: unknown };
  if (!Array.isArray(m.cards)) return [];
  const out: ChatCard[] = [];
  for (const c of m.cards) {
    if (!c || typeof c !== "object") continue;
    const entry = c as { kind?: unknown; data?: unknown };
    if (typeof entry.kind !== "string") continue;
    if (!VALID_KINDS.has(entry.kind as CardKind)) continue;
    if (!entry.data || typeof entry.data !== "object") continue;
    out.push({
      kind: entry.kind as CardKind,
      data: entry.data as Record<string, unknown>,
    });
  }
  return out;
}
