// ---------------------------------------------------------------------------
// Gmail LLM extractor
// ---------------------------------------------------------------------------
// Given a parsed Gmail message, produce zero or more actionable items the
// user would actually want to track: meeting invites, deadlines, follow-up
// promises. Newsletters and marketing are filtered out before the model is
// even invoked. We use gpt-4o-mini with JSON mode for cost + strictness.
// ---------------------------------------------------------------------------

import type { ParsedMessage } from "./gmail";

const EXTRACTION_MODEL = "gpt-4o-mini";
const OPENAI_CHAT_ENDPOINT = "https://api.openai.com/v1/chat/completions";

export type ExtractionKind = "task" | "reminder" | "event" | "activity" | "note";

export interface ExtractedItem {
  kind: ExtractionKind;
  payload: Record<string, unknown>;
  confidence: number;
}

interface OpenAIChatResponse {
  choices?: Array<{ message?: { content?: string } }>;
}

const SYSTEM_PROMPT = `You are an extraction engine for a personal organizer called Ru. The user gives you ONE email. You return ONLY actionable items the user themselves would want to track.

Output JSON shape: { "items": [ { "kind": "...", "payload": {...}, "confidence": 0-1 } ] }

Kinds and payloads:
- task: { title: string, due_at?: ISO8601, description?: string } — a thing the user must do (a deadline, an action requested of them)
- reminder: { title: string, remind_at: ISO8601 } — a follow-up the user promised ("I'll send the doc Friday") or needs to chase
- event: { title: string, start_at: ISO8601, end_at?: ISO8601, location?: string } — a meeting, call, or scheduled appointment
- activity: { activity: string, category?: string } — something the user actually did (rare in email — mostly confirmations of completed actions)
- note: { text: string } — a piece of context worth saving but not actionable. Use sparingly.

Rules:
- Info-only emails (newsletters, marketing, receipts the user doesn't need to act on, automated digests): return { "items": [] }
- Do not extract things meant for OTHER people. Only items the user must do or attend.
- Resolve relative dates ("next Tuesday", "by end of week") to ISO8601 if email date is given; otherwise omit the date field.
- Confidence: 0.9+ explicit (calendar invite, written deadline), 0.6-0.8 implied, below 0.5 don't return it.
- Be conservative. Empty array is the correct answer for most emails.`;

/**
 * Filter out obvious marketing / newsletter mail before paying the LLM cost.
 * Heuristics:
 *   - Presence of List-Unsubscribe header (RFC 2369) — every bulk sender uses it
 *   - From: addresses with typical marketing patterns
 */
export function isLikelyNewsletter(msg: ParsedMessage): boolean {
  if (msg.listUnsubscribe) return true;
  const from = (msg.from ?? "").toLowerCase();
  if (!from) return false;
  const markers = [
    "noreply",
    "no-reply",
    "donotreply",
    "do-not-reply",
    "newsletter",
    "marketing",
    "notifications@",
    "updates@",
    "deals@",
    "offers@",
    "promo@",
    "campaign",
    "mailer",
  ];
  return markers.some((m) => from.includes(m));
}

export async function extractFromMessage(
  msg: ParsedMessage,
): Promise<ExtractedItem[]> {
  if (isLikelyNewsletter(msg)) return [];

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.warn("gmail-extractor: OPENAI_API_KEY missing");
    return [];
  }

  const userPrompt = [
    `Email date: ${msg.date ?? "unknown"}`,
    `From: ${msg.from ?? "unknown"}`,
    `Subject: ${msg.subject ?? "(no subject)"}`,
    "",
    "Body:",
    msg.body.slice(0, 6000),
  ].join("\n");

  let res: Response;
  try {
    res = await fetch(OPENAI_CHAT_ENDPOINT, {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: EXTRACTION_MODEL,
        temperature: 0.1,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ],
      }),
    });
  } catch (e) {
    console.warn("gmail-extractor: openai fetch failed", e);
    return [];
  }

  if (!res.ok) {
    console.warn(`gmail-extractor: openai ${res.status} ${await res.text()}`);
    return [];
  }

  let json: OpenAIChatResponse;
  try {
    json = (await res.json()) as OpenAIChatResponse;
  } catch {
    return [];
  }

  const content = json.choices?.[0]?.message?.content;
  if (!content) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return [];
  }

  const items = (parsed as { items?: unknown }).items;
  if (!Array.isArray(items)) return [];

  const out: ExtractedItem[] = [];
  for (const raw of items) {
    const v = validateItem(raw);
    if (v) out.push(v);
  }
  return out;
}

function validateItem(raw: unknown): ExtractedItem | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const kind = r.kind;
  if (
    kind !== "task" &&
    kind !== "reminder" &&
    kind !== "event" &&
    kind !== "activity" &&
    kind !== "note"
  )
    return null;
  const payload = r.payload;
  if (!payload || typeof payload !== "object") return null;
  const p = payload as Record<string, unknown>;

  switch (kind) {
    case "task":
      if (typeof p.title !== "string" || !p.title.trim()) return null;
      break;
    case "reminder":
      if (typeof p.title !== "string" || !p.title.trim()) return null;
      if (typeof p.remind_at !== "string") return null;
      break;
    case "event":
      if (typeof p.title !== "string" || !p.title.trim()) return null;
      if (typeof p.start_at !== "string") return null;
      break;
    case "activity":
      if (typeof p.activity !== "string" || !p.activity.trim()) return null;
      break;
    case "note":
      if (typeof p.text !== "string" || !p.text.trim()) return null;
      break;
  }

  const confidence = typeof r.confidence === "number" ? r.confidence : 0.6;
  if (confidence < 0.5) return null;

  return {
    kind,
    payload: p,
    confidence: Math.max(0, Math.min(1, confidence)),
  };
}
