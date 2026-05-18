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
  // Single-word stops only count if they're alone
  if (t === "stop" || t === "done" || t === "exit") return true;
  return false;
}

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

          // Auto-submit on final
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

  // Start listening on mount
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
      // Thinking until first token; speaking once text starts; tooling intercedes
      if (thinking === "speaking") setPhase("speaking");
      else if (thinking === "tooling") setPhase("thinking");
      else setPhase("thinking");
    } else if (sttRef.current) {
      setPhase("listening");
    } else {
      setPhase("ready");
    }
  }, [status, thinking]);

  // After Ru finishes speaking, wait for audio to drain then re-open the mic
  useEffect(() => {
    if (stoppingRef.current) return;
    if (status !== "idle") return;
    if (sttRef.current) return; // already listening

    // Poll until audio playback is finished, then resume mic
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

  function handleStop() {
    stoppingRef.current = true;
    stopSTT();
    if (status === "streaming") abort();
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

  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-background/95 backdrop-blur-sm">
      {/* Close button */}
      <button
        type="button"
        onClick={handleStop}
        aria-label="End conversation"
        className="absolute right-6 top-6 flex h-9 w-9 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
      >
        <X className="h-4 w-4" />
      </button>

      <VoiceOrb phase={phase} />

      <div className="mt-12 flex flex-col items-center gap-1 text-center">
        <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
          {statusLabel}
        </span>
        {transcript ? (
          <p
            className={cn(
              "mt-3 max-w-[42ch] text-[15px] italic text-muted-foreground",
              "min-h-[1.5em]"
            )}
            style={{ lineHeight: 1.5 }}
          >
            &ldquo;{transcript}&rdquo;
          </p>
        ) : (
          <p className="mt-3 max-w-[42ch] text-[13px] text-muted-foreground">
            {phase === "listening"
              ? "Just talk. Say 'that’s it' or tap close to end."
              : phase === "thinking"
                ? "Cooking your reply…"
                : phase === "speaking"
                  ? "" // Ru's words stream in the chat behind the overlay
                  : ""}
          </p>
        )}
      </div>
    </div>
  );
}
