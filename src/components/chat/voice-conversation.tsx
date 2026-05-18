"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { VoiceOrb, type OrbPhase } from "./voice-orb";
import { useChatStore, isTTSPlaying } from "@/lib/stores/chat-store";
import { startSTT, type STTHandle } from "@/lib/voice/stt";
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

/**
 * Anchored at the bottom of the screen (where the pill normally lives) so the
 * user can still see the streamed chat. Three big affordances:
 *   - the orb itself (tap to interrupt Ru mid-speech)
 *   - a left-side "Stop speaking" button when Ru is talking
 *   - an X close button to end the conversation entirely
 */
export function VoiceConversation({ onClose }: { onClose: () => void }) {
  const status = useChatStore((s) => s.status);
  const thinking = useChatStore((s) => s.thinking);
  const sendText = useChatStore((s) => s.sendText);
  const abort = useChatStore((s) => s.abort);

  const [transcript, setTranscript] = useState("");
  const [phase, setPhase] = useState<OrbPhase>("listening");

  const sttRef = useRef<STTHandle | null>(null);
  const finalBufRef = useRef<string>("");
  const stoppingRef = useRef(false);
  const ttsPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopSTT = useCallback(() => {
    sttRef.current?.stop();
    sttRef.current = null;
  }, []);

  const startListening = useCallback(async () => {
    if (sttRef.current || stoppingRef.current) return;
    setPhase("listening");
    setTranscript("");
    finalBufRef.current = "";
    try {
      sttRef.current = await startSTT({
        onInterim: (text) => {
          setTranscript((finalBufRef.current + " " + text).trim());
        },
        onFinal: (text) => {
          finalBufRef.current = (finalBufRef.current + " " + text).trim();
          setTranscript(finalBufRef.current);

          if (isStopPhrase(finalBufRef.current)) {
            stoppingRef.current = true;
            stopSTT();
            onClose();
            return;
          }

          const toSend = finalBufRef.current;
          finalBufRef.current = "";
          setTranscript("");
          stopSTT();
          setPhase("thinking");
          void sendText(toSend);
        },
        onError: (msg) => {
          console.error("stt error", msg);
          stopSTT();
        },
      });
    } catch (e) {
      console.error("stt start failed", e);
    }
  }, [onClose, sendText, stopSTT]);

  useEffect(() => {
    void startListening();
    return () => {
      stoppingRef.current = true;
      stopSTT();
      if (ttsPollRef.current) clearInterval(ttsPollRef.current);
    };
  }, [startListening, stopSTT]);

  // Drive orb phase from chat state
  useEffect(() => {
    if (stoppingRef.current) return;
    if (status === "streaming") {
      if (thinking === "speaking") setPhase("speaking");
      else if (thinking === "tooling") setPhase("thinking");
      else setPhase("thinking");
    } else if (sttRef.current) {
      setPhase("listening");
    } else {
      setPhase("ready");
    }
  }, [status, thinking]);

  // After Ru finishes speaking, wait for audio playback to drain then re-open the mic
  useEffect(() => {
    if (stoppingRef.current) return;
    if (status !== "idle") return;
    if (sttRef.current) return;

    ttsPollRef.current = setInterval(() => {
      if (!isTTSPlaying()) {
        if (ttsPollRef.current) {
          clearInterval(ttsPollRef.current);
          ttsPollRef.current = null;
        }
        void startListening();
      }
    }, 200);

    return () => {
      if (ttsPollRef.current) {
        clearInterval(ttsPollRef.current);
        ttsPollRef.current = null;
      }
    };
  }, [status, startListening]);

  function interruptRu() {
    // Tap the orb (or hit Stop speaking) while Ru is talking → cut her off
    // and re-open the mic so the user can take the floor.
    if (status === "streaming" || isTTSPlaying()) {
      abort();
    }
  }

  function handleClose() {
    // Closing the conversation also stops audio. The previous version left
    // Aura playing in the background — fixed.
    stoppingRef.current = true;
    stopSTT();
    abort();
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
      <div className="mx-auto flex max-w-3xl flex-col items-center">
        {/* Live transcript bubble — floats above the orb so the user can see
            what's being captured. Doesn't block the chat above it. */}
        {(transcript || isSpeaking) && (
          <div
            className={cn(
              "pointer-events-auto mb-3 max-w-[42ch] rounded-full border border-border bg-card/90 px-4 py-1.5 text-center text-[12px] backdrop-blur-sm",
              transcript ? "text-foreground italic" : "text-muted-foreground"
            )}
          >
            {transcript || "Ru is speaking — tap orb to interrupt"}
          </div>
        )}

        {/* Bottom control row */}
        <div className="pointer-events-auto flex items-center gap-3 rounded-full border border-border bg-elevated/95 px-4 py-2.5 shadow-2xl backdrop-blur-sm">
          {/* Stop speaking — only when Ru is talking */}
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
            aria-label="Stop Ru speaking"
          >
            Stop speaking
          </button>

          {/* Compact orb — also a tap target to interrupt */}
          <button
            type="button"
            onClick={interruptRu}
            aria-label={isSpeaking ? "Interrupt and listen" : "Voice active"}
            className="flex shrink-0 items-center justify-center rounded-full"
          >
            <SmallOrb phase={phase} />
          </button>

          {/* Live status label */}
          <span className="min-w-[80px] font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
            {statusLabel}
          </span>

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

        <p className="pointer-events-auto mt-2 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          Say &ldquo;that&rsquo;s it&rdquo; to end · tap orb to interrupt
        </p>
      </div>
    </div>
  );
}

/** Compact orb for the bottom dock. Same breathing rhythm as the big one. */
function SmallOrb({ phase }: { phase: OrbPhase }) {
  return (
    <div className="relative flex h-[44px] w-[44px] items-center justify-center">
      <VoiceOrb phase={phase} size={44} />
    </div>
  );
}
