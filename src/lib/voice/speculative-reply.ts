"use client";

// ---------------------------------------------------------------------------
// Speculative voice reply
// ---------------------------------------------------------------------------
// When Flux fires an eager_eot signal (≥ 0.45 confidence the user has just
// stopped talking), we dispatch the LLM call IMMEDIATELY — without waiting
// for the smart EOT confirmer to fully verify. The LLM is already streaming
// by the time the confirmer fires; we save 300-600ms of dead air.
//
// The catch: speculatively-dispatched audio CANNOT play until the confirmer
// agrees. This module owns:
//   1. The fetch to /api/chat with speculative=true (skips DB writes)
//   2. The prosody parser that turns text deltas into SSML chunks
//   3. A "TTS gate" that buffers SSML chunks while pending, and on
//      `commit()` drains them to the shared TTS handle
//   4. The follow-up call to /api/chat/persist that atomically writes
//      both messages on commit
//
// On `cancel()` (Flux fires turn_resumed): aborts the fetch, discards the
// buffer, no DB writes happen.
//
// Caveat (documented): tool calls inside a speculative reply DO execute on
// the server, and their side effects are NOT rolled back on cancel. With
// the smart EOT confirmer making turn_resumed-after-tool-call rare, this
// is acceptable for V1.
// ---------------------------------------------------------------------------

import type { VoiceContext } from "@/lib/ai/engine/voice-persona";

export interface SpeculativeController {
  /**
   * Confirm — wait for the LLM to finish (with timeout), then drain the
   * TTS buffer and call /api/chat/persist to write both messages.
   *
   * If the confirmed text diverges substantially from the speculative
   * text, returns `usedSpeculative: false`; the caller should fall
   * through to a regular non-speculative sendText.
   */
  commit(confirmedText: string): Promise<CommitResult>;
  /** Abort — discard buffered TTS, abort fetch, no DB writes happen. */
  cancel(): void;
  /** The text the speculative LLM call was started with. */
  speculativeText: string;
  /** True once the speculative LLM finished streaming. */
  done: () => boolean;
}

export interface CommitResult {
  usedSpeculative: boolean;
  assistantText: string;
  userMessageId: string | null;
  assistantMessageId: string | null;
}

export interface SpeculativeTTSHandle {
  speak: (text: string, opts?: { format?: "ssml" | "plain" }) => void;
  flush: () => void;
}

export interface StartSpeculativeArgs {
  text: string;
  chatId: string;
  voiceContext: VoiceContext | null;
  pageContext?: { hint: string; workspaceId?: string } | null;
  /**
   * The shared TTS handle. We don't speak through it until commit; instead
   * we buffer SSML chunks and replay them on release.
   */
  tts: SpeculativeTTSHandle;
}

/**
 * Decide whether the confirmed text is "close enough" to the speculative
 * text to reuse the response. Exported for tests.
 */
export function textsAreCloseEnough(speculative: string, confirmed: string): boolean {
  const a = speculative.trim().toLowerCase();
  const b = confirmed.trim().toLowerCase();
  // Empty strings never match — there's nothing meaningful to align.
  if (!a || !b) return false;
  if (a === b) return true;
  if (b.startsWith(a) || a.startsWith(b)) return true;
  // Word-token overlap fallback. If 80%+ of the speculative words appear
  // in confirmed (in any order), call it a match.
  const aw = a.split(/\s+/).filter(Boolean);
  const bw = new Set(b.split(/\s+/).filter(Boolean));
  if (aw.length === 0) return false;
  let hits = 0;
  for (const w of aw) if (bw.has(w)) hits++;
  return hits / aw.length >= 0.8;
}

interface BufferedSSML {
  ssml: string;
  format: "ssml" | "plain";
}

