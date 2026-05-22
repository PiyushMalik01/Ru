// ---------------------------------------------------------------------------
// Voice FSM
// ---------------------------------------------------------------------------
// Explicit phases for the conversational voice loop, with per-phase watchdogs.
// The state machine never owns I/O — it only narrates the loop's progress so
// the orchestrator (voice-conversation.tsx) and the indicator can react in a
// single place instead of inferring phase from chat-store status + isTTSPlaying
// + mic-buffer health. That inference is what produced "stuck thinking forever"
// in Phase 1.
//
// `eager_eot_detected` / `eager_eot_cancelled` are deliberate no-ops at the
// FSM level — they exist so the orchestrator can hand the signal off for
// future speculative LLM dispatch (Phase 5) without inventing a separate
// event channel.
// ---------------------------------------------------------------------------

export type VoicePhase =
  | "warming"
  | "listening"
  | "thinking"
  | "tts_speaking"
  | "tool_filling"
  | "cooldown"
  | "reconnecting"
  | "closing"
  | "error";

export type VoiceEvent =
  | { type: "ready" }
  | { type: "commit"; text: string }
  | { type: "first_audio" }
  | { type: "audio_done" }
  | { type: "tool_call_detected" }
  | { type: "tool_call_done" }
  | { type: "barge_in" }
  | { type: "ws_dropped" }
  | { type: "ws_recovered" }
  | { type: "close" }
  | { type: "fatal"; reason: string }
  // Eager EOT signals — informational only. The FSM does not change phase
  // on these; the orchestrator uses them to (a) show the speculative
  // transcript in the UI and (b) — in Phase 5 — kick off a speculative
  // LLM call. `eager_eot_cancelled` fires when the user resumes talking
  // after an eager EOT (Flux's TurnResumed event).
  | { type: "eager_eot_detected"; text: string; confidence: number }
  | { type: "eager_eot_cancelled" };

export interface VoiceMachine {
  send(event: VoiceEvent): void;
  current(): VoicePhase;
  onPhaseChange(cb: (phase: VoicePhase, prev: VoicePhase) => void): void;
  onWatchdog(cb: (stuckPhase: VoicePhase) => void): void;
  dispose(): void;
}

const MAX_DWELL_MS: Partial<Record<VoicePhase, number>> = {
  warming: 5_000,
  thinking: 15_000,
  tts_speaking: 60_000,
  tool_filling: 5_000,
  cooldown: 2_000,
  reconnecting: 8_000,
  closing: 4_000,
  // listening: no watchdog — user may pause indefinitely
};

const COOLDOWN_TO_LISTENING_MS = 500;

export function createVoiceMachine(): VoiceMachine {
  let phase: VoicePhase = "warming";
  let timer: ReturnType<typeof setTimeout> | null = null;
  let cooldownTimer: ReturnType<typeof setTimeout> | null = null;
  const phaseListeners: Array<(p: VoicePhase, prev: VoicePhase) => void> = [];
  const watchdogListeners: Array<(p: VoicePhase) => void> = [];

  const clearTimers = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    if (cooldownTimer) {
      clearTimeout(cooldownTimer);
      cooldownTimer = null;
    }
  };

  const setPhase = (next: VoicePhase) => {
    if (next === phase) return;
    const prev = phase;
    phase = next;
    clearTimers();
    armWatchdog();
    if (phase === "cooldown") {
      cooldownTimer = setTimeout(() => {
        if (phase === "cooldown") setPhase("listening");
      }, COOLDOWN_TO_LISTENING_MS);
    }
    for (const l of phaseListeners) l(phase, prev);
  };

  const armWatchdog = () => {
    const max = MAX_DWELL_MS[phase];
    if (!max) return;
    timer = setTimeout(() => {
      for (const l of watchdogListeners) l(phase);
      // Recovery policy: phase-specific
      switch (phase) {
        case "warming":
        case "reconnecting":
          setPhase("error");
          break;
        case "thinking":
        case "tool_filling":
        case "tts_speaking":
        case "cooldown":
          setPhase("listening");
          break;
        case "closing":
          setPhase("error");
          break;
      }
    }, max);
  };

  armWatchdog();

  return {
    send(e) {
      switch (e.type) {
        case "ready":
          if (phase === "warming" || phase === "reconnecting")
            setPhase("listening");
          break;
        case "commit":
          if (phase === "listening") setPhase("thinking");
          break;
        case "tool_call_detected":
          if (phase === "thinking") setPhase("tool_filling");
          break;
        case "tool_call_done":
          if (phase === "tool_filling") setPhase("thinking");
          break;
        case "first_audio":
          if (phase === "thinking" || phase === "tool_filling")
            setPhase("tts_speaking");
          break;
        case "audio_done":
          if (phase === "tts_speaking") setPhase("cooldown");
          break;
        case "barge_in":
          if (phase === "tts_speaking" || phase === "tool_filling")
            setPhase("listening");
          break;
        case "ws_dropped":
          if (phase !== "closing" && phase !== "error")
            setPhase("reconnecting");
          break;
        case "ws_recovered":
          if (phase === "reconnecting") setPhase("listening");
          break;
        case "close":
          if (phase !== "error") setPhase("closing");
          break;
        case "fatal":
          setPhase("error");
          break;
        case "eager_eot_detected":
        case "eager_eot_cancelled":
          // No phase change — informational only. See module header.
          break;
      }
    },
    current() {
      return phase;
    },
    onPhaseChange(cb) {
      phaseListeners.push(cb);
    },
    onWatchdog(cb) {
      watchdogListeners.push(cb);
    },
    dispose() {
      clearTimers();
      phaseListeners.length = 0;
      watchdogListeners.length = 0;
    },
  };
}
