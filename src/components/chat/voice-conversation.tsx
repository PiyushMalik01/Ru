"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { useChatStore, isTTSPlaying } from "@/lib/stores/chat-store";
import { useRuCompanion } from "@/lib/stores/ru-companion-store";
import { startFlux, type FluxHandle } from "@/lib/voice/flux";
import { AnimatePresence, motion } from "framer-motion";
import { cn } from "@/lib/utils";

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

type Phase = "listening" | "thinking" | "speaking" | "ready";

/**
 * Full-duplex voice conversation. No big orb — the user explicitly asked Ru
 * (the companion character) to be the visual presence instead. We:
 *
 *   1. Start STT on mount with echo-cancelled mic
 *   2. Accumulate per-segment finals into a buffer
 *   3. Commit on UtteranceEnd (true silence) — NOT on every is_final, which
 *      fires on any 600ms pause and would chop the user's message in half
 *   4. While the response streams, watch TTS playback. Only re-open the mic
 *      after the chat is idle AND the audio buffer has been silent for 500ms
 *      continuously (one false reading isn't enough — there are gaps between
 *      synthesized chunks)
 *   5. If the user starts speaking while Ru is mid-reply, barge in — abort the
 *      stream so the user can take the floor
 *   6. Drive Ru's face/speech via the companion store so she IS the indicator
 */
