// Notification phraser — writes notification bodies in Ru's voice instead of
// the system-y "Reminder: Buy milk" defaults.
//
// Called by dispatch() before delivery. The phraser is the only LLM call in
// the notification pipeline; on any failure it falls back to the
// caller-provided body (or a template), so a flaky model can't break delivery.
//
// Cost: ~$0.0003 per notification on gpt-4o-mini. Dedup in dispatch() means
// the same (kind, entity_id) only phrases once per hour, so a real user
// generates a few cents per month.

import type { Database } from "@/types/database";

type NotificationKind = Database["public"]["Enums"]["notification_kind"];

const MODEL = "gpt-4o-mini";
const OPENAI_CHAT_ENDPOINT = "https://api.openai.com/v1/chat/completions";

interface OpenAIChatResponse {
  choices?: Array<{ message?: { content?: string } }>;
}

export interface PhraseInput {
  kind: NotificationKind;
  title: string;
  /** What the dispatcher would have used as the body. Kept as a fallback. */
  fallbackBody?: string | null;
  /** Structured payload the phraser can reference (due_at, days_overdue, …). */
  data?: Record<string, unknown> | null;
}

type Tone = "gentle" | "urgent" | "curious" | "celebratory" | "neutral";

interface ToneAndSituation {
  tone: Tone;
  situation: string;
}

const SYSTEM_PROMPT = `You are Ru, a warm, observant personal organizer. You're writing ONE proactive notification body — a single short sentence the user will see in their inbox, push, or email.

Voice:
- Conversational, second-person ("you"), like a thoughtful friend texting
- Specific to the situation; reference the concrete data given
- Never start with "Hey", "Hi", "Just a heads up", or "Reminder"
- No emojis, no asterisks, no markdown, no exclamation points
- No more than 22 words
- End with a clean period (or "?" if you're inviting a response)
- Never restate the title verbatim — the user sees it right above your body
- Never sign off ("— Ru", "Cheers") — the email frame does that

Tone adapts to the situation:
- gentle: low-key check-in, no pressure, warm
- urgent: factual, brief, no panic
- curious: a soft invitation, open question
- celebratory: warm acknowledgment, not gushing
- neutral: matter-of-fact

Forbidden phrases:
- "Don't forget…"
- "Friendly reminder…"
- "Just wanted to…"
- "Hope this helps"
- "If you have time"`;

/** Phrase a single notification. Falls back to fallbackBody (or title) on any failure. */
export async function phraseNotification(input: PhraseInput): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  const fallback = input.fallbackBody?.trim() || templateFallback(input);
  if (!apiKey) return fallback;

  const { tone, situation } = toneAndSituationFor(input);

  const userMsg = [
    `Situation: ${situation}`,
    `Title shown above your body: "${input.title}"`,
    `Tone: ${tone}`,
    input.data && Object.keys(input.data).length > 0
      ? `Data: ${JSON.stringify(input.data)}`
      : null,
    "",
    "Write the notification body now. One short sentence only.",
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const res = await fetch(OPENAI_CHAT_ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0.55,
        max_tokens: 80,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userMsg },
        ],
      }),
    });
    if (!res.ok) return fallback;
    const parsed = (await res.json()) as OpenAIChatResponse;
    const content = parsed.choices?.[0]?.message?.content?.trim();
    if (!content) return fallback;
    return sanitize(content);
  } catch {
    return fallback;
  }
}

function toneAndSituationFor(input: PhraseInput): ToneAndSituation {
  switch (input.kind) {
    case "reminder_due":
      return { tone: "gentle", situation: "A reminder the user set is due right now." };
    case "task_due_soon":
      return { tone: "gentle", situation: "A task is due within the hour." };
    case "task_overdue":
      return { tone: "gentle", situation: "A task's deadline just passed; gentle nudge, not scolding." };
    case "routine_missed":
      return { tone: "gentle", situation: "The user skipped a routine today; a soft check-in, no guilt." };
    case "streak_milestone":
      return { tone: "celebratory", situation: "The user hit a routine streak milestone. Warm acknowledgement." };
    case "plan_deadline":
      return { tone: "gentle", situation: "A plan's deadline is approaching; nudge to look at it." };
    case "suggestion_urgent":
      return { tone: "urgent", situation: "Ru noticed something the user should act on now." };
    case "gmail_extracted":
      return { tone: "curious", situation: "Ru spotted an action item in the user's email and pulled it into the inbox." };
    case "calendar_event_soon":
      return { tone: "gentle", situation: "A calendar event is coming up; quick heads-up." };
    case "daily_digest":
      return { tone: "neutral", situation: "Morning brief preamble — one warm opening sentence before the day's items." };
    case "system":
      return { tone: "neutral", situation: "A system notice from Ru about the platform." };
    default:
      return { tone: "neutral", situation: "A general notification." };
  }
}