export function startSpeculativeReply(args: StartSpeculativeArgs): {
  controller: SpeculativeController;
  streamingDone: Promise<void>;
} {
  const abortController = new AbortController();
  let assistantText = "";
  let finished = false;
  let cancelled = false;
  let released = false;
  const ssmlBuffer: BufferedSSML[] = [];
  // Char count of speakable text since last flush — used to decide when to
  // send a Flush message to the TTS sink. Matches the heuristic in
  // chat-store.sendText so the cadence feels identical once released.
  let charsSinceFlush = 0;
  const flushBoundary = /[.!?\n]/;

  const speakOrBuffer = (ssml: string, format: "ssml" | "plain") => {
    if (cancelled) return;
    if (!released) {
      ssmlBuffer.push({ ssml, format });
      return;
    }
    args.tts.speak(ssml, { format });
  };
  const flushOrBuffer = () => {
    if (cancelled) return;
    if (!released) {
      // Mark with an empty entry whose presence triggers a flush after the
      // preceding chunks land on the wire. Simpler: just queue a synthetic
      // "flush marker" — we model it by pushing a chunk with ssml="" and
      // format="plain"; the drain loop emits a flush when it sees one.
      ssmlBuffer.push({ ssml: "", format: "plain" });
      return;
    }
    args.tts.flush();
  };

  // Lazy-load the prosody parser so the speculative codepath only pulls in
  // ~5KB on first eager_eot rather than on initial mount.
  let prosodyStreamPromise: Promise<
    import("@/lib/voice/prosody").ProsodyStream
  > | null = null;
  const getProsody = () => {
    if (!prosodyStreamPromise) {
      prosodyStreamPromise = import("@/lib/voice/prosody").then((m) =>
        m.createProsodyStream(),
      );
    }
    return prosodyStreamPromise;
  };

  const handleDelta = async (delta: string, force: boolean = false) => {
    const prosody = await getProsody();
    const ssmlChunks = delta ? prosody.push(delta) : force ? prosody.flush() : [];
    let hitPunct = false;
    for (const c of ssmlChunks) {
      if (!c.ssml.trim()) continue;
      speakOrBuffer(c.ssml, "ssml");
      const spokenLen = c.ssml.replace(/<[^>]+>/g, "").length;
      charsSinceFlush += spokenLen;
      if (c.sentenceComplete) hitPunct = true;
      if (flushBoundary.test(c.ssml)) hitPunct = true;
    }
    if (force || hitPunct || charsSinceFlush >= 180) {
      flushOrBuffer();
      charsSinceFlush = 0;
    }
  };

  const drainBuffer = () => {
    for (const entry of ssmlBuffer) {
      if (entry.ssml === "" && entry.format === "plain") {
        args.tts.flush();
        continue;
      }
      args.tts.speak(entry.ssml, { format: entry.format });
    }
    ssmlBuffer.length = 0;
    // Always end the drain with a flush so Aura starts speaking the catch-up
    // batch immediately rather than waiting for the next punctuation.
    args.tts.flush();
  };

  const fetchPromise = (async () => {
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          message: args.text,
          voice: true,
          speculative: true,
          chatId: args.chatId,
          pageContext: args.pageContext ?? undefined,
          voiceContext: args.voiceContext ?? undefined,
          mode: "send",
        }),
        signal: abortController.signal,
      });
      if (!res.ok || !res.body) {
        const errText = await res.text().catch(() => "");
        throw new Error(errText || `speculative /api/chat ${res.status}`);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          let event: { type: string; [k: string]: unknown };
          try {
            event = JSON.parse(line.slice(6));
          } catch {
            continue;
          }
          if (event.type === "text") {
            const delta = String(event.delta ?? "");
            assistantText += delta;
            if (!cancelled) await handleDelta(delta);
          } else if (event.type === "stream_end") {
            finished = true;
            if (!cancelled) await handleDelta("", true);
          } else if (event.type === "error") {
            throw new Error(String(event.message ?? "stream error"));
          }
          // tool_call / tool_result: ignored for now (cards from speculative
          // tool calls would require a re-render pass on commit — V2).
        }
      }
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
      // Best-effort swallow — the controller's commit() will return
      // usedSpeculative=false if assistantText is empty.
      console.error("speculative fetch failed", e);
    }
  })();

  const controller: SpeculativeController = {
    speculativeText: args.text,
    done: () => finished,
    cancel: () => {
      cancelled = true;
      ssmlBuffer.length = 0;
      try {
        abortController.abort();
      } catch {}
    },
    commit: async (confirmedText: string) => {
      const empty: CommitResult = {
        usedSpeculative: false,
        assistantText: "",
        userMessageId: null,
        assistantMessageId: null,
      };
      if (cancelled) return empty;
      if (!textsAreCloseEnough(args.text, confirmedText)) {
        cancelled = true;
        try {
          abortController.abort();
        } catch {}
        ssmlBuffer.length = 0;
        return empty;
      }

      // Wait for the speculative LLM to finish — soft cap at 5s so we don't
      // hang the voice loop if the LLM is wedged.
      const wait = new Promise<void>((resolve) => {
        if (finished) return resolve();
        const id = setInterval(() => {
          if (finished || cancelled) {
            clearInterval(id);
            resolve();
          }
        }, 25);
        setTimeout(() => {
          clearInterval(id);
          resolve();
        }, 5_000);
      });
      await Promise.race([fetchPromise, wait]);
      if (cancelled || !assistantText.trim()) return empty;

      // Release the gate — drain the buffered SSML and let any in-flight
      // text deltas flow straight through.
      released = true;
      drainBuffer();

      // Persist atomically.
      let userMessageId: string | null = null;
      let assistantMessageId: string | null = null;
      try {
        const persistRes = await fetch("/api/chat/persist", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            chatId: args.chatId,
            userMessage: confirmedText,
            assistantText,
            voice: true,
          }),
        });
        if (persistRes.ok) {
          const persisted = (await persistRes.json()) as {
            userMessageId: string;
            assistantMessageId: string;
          };
          userMessageId = persisted.userMessageId;
          assistantMessageId = persisted.assistantMessageId;
        }
      } catch (e) {
        console.error("speculative persist failed", e);
      }

      return {
        usedSpeculative: true,
        assistantText,
        userMessageId,
        assistantMessageId,
      };
    },
  };

  return { controller, streamingDone: fetchPromise };
}
