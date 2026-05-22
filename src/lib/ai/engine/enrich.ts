// src/lib/ai/engine/enrich.ts
//
// Promise-extraction wiring (added with the anticipation work):
//
// Rather than spin a second LLM call, we EXTEND the existing enrichment
// schema with a `promises` array. The cheap-sibling model already sees the
// user message + recent turns + entity catalog, so adding 1 field to the
// JSON shape costs near-zero latency. The Zod schema treats `promises` as
// optional (no breaking change for older provider responses) and we insert
// rows into the `promises` table from a *separate* fire-and-forget helper
// (`persistExtractedPromises`) so a DB hiccup never blocks the chat turn.
//
// Callers that have a supabase client + the user's id + the source message
// id can pass them via the new optional `persistPromises` option; if any of
// those are missing we silently skip persistence (the chat route opts in,
// unit tests opt out).
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import type { ProviderConfig, NormalizedMessage } from "../types";
import type { EntityCatalog } from "@/lib/queries/memory";

export interface ExtractedPromise {
  subject: string;
  due_by_iso?: string;
}

export interface TurnEnrichment {
  resolvedEntities: {
    tasks:      Array<{ id: string; title: string; mentioned_as: string }>;
    routines:   Array<{ id: string; title: string; mentioned_as: string }>;
    trackers:   Array<{ id: string; name: string;  mentioned_as: string }>;
    workspaces: Array<{ id: string; title: string; mentioned_as: string }>;
    dates:      Array<{ iso: string; mentioned_as: string }>;
  };
  intentHints: string[];
  memorySignals: Array<{
    kind: "preference_reveal" | "life_event" | "correction" | "strong_opinion" | "plan_statement";
    span: string;
  }>;
  sentiment: "positive" | "neutral" | "low" | "stressed" | null;
  voiceContext: { disfluencies: number; self_corrections: number } | null;
  promises: ExtractedPromise[];
}

const EnrichmentSchema = z.object({
  resolvedEntities: z.object({
    tasks:      z.array(z.object({ id: z.string(), title: z.string(), mentioned_as: z.string() })),
    routines:   z.array(z.object({ id: z.string(), title: z.string(), mentioned_as: z.string() })),
    trackers:   z.array(z.object({ id: z.string(), name: z.string(),  mentioned_as: z.string() })),
    workspaces: z.array(z.object({ id: z.string(), title: z.string(), mentioned_as: z.string() })),
    dates:      z.array(z.object({ iso: z.string(), mentioned_as: z.string() })),
  }),
  intentHints: z.array(z.string()),
  memorySignals: z.array(z.object({
    kind: z.enum(["preference_reveal", "life_event", "correction", "strong_opinion", "plan_statement"]),
    span: z.string(),
  })),
  sentiment: z.enum(["positive", "neutral", "low", "stressed"]).nullable(),
  voiceContext: z.object({ disfluencies: z.number(), self_corrections: z.number() }).nullable(),
  promises: z
    .array(
      z.object({
        subject: z.string().min(1),
        due_by_iso: z.string().optional(),
      })
    )
    .optional()
    .default([]),
});

const EMPTY: TurnEnrichment = {
  resolvedEntities: { tasks: [], routines: [], trackers: [], workspaces: [], dates: [] },
  intentHints: [],
  memorySignals: [],
  sentiment: null,
  voiceContext: null,
  promises: [],
};

const TIMEOUT_MS = 600;

export async function enrichTurn(opts: {
  userMessage: string;
  recentTurns: NormalizedMessage[];
  entityCatalog: EntityCatalog;
  voice: boolean;
  nowIso: string;
  timezone: string;
  config: ProviderConfig;
  signal?: AbortSignal;
  /**
   * Optional promise persistence side-channel. Fire-and-forget: if `supabase`,
   * `userId`, and `sourceMessageId` are all present we insert any extracted
   * promises into the `promises` table. Failures are logged + swallowed so
   * they can never block the chat turn.
   */
  persistPromises?: {
    supabase: SupabaseClient<Database>;
    userId: string;
    sourceMessageId: string | null;
  };
}): Promise<TurnEnrichment | null> {
  // For ChatGPT OAuth users, skip the LLM call to avoid burning their quota.
  // Use pure-SQL/rule-based fallback (entity match only).
  if (opts.config.provider === "chatgpt_oauth") {
    return fallbackEnrichment(opts);
  }

  const ac = new AbortController();
  const timeout = setTimeout(() => ac.abort(), TIMEOUT_MS);
  if (opts.signal) {
    opts.signal.addEventListener("abort", () => ac.abort());
  }

  let result: TurnEnrichment | null = null;
  try {
    const raw = await callEnrichmentModel(opts, ac.signal);
    const parsed = EnrichmentSchema.safeParse(raw);
    if (!parsed.success) {
      result = mergeWithEmpty(raw);
    } else {
      result = parsed.data;
    }
  } catch {
    result = fallbackEnrichment(opts);
  } finally {
    clearTimeout(timeout);
  }

  // Side channel: persist extracted promises. Fire-and-forget — never throws.
  if (result && result.promises.length > 0 && opts.persistPromises) {
    void persistExtractedPromises({
      promises: result.promises,
      nowIso: opts.nowIso,
      ...opts.persistPromises,
    });
  }

  return result;
}

