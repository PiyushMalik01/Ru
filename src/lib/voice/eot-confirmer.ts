"use client";

// ---------------------------------------------------------------------------
// Smart EOT confirmer
// ---------------------------------------------------------------------------
// Composite gate that protects against false end-of-turn detection. Flux's
// semantic EOT is good but not perfect — there are scenarios where it fires
// while the user is still mid-thought (a long pause that Flux interprets as
// semantic completion). If we committed straight off Flux's signal, Ru would
// start replying while the user is still talking.
//
// We require THREE signals to agree before we fire `confirmed`:
//
//   1. Flux EndOfTurn message arrived with confidence ≥ MIN_CONFIDENCE
//   2. The local VAD reports the mic has been silent for ≥ REQUIRED_SILENCE_MS
//      (cheap, in-browser, no network round-trip)
//   3. No `turn_resumed` signal has arrived in the last TURN_RESUMED_LOCKOUT_MS
//      (i.e., Flux hasn't taken back an earlier eager EOT recently)
//
// Plus two escape hatches:
//
//   • HIGH_CONFIDENCE_FAST_PATH (0.85+): commit immediately. Flux is very sure,
//     the user almost certainly is done — don't make them wait for VAD
//     silence to accumulate.
//   • FLUX_TRUST_FALLBACK_MS (1500ms): if Flux says EOT and that much time
//     passes without the other signals agreeing, fire anyway. Means the local
//     VAD isn't seeing energy (it agrees the user is silent) but never
//     crossed the explicit silence threshold. Likely a low-mic-volume edge
//     case. Trust Flux's semantic call.
//
// Reset semantics: `turn_resumed` clears any pending EOT immediately — the
// user came back, the whole "they're done" hypothesis is invalidated. The
// next Flux EOT starts the clock fresh.
// ---------------------------------------------------------------------------

export type EOTSignal =
  | { type: "flux_eot"; confidence: number; text: string }
  | { type: "turn_resumed" }
  | { type: "vad_silence_ms"; ms: number }
  | { type: "vad_speech" };

export interface ConfirmedTurn {
  text: string;
  confidence: number;
  /**
   * Latency from the Flux EOT signal to the confirmation firing.
   * Useful for debug panel + telemetry. 0 if we fast-pathed.
   */
  confirmationLatencyMs: number;
  /**
   * Which rule fired. "fast_path" = high-confidence shortcut.
   * "composite" = all three signals agreed. "fallback" = Flux trust
   * fallback fired after the timeout.
   */
  reason: "fast_path" | "composite" | "fallback";
}

export interface EOTConfirmerOptions {
  /** Override the clock for tests. Defaults to Date.now. */
  now?: () => number;
  /** Polling interval for the watch timer. Defaults to 50ms. */
  pollMs?: number;
}

export interface EOTConfirmer {
  push(signal: EOTSignal): void;
  /** Subscribe to confirmation events. Returns an unsubscribe fn. */
  onConfirmed(cb: (turn: ConfirmedTurn) => void): () => void;
  /** Subscribe to turn_resumed (cancel speculative work). */
  onTurnResumed(cb: () => void): () => void;
  /** Drop any pending EOT — call when starting a new turn. */
  reset(): void;
  /** Tear down the watch timer. */
  dispose(): void;
}

// Tuning rationale (post-user-report): the confirmer was firing on natural
// mid-sentence pauses. 200ms of silence is shorter than a breath; 0.85 fast
// path commits on grammatically-complete-sounding fragments before the user
// has actually finished. New values give human pauses room to land:
//   • 700ms silence ≈ end-of-thought, not end-of-breath.
//   • 0.95 fast path ≈ "Flux is unmistakably sure" only.
//   • 2500ms fallback ≈ generous safety net when local VAD can't agree
//     (background noise, low mic gain) — was clipping at 1.5s before the
//     new silence threshold could be met.
export const HIGH_CONFIDENCE_FAST_PATH = 0.95;
export const MIN_CONFIDENCE = 0.55;
export const REQUIRED_SILENCE_MS = 700;
export const TURN_RESUMED_LOCKOUT_MS = 500;
export const FLUX_TRUST_FALLBACK_MS = 2500;

interface Pending {
  confidence: number;
  text: string;
  /** Wall-clock ms at which the Flux EOT arrived. */
  at: number;
}

export function createEOTConfirmer(opts: EOTConfirmerOptions = {}): EOTConfirmer {
  const now = opts.now ?? (() => Date.now());
  const pollMs = opts.pollMs ?? 50;

  let pending: Pending | null = null;
  let lastTurnResumedAt = -Infinity;
  let vadSilenceMs = 0;
  let confirmedCbs: Array<(turn: ConfirmedTurn) => void> = [];
  let turnResumedCbs: Array<() => void> = [];
  let watchTimer: ReturnType<typeof setInterval> | null = null;

  const armWatch = () => {
    if (watchTimer) return;
    watchTimer = setInterval(tryConfirm, pollMs);
  };
  const stopWatch = () => {
    if (watchTimer) {
      clearInterval(watchTimer);
      watchTimer = null;
    }
  };

  const fire = (reason: ConfirmedTurn["reason"]) => {
    if (!pending) return;
    const turn: ConfirmedTurn = {
      text: pending.text,
      confidence: pending.confidence,
      confirmationLatencyMs: now() - pending.at,
      reason,
    };
    pending = null;
    stopWatch();
    for (const cb of confirmedCbs) cb(turn);
  };

  const tryConfirm = () => {
    if (!pending) {
      stopWatch();
      return;
    }
    const elapsed = now() - pending.at;
    const sinceResumed = now() - lastTurnResumedAt;

    // Fast path — high confidence, don't wait for anything else.
    if (pending.confidence >= HIGH_CONFIDENCE_FAST_PATH) {
      fire("fast_path");
      return;
    }

    // Composite gate — the normal happy path.
    if (
      pending.confidence >= MIN_CONFIDENCE &&
      vadSilenceMs >= REQUIRED_SILENCE_MS &&
      sinceResumed >= TURN_RESUMED_LOCKOUT_MS
    ) {
      fire("composite");
      return;
    }

    // Trust fallback — Flux said EOT but the signals never aligned. After
    // FLUX_TRUST_FALLBACK_MS, defer to Flux.
    if (elapsed >= FLUX_TRUST_FALLBACK_MS) {
      fire("fallback");
      return;
    }
  };

  return {
    push(signal) {
      switch (signal.type) {
        case "flux_eot":
          pending = { confidence: signal.confidence, text: signal.text, at: now() };
          tryConfirm();
          armWatch();
          return;
        case "turn_resumed":
          lastTurnResumedAt = now();
          if (pending) {
            pending = null;
            stopWatch();
            for (const cb of turnResumedCbs) cb();
          }
          return;
        case "vad_silence_ms":
          vadSilenceMs = signal.ms;
          tryConfirm();
          return;
        case "vad_speech":
          vadSilenceMs = 0;
          return;
      }
    },
    onConfirmed(cb) {
      confirmedCbs.push(cb);
      return () => {
        confirmedCbs = confirmedCbs.filter((x) => x !== cb);
      };
    },
    onTurnResumed(cb) {
      turnResumedCbs.push(cb);
      return () => {
        turnResumedCbs = turnResumedCbs.filter((x) => x !== cb);
      };
    },
    reset() {
      pending = null;
      lastTurnResumedAt = -Infinity;
      vadSilenceMs = 0;
      stopWatch();
    },
    dispose() {
      stopWatch();
      confirmedCbs = [];
      turnResumedCbs = [];
    },
  };
}
