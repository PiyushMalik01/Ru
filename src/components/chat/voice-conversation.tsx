"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { useChatStore, isTTSPlaying } from "@/lib/stores/chat-store";
import type { VoiceContext } from "@/lib/ai/engine/voice-persona";
import { useRuCompanion } from "@/lib/stores/ru-companion-store";
import { startFlux, type FluxHandle } from "@/lib/voice/flux";
import { startLocalVAD, type LocalVADHandle } from "@/lib/voice/local-vad";
import {
  createVoiceMachine,
  type VoicePhase,
} from "@/lib/voice/state-machine";
import { AnimatePresence, motion } from "framer-motion";
import { cn } from "@/lib/utils";
import {
  VoiceDebugPanel,
  type VoiceDebugSignals,
} from "./voice-debug-panel";

// Phrases the user can say to end the conversation. Match case-insensitively
// on the full final transcript, after light normalization.
const STOP_PHRASES = [
  "that's it",
  "thats it",
  "i'm done",
  "im done",
  "we're done",
  "were done",
  "stop talking",
  "stop ru",
  "bye ru",
  "goodbye ru",
];

function isStopPhrase(text: string): boolean {
  const t = text.toLowerCase().replace(/[.,!?]/g, "").trim();
  if (STOP_PHRASES.some((p) => t === p || t.endsWith(" " + p))) return true;
  if (t === "stop" || t === "done" || t === "exit") return true;
  return false;
}

/**
 * Full-duplex voice conversation, FSM-driven.
 *
 * Phase 2 rewrite: instead of inferring phase from a fan-out of chat-store
 * status + isTTSPlaying() + mic-buffer state (which produced "stuck
 * thinking" when any signal got desynced), we own a single explicit FSM
 * (`createVoiceMachine`) and feed it events from Flux, the chat store,
 * and the local VAD. Watchdog timers in the FSM guarantee we recover from
 * any wedged phase within at most ~15s.
 *
 * Dual-signal barge-in: we run local VAD on the SAME MediaStream Flux is
 * consuming (exposed via `FluxHandle.stream`). When TTS is playing, either
 * Flux's server-side `speech_started` OR the local VAD's onset can trigger
 * a barge-in. Local VAD is faster (no network) and harder to lose.
 */