async function persistExtractedPromises(args: {
  promises: ExtractedPromise[];
  nowIso: string;
  supabase: SupabaseClient<Database>;
  userId: string;
  sourceMessageId: string | null;
}): Promise<void> {
  try {
    const rows = args.promises
      .map((p) => {
        const subject = p.subject?.trim();
        if (!subject) return null;
        let dueBy: string | null = null;
        if (p.due_by_iso) {
          const parsed = Date.parse(p.due_by_iso);
          if (Number.isFinite(parsed)) {
            dueBy = new Date(parsed).toISOString();
          }
        }
        return {
          user_id: args.userId,
          subject,
          promised_at: args.nowIso,
          due_by: dueBy,
          source_message_id: args.sourceMessageId,
        };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);

    if (rows.length === 0) return;
    const { error } = await args.supabase.from("promises").insert(rows);
    if (error) {
      console.error("enrichTurn: promise insert failed", error);
    }
  } catch (e) {
    console.error("enrichTurn: promise persist threw", e);
  }
}

function fallbackEnrichment(opts: {
  userMessage: string;
  entityCatalog: EntityCatalog;
}): TurnEnrichment {
  // Pure rule-based: case-insensitive substring match against the entity catalog.
  const msg = opts.userMessage.toLowerCase();
  const matchedTasks = opts.entityCatalog.tasks
    .filter((t) => t.title && msg.includes(t.title.toLowerCase()))
    .map((t) => ({ id: t.id, title: t.title, mentioned_as: t.title }));
  const matchedRoutines = opts.entityCatalog.routines
    .filter((r) => r.title && msg.includes(r.title.toLowerCase()))
    .map((r) => ({ id: r.id, title: r.title, mentioned_as: r.title }));
  const matchedTrackers = opts.entityCatalog.trackers
    .filter((t) => t.name && msg.includes(t.name.toLowerCase()))
    .map((t) => ({ id: t.id, name: t.name, mentioned_as: t.name }));
  const matchedWorkspaces = opts.entityCatalog.workspaces
    .filter((w) => w.title && msg.includes(w.title.toLowerCase()))
    .map((w) => ({ id: w.id, title: w.title, mentioned_as: w.title }));

  return {
    ...EMPTY,
    resolvedEntities: {
      tasks: matchedTasks,
      routines: matchedRoutines,
      trackers: matchedTrackers,
      workspaces: matchedWorkspaces,
      dates: [],
    },
  };
}

function mergeWithEmpty(raw: unknown): TurnEnrichment {
  if (!raw || typeof raw !== "object") return EMPTY;
  const safe = raw as Partial<TurnEnrichment>;
  return {
    resolvedEntities: safe.resolvedEntities ?? EMPTY.resolvedEntities,
    intentHints: Array.isArray(safe.intentHints) ? safe.intentHints : [],
    memorySignals: Array.isArray(safe.memorySignals) ? safe.memorySignals : [],
    sentiment: safe.sentiment ?? null,
    voiceContext: safe.voiceContext ?? null,
    promises: Array.isArray(safe.promises) ? safe.promises : [],
  };
}

// Provider-specific cheap-sibling call. Returns raw JSON object to be schema-validated.
async function callEnrichmentModel(
  opts: {
    userMessage: string;
    recentTurns: NormalizedMessage[];
    entityCatalog: EntityCatalog;
    voice: boolean;
    nowIso: string;
    timezone: string;
    config: ProviderConfig;
  },
  signal: AbortSignal
): Promise<unknown> {
  const systemPrompt = buildEnrichmentSystemPrompt(opts);
  const userPrompt = buildEnrichmentUserPrompt(opts);

  if (opts.config.provider === "anthropic") {
    const Anthropic = (await import("@anthropic-ai/sdk")).default;
    const client = new Anthropic({ apiKey: opts.config.apiKey });
    const msg = await client.messages.create(
      {
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1024,
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
      },
      { signal: signal as never }
    );
    const text = msg.content.find((b) => b.type === "text");
    if (!text || text.type !== "text") return null;
    return safeParseJSON(text.text);
  }

  if (opts.config.provider === "openai") {
    const OpenAI = (await import("openai")).default;
    const client = new OpenAI({ apiKey: opts.config.apiKey });
    const completion = await client.chat.completions.create(
      {
        model: "gpt-4o-mini",
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      },
      { signal: signal as never }
    );
    const content = completion.choices[0]?.message.content;
    return content ? safeParseJSON(content) : null;
  }

  if (opts.config.provider === "gemini") {
    const { GoogleGenerativeAI } = await import("@google/generative-ai");
    const genai = new GoogleGenerativeAI(opts.config.apiKey);
    const model = genai.getGenerativeModel({
      model: "gemini-2.5-flash",
      systemInstruction: systemPrompt,
      generationConfig: { responseMimeType: "application/json" },
    });
    const result = await model.generateContent(userPrompt);
    return safeParseJSON(result.response.text());
  }

  return null;
}

function safeParseJSON(s: string): unknown {
  try { return JSON.parse(s); } catch { return null; }
}

function buildEnrichmentSystemPrompt(opts: { voice: boolean; nowIso: string; timezone: string }): string {
  return `You analyze a user turn for Ru, an AI life organizer. Output STRICT JSON matching this shape:

{
  "resolvedEntities": {
    "tasks":      [{ "id": "uuid", "title": "...", "mentioned_as": "..." }],
    "routines":   [{ "id": "uuid", "title": "...", "mentioned_as": "..." }],
    "trackers":   [{ "id": "uuid", "name": "...",  "mentioned_as": "..." }],
    "workspaces": [{ "id": "uuid", "title": "...", "mentioned_as": "..." }],
    "dates":      [{ "iso": "YYYY-MM-DD or YYYY-MM-DDTHH:MM:SS+TZ", "mentioned_as": "tomorrow" }]
  },
  "intentHints": ["log_activity", "..."],
  "memorySignals": [{ "kind": "preference_reveal | life_event | correction | strong_opinion | plan_statement", "span": "..." }],
  "sentiment": "positive | neutral | low | stressed | null",
  "voiceContext": ${opts.voice ? '{ "disfluencies": 0, "self_corrections": 0 }' : "null"},
  "promises": [{ "subject": "short verb phrase the user committed to", "due_by_iso": "optional ISO timestamp" }]
}

Rules:
- Only return ids for entities I list in the catalog. Never invent.
- "mentioned_as" is the exact substring of the user message that referred to the entity (pronouns OK: "that thing", "the run").
- Dates resolved in user's timezone ${opts.timezone}; now is ${opts.nowIso}.
- intentHints come from this set ONLY: log_activity, create_task, modify_task, complete_task, create_reminder, declare_routine, complete_routine, skip_routine_today, create_tracker, log_tracker_entry, query_analytics, update_profile, note_episode, forget, chit_chat.
- memorySignals: only emit one when there's a clear span; do not invent.
- ${opts.voice ? "Voice mode: count disfluencies (um, uh, like, you know) and self-corrections (e.g. 'I mean')." : "Text mode: voiceContext is null."}
- promises: Only emit when the user CLEARLY commits to a future action with first-person intent — "I'll X tomorrow", "I'm going to Y", "I should Z this week", "I promise to W". DO NOT extract idle commentary, hypotheticals ("if I had time I'd..."), questions, or things the user is asking Ru to do. The subject should be a concise verb phrase ("call mom", "finish the OChem essay"). If there is no clear due date, omit due_by_iso entirely.
- Output ONLY the JSON object. No prose.`;
}

function buildEnrichmentUserPrompt(opts: {
  userMessage: string;
  recentTurns: NormalizedMessage[];
  entityCatalog: EntityCatalog;
}): string {
  const recent = opts.recentTurns
    .slice(-10)
    .map((t) => `${t.role}: ${t.content}`)
    .join("\n");
  const catalog = JSON.stringify({
    tasks:      opts.entityCatalog.tasks,
    routines:   opts.entityCatalog.routines,
    trackers:   opts.entityCatalog.trackers,
    workspaces: opts.entityCatalog.workspaces,
  }, null, 0);
  return `Entity catalog:
${catalog}

Recent turns:
${recent || "(none)"}

User turn to analyze:
${opts.userMessage}`;
}
