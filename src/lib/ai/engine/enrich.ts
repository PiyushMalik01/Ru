// src/lib/ai/engine/enrich.ts
import { z } from "zod";
import type { ProviderConfig, NormalizedMessage } from "../types";
import type { EntityCatalog } from "@/lib/queries/memory";

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
});

const EMPTY: TurnEnrichment = {
  resolvedEntities: { tasks: [], routines: [], trackers: [], workspaces: [], dates: [] },
  intentHints: [],
  memorySignals: [],
  sentiment: null,
  voiceContext: null,
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

  try {
    const raw = await callEnrichmentModel(opts, ac.signal);
    const parsed = EnrichmentSchema.safeParse(raw);
    if (!parsed.success) {
      // Drop fields that don't validate, return partial best-effort.
      return mergeWithEmpty(raw);
    }
    return parsed.data;
  } catch {
    return fallbackEnrichment(opts);
  } finally {
    clearTimeout(timeout);
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
  "voiceContext": ${opts.voice ? '{ "disfluencies": 0, "self_corrections": 0 }' : "null"}
}

Rules:
- Only return ids for entities I list in the catalog. Never invent.
- "mentioned_as" is the exact substring of the user message that referred to the entity (pronouns OK: "that thing", "the run").
- Dates resolved in user's timezone ${opts.timezone}; now is ${opts.nowIso}.
- intentHints come from this set ONLY: log_activity, create_task, modify_task, complete_task, create_reminder, declare_routine, complete_routine, skip_routine_today, create_tracker, log_tracker_entry, query_analytics, update_profile, note_episode, forget, chit_chat.
- memorySignals: only emit one when there's a clear span; do not invent.
- ${opts.voice ? "Voice mode: count disfluencies (um, uh, like, you know) and self-corrections (e.g. 'I mean')." : "Text mode: voiceContext is null."}
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