export function VoiceConversation({ onClose }: { onClose: () => void }) {
  const status = useChatStore((s) => s.status);
  const thinking = useChatStore((s) => s.thinking);
  const sendText = useChatStore((s) => s.sendText);
  const abort = useChatStore((s) => s.abort);

  const setRuExpression = useRuCompanion((s) => s.setExpression);
  const ruClear = useRuCompanion((s) => s.clear);

  const [transcript, setTranscript] = useState("");
  const [phase, setPhase] = useState<VoicePhase>("warming");
  const [debugSignals, setDebugSignals] = useState<VoiceDebugSignals>({
    phase: "warming",
    lastEotConfidence: null,
    lastEagerEotConfidence: null,
    lastVoiceContext: null,
    latencyMarkers: {},
    sockets: { flux: false, aura: false },
  });

  const fluxRef = useRef<FluxHandle | null>(null);
  const vadRef = useRef<LocalVADHandle | null>(null);
  const machineRef = useRef<ReturnType<typeof createVoiceMachine> | null>(null);
  const finalBufRef = useRef("");
  const stoppingRef = useRef(false);

  // ---------------------------------------------------------------------
  // Mount: wire the FSM, boot Flux + local VAD. Empty deps — we never want
  // to remount because some upstream ref changed.
  // ---------------------------------------------------------------------
  useEffect(() => {
    const m = createVoiceMachine();
    machineRef.current = m;
    m.onPhaseChange((p) => {
      setPhase(p);
      setDebugSignals((s) => ({ ...s, phase: p }));
      if (p === "listening") setRuExpression("happy");
      else if (p === "thinking") setRuExpression("thinking");
      else if (p === "tts_speaking" || p === "tool_filling")
        setRuExpression("happy");
    });
    m.onWatchdog((stuck) => {
      console.warn("[voice] watchdog fired in phase", stuck);
    });

    void boot();

    return () => {
      stoppingRef.current = true;
      tearDownInputs();
      m.dispose();
      ruClear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------------------------------------------------------------------
  // Cross-wire chat-store → FSM. The chat store goes idle when the brain
  // has finished streaming AND audio has drained. If we're still in
  // tts_speaking and the audio is no longer playing, transition to
  // cooldown. If we're stuck in thinking and the stream errored
  // (status === "idle" without ever firing `first_audio`), push the
  // machine forward so we don't watchdog out.
  // ---------------------------------------------------------------------
  useEffect(() => {
    const m = machineRef.current;
    if (!m) return;
    const cur = m.current();
    if (status === "idle" && cur === "thinking") {
      // Brain produced no audio — recover by skipping straight to cooldown
      // (which then auto-advances to listening).
      m.send({ type: "audio_done" });
    }
  }, [status]);

  // While `thinking === "speaking"` we know the LLM has begun emitting
  // text destined for TTS. The audio-player's `playing` flag goes true on
  // first frame — when both line up, fire `first_audio`.
  useEffect(() => {
    const m = machineRef.current;
    if (!m) return;
    if (thinking !== "speaking") return;
    if (m.current() !== "thinking" && m.current() !== "tool_filling") return;
    if (isTTSPlaying()) m.send({ type: "first_audio" });
  }, [thinking]);

  // Tool-call lifecycle: thinking === "tooling" → tool_filling phase.
  useEffect(() => {
    const m = machineRef.current;
    if (!m) return;
    if (thinking === "tooling" && m.current() === "thinking") {
      m.send({ type: "tool_call_detected" });
    } else if (thinking !== "tooling" && m.current() === "tool_filling") {
      m.send({ type: "tool_call_done" });
    }
  }, [thinking]);

  // Poll TTS playback while in tts_speaking — fire `first_audio` when
  // audio actually starts (in case the `thinking` watcher above missed
  // the race), and `audio_done` when both playback and stream are done.
  useEffect(() => {
    const m = machineRef.current;
    if (!m) return;
    if (m.current() !== "tts_speaking" && m.current() !== "thinking" && m.current() !== "tool_filling") return;
    let alive = true;
    const id = setInterval(() => {
      if (!alive) return;
      const cur = m.current();
      if (
        (cur === "thinking" || cur === "tool_filling") &&
        isTTSPlaying()
      ) {
        m.send({ type: "first_audio" });
        return;
      }
      if (
        cur === "tts_speaking" &&
        !isTTSPlaying() &&
        useChatStore.getState().status === "idle"
      ) {
        m.send({ type: "audio_done" });
      }
    }, 80);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [phase]);

  // ---------------------------------------------------------------------
  // Reopen the mic when we land in `listening` (after cooldown).
  // ---------------------------------------------------------------------
  useEffect(() => {
    if (phase !== "listening") return;
    if (stoppingRef.current) return;
    if (fluxRef.current) return;
    void boot();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  async function boot() {
    const m = machineRef.current;
    if (!m) return;
    if (stoppingRef.current) return;
    setTranscript("");
    finalBufRef.current = "";
    try {
      const flux = await startFlux({
        onEvent: (e) => {
          const mac = machineRef.current;
          if (!mac) return;
          if (stoppingRef.current) return;
          switch (e.type) {
            case "ready":
              mac.send({ type: "ready" });
              setDebugSignals((s) => ({
                ...s,
                sockets: { ...s.sockets, flux: true },
              }));
              // Start local VAD on the same captured stream — dual-signal
              // barge-in. The handle owns its own AudioContext so it's
              // safe to start/stop independently of Flux's processor.
              if (fluxRef.current) {
                vadRef.current = startLocalVAD(
                  fluxRef.current.stream,
                  () => onBargeIn(mac),
                );
              }
              return;
            case "interim":
              setTranscript((finalBufRef.current + " " + e.text).trim());
              return;
            case "final":
              // Flux's transcript is cumulative per turn — REPLACE,
              // don't append.
              finalBufRef.current = e.text.trim();
              setTranscript(finalBufRef.current);
              return;
            case "eot":
              setDebugSignals((s) => ({
                ...s,
                lastEotConfidence: e.confidence,
              }));
              if (e.confidence >= 0.7) void commit();
              return;
            case "eager_eot":
              setDebugSignals((s) => ({
                ...s,
                lastEagerEotConfidence: e.confidence,
              }));
              // Hand the signal to the FSM. The FSM treats it as a no-op
              // phase-wise, but Phase 5 will use it to dispatch a
              // speculative LLM call.
              mac.send({
                type: "eager_eot_detected",
                text: e.text,
                confidence: e.confidence,
              });
              return;
            case "speech_started":
              onBargeIn(mac);
              return;
            case "error":
              console.error("flux error", e.message);
              mac.send({ type: "fatal", reason: e.message });
              return;
          }
        },
      });
      fluxRef.current = flux;
    } catch (err) {
      console.error("voice boot failed", err);
      machineRef.current?.send({ type: "fatal", reason: String(err) });
    }
  }

  async function commit() {
    const text = finalBufRef.current.trim();
    finalBufRef.current = "";
    setTranscript("");
    if (!text) return;
    if (isStopPhrase(text)) {
      handleClose();
      return;
    }
    // Snapshot the last ~10s of mic PCM BEFORE tearing down Flux — the
    // ring buffer lives on the FluxHandle and disappears with stop().
    const pcm = fluxRef.current?.snapshotPCM();
    // Tear down the mic before sending — we don't want to listen to Ru
    // through her own playback path. The FSM will reopen the mic when we
    // land back in `listening` after cooldown.
    tearDownInputs();
    machineRef.current?.send({ type: "commit", text });

    // Paralinguistic side-channel. Fire-and-forget extraction: if the
    // network blips or the route errors we send chat normally without
    // voiceContext (fail-open — the LLM still has the words). When it
    // succeeds, voiceContext flows into /api/chat as a system prompt
    // block and pace_wpm mirrors back into Aura's speed.
    let voiceContext: VoiceContext | null = null;
    if (pcm && pcm.length > 0) {
      voiceContext = await fetchFeatures(pcm, text).catch(() => null);
    }
    if (voiceContext) {
      setDebugSignals((s) => ({
        ...s,
        lastVoiceContext: voiceContext as unknown as Record<string, unknown>,
      }));
    }
    void sendText(text, { voiceContext });
  }

  async function fetchFeatures(
    pcm: Float32Array,
    transcript: string,
  ): Promise<VoiceContext | null> {
    // Float32 [-1, 1] → Int16 little-endian → base64. Matches the format
    // /api/voice/features expects (16kHz mono linear16) and the format
    // Flux's ring buffer already stores upstream of the Int16→Float32
    // conversion in snapshotPCM().
    const int16 = new Int16Array(pcm.length);
    for (let i = 0; i < pcm.length; i++) {
      const s = Math.max(-1, Math.min(1, pcm[i]));
      int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    const bytes = new Uint8Array(int16.buffer);
    // btoa requires a binary string; build it in chunks to avoid call-stack
    // limits on long PCM (up to 320KB).
    let bin = "";
    const CHUNK = 0x8000;
    for (let i = 0; i < bytes.length; i += CHUNK) {
      bin += String.fromCharCode(
        ...bytes.subarray(i, Math.min(i + CHUNK, bytes.length)),
      );
    }
    const audioBase64 = btoa(bin);
    const res = await fetch("/api/voice/features", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ audioBase64, transcript }),
    });
    if (!res.ok) return null;
    return (await res.json()) as VoiceContext;
  }

  function onBargeIn(m: ReturnType<typeof createVoiceMachine>) {
    const cur = m.current();
    if (cur === "tts_speaking" || cur === "tool_filling") {
      abort();
      m.send({ type: "barge_in" });
    }
  }

  function tearDownInputs() {
    fluxRef.current?.stop();
    fluxRef.current = null;
    vadRef.current?.stop();
    vadRef.current = null;
    setDebugSignals((s) => ({
      ...s,
      sockets: { ...s.sockets, flux: false },
    }));
  }

  function handleClose() {
    stoppingRef.current = true;
    tearDownInputs();
    abort();
    ruClear();
    machineRef.current?.send({ type: "close" });
    onClose();
  }

  const statusLabel: Record<VoicePhase, string> = {
    warming: "Warming up",
    listening: "Listening",
    thinking: "Thinking",
    tts_speaking: "Speaking",
    tool_filling: "Speaking",
    cooldown: "…",
    reconnecting: "Reconnecting",
    closing: "Closing",
    error: "Error",
  };

  const isSpeaking = phase === "tts_speaking" || phase === "tool_filling";

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 px-4 pb-4">
      <div className="mx-auto flex max-w-3xl flex-col items-center gap-2">
        {/* Live transcript while user is talking. */}
        <AnimatePresence>
          {transcript && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.18 }}
              className="pointer-events-none max-w-[44ch] rounded-2xl border border-border bg-card/95 px-4 py-2 text-center text-[13px] italic leading-snug text-foreground shadow-md backdrop-blur-sm"
              style={{ fontFamily: "var(--font-fraunces), Georgia, serif" }}
            >
              {transcript}
            </motion.div>
          )}
        </AnimatePresence>

        <div className="pointer-events-auto flex items-center gap-3 rounded-full border border-border bg-elevated/95 px-4 py-2.5 shadow-2xl backdrop-blur-sm">
          <div className="flex items-center gap-2 pl-1 pr-1">
            <PhaseDot phase={phase} />
            <span className="min-w-[80px] font-mono text-[11px] uppercase tracking-[0.14em] text-foreground">
              {statusLabel[phase]}
            </span>
          </div>

          <button
            type="button"
            onClick={() =>
              machineRef.current && onBargeIn(machineRef.current)
            }
            disabled={!isSpeaking}
            className={cn(
              "rounded-full px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.14em] transition-all",
              isSpeaking
                ? "bg-secondary text-foreground hover:bg-secondary/80"
                : "cursor-not-allowed text-muted-foreground/40",
            )}
            aria-label="Interrupt Ru"
          >
            Interrupt
          </button>

          <button
            type="button"
            onClick={handleClose}
            aria-label="End conversation"
            className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        <p className="pointer-events-auto font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          Say &ldquo;that&rsquo;s it&rdquo; to end &middot; just start talking
          to interrupt
        </p>
      </div>
      <VoiceDebugPanel signals={debugSignals} />
    </div>
  );
}

function PhaseDot({ phase }: { phase: VoicePhase }) {
  const color =
    phase === "listening"
      ? "var(--entity-routine)"
      : phase === "tts_speaking"
        ? "var(--entity-task)"
        : phase === "tool_filling"
          ? "var(--entity-task)"
          : phase === "thinking"
            ? "var(--muted-foreground)"
            : phase === "warming"
              ? "var(--muted-foreground)"
              : phase === "reconnecting"
                ? "var(--amber, #b45309)"
                : "var(--muted-foreground)";
  const pulse =
    phase === "listening" ||
    phase === "thinking" ||
    phase === "warming" ||
    phase === "reconnecting";
  return (
    <span
      className={cn(
        "inline-block h-2 w-2 rounded-full",
        pulse && "animate-pulse",
      )}
      style={{ backgroundColor: color }}
      aria-hidden
    />
  );
}
