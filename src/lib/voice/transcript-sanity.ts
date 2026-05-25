"use client";

/**
 * Lightweight, client-side heuristic that flags transcripts that are
 * probably misfires of the mic / background noise rather than real
 * intent. Cheap (no network, sub-ms). The voice pipeline gates the
 * submit on this: if scattered, surface a tick/cross toast instead
 * of firing the LLM and TTS on noise.
 *
 * Conservative on purpose — false positives (asking the user to
 * confirm a legitimate sentence) are mildly annoying, but false
 * negatives (sending garbage to the LLM, which then replies to
 * garbage and the user hears nonsense) are much worse.
 */

export type SanityReason =
  | "empty"
  | "too-short"
  | "single-syllable"
  | "repetition"
  | "low-content";

export interface SanityResult {
  ok: boolean;
  reason?: SanityReason;
}

/**
 * Words that are legitimate as a one-token utterance. Anything else
 * that lands as a single short token is almost certainly STT noise.
 */
const STANDALONE_SHORT: ReadonlySet<string> = new Set([
  "yes", "no", "nope", "yeah", "yep", "yup", "ok", "okay", "sure", "stop",
  "done", "hi", "hey", "wait", "go", "now", "next", "back", "skip", "more",
  "less", "bye",
]);

export function isLikelyScattered(input: string): SanityResult {
  const t = input.trim();
  if (!t) return { ok: false, reason: "empty" };

  // Strip surrounding punctuation but preserve internal apostrophes.
  const words = t
    .split(/\s+/)
    .map((w) => w.replace(/^[^\w']+|[^\w']+$/g, ""))
    .filter(Boolean);

  if (words.length === 0) return { ok: false, reason: "empty" };

  // Single token: either a known short word or garbage.
  if (words.length === 1) {
    const w = words[0].toLowerCase();
    if (STANDALONE_SHORT.has(w)) return { ok: true };
    if (w.length < 4) return { ok: false, reason: "single-syllable" };
    // Long single token can be a name or place. Trust it.
    return { ok: true };
  }

  // Two-token: needs average word length ≥ 3.
  if (words.length === 2) {
    const totalLen = words.join("").length;
    if (totalLen / 2 < 3) return { ok: false, reason: "too-short" };
  }

  // Repetition: same word three times in a row → "uh uh uh", "the the the"
  for (let i = 0; i < words.length - 2; i++) {
    const a = words[i].toLowerCase();
    if (a === words[i + 1].toLowerCase() && a === words[i + 2].toLowerCase()) {
      return { ok: false, reason: "repetition" };
    }
  }

  // Low content: > 80% of words are < 3 characters AND total token count
  // is small. Catches "i a o u e a i" type STT noise. Skip the rule
  // when total tokens are large enough that the user is clearly speaking
  // a real sentence with many connectives.
  if (words.length <= 6) {
    const tiny = words.filter((w) => w.length < 3).length;
    if (tiny / words.length > 0.8) {
      return { ok: false, reason: "low-content" };
    }
  }

  return { ok: true };
}