export function VoiceConversation({ onClose }: { onClose: () => void }) {
  const status = useChatStore((s) => s.status);
  const thinking = useChatStore((s) => s.thinking);
  const sendText = useChatStore((s) => s.sendText);
  const abort = useChatStore((s) => s.abort);

  const setRuExpression = useRuCompanion((s) => s.setExpression);
  const ruClear = useRuCompanion((s) => s.clear);

  const [transcript, setTranscript] = useState("");
  const [phase, setPhase] = useState<Phase>("listening");

  const fluxRef = useRef<FluxHandle | null>(null);
  const finalBufRef = useRef<string>("");
  const stoppingRef = useRef(false);
  const restartTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // The restart-mic effect previously held silentSince in a closure local.
  // Whenever VoiceConversation re-rendered (which happens a lot — phase
  // changes, Ru store updates), startListening's useCallback ref changed,
  // so the effect cleanup tore down the interval and the silentSince
  // accumulator reset to null. It never reached 500ms — mic never reopened,
  // which read as "Ru is thinking forever after her reply".
  // Hoist into a ref so it survives effect re-runs.
  const silentSinceRef = useRef<number | null>(null);
  // Mirror the latest startListening into a ref so effects can call it
  // without listing it as a dep (and without using a stale closure).
  const startListeningRef = useRef<() => Promise<void>>(async () => undefined);

  const stopFlux = useCallback(() => {
    fluxRef.current?.stop();
    fluxRef.current = null;
  }, []);

  const commitUtterance = useCallback(() => {
    const text = finalBufRef.current.trim();
    finalBufRef.current = "";
    setTranscript("");
    if (!text) return;

    if (isStopPhrase(text)) {
      stoppingRef.current = true;
      stopFlux();
      onClose();
      return;
    }

    // Tear down STT before sending so we don't double-listen to Ru's reply.
    stopFlux();
    setPhase("thinking");
    void sendText(text);
  }, [onClose, sendText, stopFlux]);

  const startListening = useCallback(async () => {
    if (fluxRef.current || stoppingRef.current) return;
    setPhase("listening");
    setTranscript("");
    finalBufRef.current = "";
    try {
      fluxRef.current = await startFlux({
        onEvent: (e) => {
          switch (e.type) {
            case "ready":
              // Socket is open and accepting audio. Indicator already
              // in 'listening' phase from above.
              return;
            case "interim":
              setTranscript((finalBufRef.current + " " + e.text).trim());
              return;
            case "final":
              // Flux gives us the full turn transcript on EagerEndOfTurn and
              // EndOfTurn. We *replace* (not append) the final buffer because
              // Flux's transcript is cumulative for the whole turn — unlike
              // Nova-3 which fires partial per-segment finals.
              finalBufRef.current = e.text.trim();
              setTranscript(finalBufRef.current);
              return;
            case "eot":
              // Flux's EOT is the commit signal — confidence-gated. The Flux
              // client only emits this when end_of_turn_confidence >= the
              // server-side threshold, but we keep a client-side floor too
              // in case the server lowers its threshold via config.
              if (e.confidence >= 0.7) {
                commitUtterance();
              }
              return;
            case "speech_started":
              // User started talking. If Ru is still mid-reply, barge in.
              if (
                useChatStore.getState().status === "streaming" ||
                isTTSPlaying()
              ) {
                abort();
              }
              return;
            case "error":
              console.error("flux error", e.message);
              stopFlux();
              return;
          }
        },
      });
    } catch (e) {
      console.error("flux start failed", e);
    }
  }, [abort, commitUtterance, stopFlux]);

  // Keep the ref pointed at the freshest startListening every render so the
  // mount + restart effects can call through it without depending on the
  // function's identity.
  useEffect(() => {
    startListeningRef.current = startListening;
  });

  // Boot STT once on mount; tear everything down on unmount. Empty deps so
  // we never accidentally re-mount because some upstream ref changed.
  useEffect(() => {
    void startListeningRef.current();
    return () => {
      stoppingRef.current = true;
      stopFlux();
      if (restartTimerRef.current) clearInterval(restartTimerRef.current);
      ruClear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Phase ← chat state. Drives both the local indicator AND Ru's face.
  useEffect(() => {
    if (stoppingRef.current) return;
    let next: Phase;
    if (status === "streaming") {
      next = thinking === "speaking" ? "speaking" : "thinking";
    } else if (fluxRef.current) {
      next = "listening";
    } else {
      next = "ready";
    }
    setPhase(next);

    // Map phase → Ru face. "happy" while listening keeps her warm and open;
    // "thinking" while processing; "wink" briefly when she finishes speaking
    // (handled by the existing reactivity in ru-ghost).
    if (next === "listening") setRuExpression("happy");
    else if (next === "thinking") setRuExpression("thinking");
    else if (next === "speaking") setRuExpression("happy");
  }, [status, thinking, setRuExpression]);

  // After Ru finishes speaking: wait for the audio buffer to be silent for
  // 500ms CONTINUOUSLY, then re-open the mic. Single false readings happen
  // in the gaps between synthesized chunks and would re-open too early.
  //
  // CRITICAL: silentSince lives in a ref (not the closure) and the effect
  // only depends on `status`. If we put startListening in the deps, every
  // re-render would tear down the interval, reset silentSince, and the mic
  // would never reopen — which is exactly what "Ru is thinking forever
  // after the reply" looked like.
  useEffect(() => {
    if (stoppingRef.current) return;
    if (status !== "idle") return;
    if (fluxRef.current) return;

    silentSinceRef.current = null;
    restartTimerRef.current = setInterval(() => {
      const playing = isTTSPlaying();
      if (playing) {
        silentSinceRef.current = null;
        return;
      }
      if (silentSinceRef.current === null) {
        silentSinceRef.current = Date.now();
      }
      if (Date.now() - silentSinceRef.current >= 500) {
        if (restartTimerRef.current) {
          clearInterval(restartTimerRef.current);
          restartTimerRef.current = null;
        }
        silentSinceRef.current = null;
        void startListeningRef.current();
      }
    }, 80);

    return () => {
      if (restartTimerRef.current) {
        clearInterval(restartTimerRef.current);
        restartTimerRef.current = null;
      }
    };
  }, [status]);

  function interruptRu() {
    if (status === "streaming" || isTTSPlaying()) {
      abort();
    }
  }

  function handleClose() {
    stoppingRef.current = true;
    stopFlux();
    abort();
    ruClear();
    onClose();
  }

  const statusLabel =
    phase === "listening"
      ? "Listening"
      : phase === "thinking"
        ? "Thinking"
        : phase === "speaking"
          ? "Speaking"
          : "Ready";

  const isSpeaking = phase === "speaking" || isTTSPlaying();

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 px-4 pb-4">
      <div className="mx-auto flex max-w-3xl flex-col items-center gap-2">
        {/* Live transcript while user is talking. Single element so the text
            updates in place — no remount flicker on every interim partial. */}
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

        {/* Compact control row. No orb — Ru is the visual indicator now. */}
        <div className="pointer-events-auto flex items-center gap-3 rounded-full border border-border bg-elevated/95 px-4 py-2.5 shadow-2xl backdrop-blur-sm">
          {/* Live phase indicator: tiny dot + label */}
          <div className="flex items-center gap-2 pl-1 pr-1">
            <PhaseDot phase={phase} />
            <span className="min-w-[68px] font-mono text-[11px] uppercase tracking-[0.14em] text-foreground">
              {statusLabel}
            </span>
          </div>

          {/* Interrupt — only when Ru is speaking */}
          <button
            type="button"
            onClick={interruptRu}
            disabled={!isSpeaking}
            className={cn(
              "rounded-full px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.14em] transition-all",
              isSpeaking
                ? "bg-secondary text-foreground hover:bg-secondary/80"
                : "cursor-not-allowed text-muted-foreground/40"
            )}
            aria-label="Interrupt Ru"
          >
            Interrupt
          </button>

          {/* Close conversation */}
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
          Say &ldquo;that&rsquo;s it&rdquo; to end · just start talking to interrupt
        </p>
      </div>
    </div>
  );
}

/** Tiny phase dot — pulses while listening/thinking, solid when speaking. */
function PhaseDot({ phase }: { phase: Phase }) {
  const color =
    phase === "listening"
      ? "var(--entity-routine)"
      : phase === "speaking"
        ? "var(--entity-task)"
        : phase === "thinking"
          ? "var(--muted-foreground)"
          : "var(--muted-foreground)";
  return (
    <span
      className={cn(
        "inline-block h-2 w-2 rounded-full",
        (phase === "listening" || phase === "thinking") && "animate-pulse"
      )}
      style={{ backgroundColor: color }}
      aria-hidden
    />
  );
}