/** When the LLM is unavailable, fall back to a warm template per kind. */
function templateFallback(input: PhraseInput): string {
  const title = input.title.replace(/^[A-Z]/, (c) => c.toLowerCase());
  switch (input.kind) {
    case "reminder_due":
      return `quick one — ${title}.`;
    case "task_due_soon":
      return `${title} is due within the hour.`;
    case "task_overdue":
      return `${title} just passed its deadline — still on for it?`;
    case "routine_missed":
      return `${title} didn't happen today.`;
    case "streak_milestone":
      return `${title} — nice run.`;
    case "plan_deadline":
      return `${title} is coming up.`;
    case "suggestion_urgent":
      return `${title} — worth a look now.`;
    case "gmail_extracted":
      return `something in your inbox might be worth pulling in.`;
    case "calendar_event_soon":
      return `${title} is coming up.`;
    case "daily_digest":
      return `here's what's on for today.`;
    default:
      return input.title;
  }
}

function sanitize(text: string): string {
  let t = text.trim();
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
    t = t.slice(1, -1);
  }
  t = t.replace(/\*\*/g, "").replace(/^[-•]\s+/, "");
  t = t.replace(/^(hey|hi|just a heads up|reminder:?|fyi:?)[,\s]+/i, "");
  t = t.replace(/\s+/g, " ").trim();
  if (t && !/[.?!…]$/.test(t)) t += ".";
  if (t.length > 240) t = t.slice(0, 237) + "…";
  return t;
}

// ── Digest preamble ───────────────────────────────────────────────────────
// A one-sentence frame between the greeting and the section list, written so
// the email reads like a text from Ru, not a system report.

export interface DigestBundle {
  firstName: string | null;
  eventCount: number;
  taskCount: number;
  reminderCount: number;
  pendingExtracted: number;
  firstEvent?: { title: string; timeLabel: string } | null;
  firstTask?: { title: string; timeLabel: string | null } | null;
}

export async function phraseDigestPreamble(bundle: DigestBundle): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  const fallback = digestPreambleFallback(bundle);
  if (!apiKey) return fallback;

  const summary = [
    `${bundle.eventCount} calendar events`,
    `${bundle.taskCount} tasks`,
    `${bundle.reminderCount} reminders`,
    bundle.pendingExtracted > 0 ? `${bundle.pendingExtracted} items in inbox` : null,
    bundle.firstEvent ? `first event: ${bundle.firstEvent.title} at ${bundle.firstEvent.timeLabel}` : null,
    bundle.firstTask ? `first task: ${bundle.firstTask.title}${bundle.firstTask.timeLabel ? ` due ${bundle.firstTask.timeLabel}` : ""}` : null,
  ]
    .filter(Boolean)
    .join("; ");

  const userMsg = [
    `You're writing the second line of a morning briefing email. The first line is a simple greeting (e.g. "good morning, ${bundle.firstName ?? "there"}.").`,
    "",
    `Today's shape: ${summary}.`,
    "",
    "Write ONE sentence that frames the day — quiet, busy, anchored around a specific thing. Like a text from a thoughtful friend who already glanced at your calendar. Reference a concrete thing if there is one. Don't list counts; the user sees the sections below. No emojis, no exclamation points. 15-25 words.",
  ].join("\n");

  try {
    const res = await fetch(OPENAI_CHAT_ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0.6,
        max_tokens: 100,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userMsg },
        ],
      }),
    });
    if (!res.ok) return fallback;
    const parsed = (await res.json()) as OpenAIChatResponse;
    const content = parsed.choices?.[0]?.message?.content?.trim();
    if (!content) return fallback;
    return sanitize(content);
  } catch {
    return fallback;
  }
}

function digestPreambleFallback(b: DigestBundle): string {
  const total = b.eventCount + b.taskCount + b.reminderCount;
  if (total === 0 && b.pendingExtracted === 0) return "quiet day ahead.";
  if (b.firstEvent) return `${b.firstEvent.title} at ${b.firstEvent.timeLabel} is the anchor.`;
  if (b.firstTask) return `${b.firstTask.title} is the one to land first.`;
  if (total <= 2) return "light day — just a couple of things to land.";
  return "a full day — pacing matters.";
}

export const __testing = { sanitize, templateFallback, toneAndSituationFor, digestPreambleFallback };
