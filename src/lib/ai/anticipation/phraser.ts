// ---------------------------------------------------------------------------
// Anticipation phraser
// ---------------------------------------------------------------------------
// Turns a structured Candidate into a one-line message in Ru's voice. The
// phraser is the only LLM call in the pipeline — detectors and ranker are
// deterministic. We use gpt-4o-mini for cost; ~$0.0003 per suggestion.
//
// The prompt locks output to a single short sentence, conversational, no
// trailing punctuation flourish, and forbids markdown / emojis / asterisks.
// On any failure, falls back to a template phrasing that's still good
// enough — quality dips, but the suggestion still surfaces.
// ---------------------------------------------------------------------------

import type { Candidate, PhrasedCandidate } from "./types";

const PHRASING_MODEL = "gpt-4o-mini";
const OPENAI_CHAT_ENDPOINT = "https://api.openai.com/v1/chat/completions";

interface OpenAIChatResponse {
  choices?: Array<{ message?: { content?: string } }>;
}

const SYSTEM_PROMPT = `You are Ru, a warm, observant personal organizer. You're writing ONE proactive notification — a single short sentence the user will see in their Today view or as a soft toast.

Voice:
- Conversational, second-person ("you"), like a thoughtful friend
- Specific to the situation; reference the concrete data given
- Never start with "Hey" / "Hi" / "Just a heads up"
- No emojis, no asterisks, no markdown, no exclamation points
- No more than 18 words
- End with a clean period

Tone adapts to the situation:
- gentle: low-key check-in, no pressure
- urgent: factual, brief, no panic
- curious: a small invitation, no demand
- celebratory: warm, not gushing
- neutral: matter-of-fact

Never:
- Restate the data verbatim ("Your task X is due Y")
- Use template phrases ("Don't forget...", "Reminder:")
- Apologize or hedge ("If you have time...", "Sorry to bother...")`;

export async function phraseCandidates(
  candidates: Candidate[],
): Promise<PhrasedCandidate[]> {
  if (candidates.length === 0) return [];
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.warn("anticipation: OPENAI_API_KEY missing — falling back to templates");
    return candidates.map((c) => ({ ...c, message: fallbackPhrasing(c) }));
  }

  // Phrase in parallel — each is independent. Cap concurrency at 5 to
  // avoid hammering OpenAI; suggestions per cron tick are typically <20.
  const out: PhrasedCandidate[] = [];
  const queue = candidates.slice();
  const workers: Promise<void>[] = [];
  for (let i = 0; i < Math.min(5, queue.length); i++) {
    workers.push((async () => {
      while (queue.length > 0) {
        const c = queue.shift();
        if (!c) break;
        const msg = await phraseOne(c, apiKey).catch(() => null);
        out.push({ ...c, message: msg ?? fallbackPhrasing(c) });
      }
    })());
  }
  await Promise.all(workers);
  return out;
}

async function phraseOne(c: Candidate, apiKey: string): Promise<string | null> {
  const userMsg = [
    `Situation: ${c.phrasingHint.situation}`,
    `Tone: ${c.phrasingHint.tone}`,
    `Data: ${JSON.stringify(c.phrasingHint.data)}`,
    c.phrasingHint.examples?.length
      ? `Reference phrasings (do NOT copy verbatim):\n${c.phrasingHint.examples.map((e) => `- ${e}`).join("\n")}`
      : null,
    "",
    "Write the notification now. One sentence only.",
  ]
    .filter(Boolean)
    .join("\n");

  const body = {
    model: PHRASING_MODEL,
    temperature: 0.5,
    max_tokens: 60,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userMsg },
    ],
  };

  const res = await fetch(OPENAI_CHAT_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    let detail = "(body read failed)";
    try { detail = (await res.text()).slice(0, 200); } catch { /* noop */ }
    console.error(`phraser openai ${res.status}: ${detail}`);
    return null;
  }
  let parsed: OpenAIChatResponse;
  try {
    parsed = (await res.json()) as OpenAIChatResponse;
  } catch {
    return null;
  }
  const content = parsed.choices?.[0]?.message?.content?.trim();
  if (!content) return null;
  return sanitize(content);
}

/**
 * Strip markdown / quotes / leading "Hey"s the LLM might still emit despite
 * the prompt. Keep it conservative — we don't want to mangle good output.
 */
function sanitize(text: string): string {
  let t = text.trim();
  // Strip wrapping quotes
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
    t = t.slice(1, -1);
  }
  // Strip markdown emphasis / bullet syntax
  t = t.replace(/\*\*/g, "").replace(/^[-•]\s+/, "");
  // Strip leading filler
  t = t.replace(/^(hey|hi|just a heads up|reminder:?|fyi:?)[,\s]+/i, "");
  // Single space + clean
  t = t.replace(/\s+/g, " ").trim();
  // Ensure ends in a period (or ? for curious tone)
  if (t && !/[.?!]$/.test(t)) t += ".";
  // Cap to 200 chars defensively
  if (t.length > 200) t = t.slice(0, 197) + "…";
  return t;
}

/**
 * Template fallback used when the LLM is unavailable or errors. Quality
 * is worse but the suggestion still surfaces — important for cron resilience.
 */
function fallbackPhrasing(c: Candidate): string {
  switch (c.type) {
    case "routine_adherence": {
      const name = (c.payload.name as string) ?? "your routine";
      return `Your ${name} usually happens around now.`;
    }
    case "task_urgency": {
      const title = (c.payload.title as string) ?? "that task";
      const days = (c.payload.days_quiet as number) ?? null;
      return days
        ? `${title} has been quiet for ${days} days.`
        : `${title} is coming up — worth a look.`;
    }
    case "routine_candidate": {
      const pattern = (c.payload.pattern as string) ?? "a pattern";
      return `You've been doing ${pattern} consistently — want to make it a routine?`;
    }
    case "promise_followup": {
      const subject = (c.payload.subject as string) ?? "what you mentioned";
      return `You said you'd ${subject} — still on for that?`;
    }
    case "cross_thread": {
      return `You started something related in another chat — pull it in?`;
    }
  }
}

export const __testing = { sanitize, fallbackPhrasing };
