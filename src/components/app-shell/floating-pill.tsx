"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Mic, Square, Send } from "lucide-react";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useChatStore } from "@/lib/stores/chat-store";
import { startSTT, type STTHandle } from "@/lib/voice/stt";
import { VoiceConversation } from "@/components/chat/voice-conversation";

type PillState = "idle" | "typing" | "listening";

export function FloatingPill() {
  const [state, setState] = useState<PillState>("idle");
  const [input, setInput] = useState("");
  const [orbOpen, setOrbOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const sttRef = useRef<STTHandle | null>(null);
  const finalBufRef = useRef<string>("");
  const pathname = usePathname();
  const onChat = pathname === "/chat";

  const status = useChatStore((s) => s.status);
  const voiceMode = useChatStore((s) => s.voiceMode);
  const sendText = useChatStore((s) => s.sendText);
  const abort = useChatStore((s) => s.abort);
  const setVoiceMode = useChatStore((s) => s.setVoiceMode);
  const setContinuousVoice = useChatStore((s) => s.setContinuousVoice);

  const isStreaming = status === "streaming";

  const stopSTT = useCallback(() => {
    sttRef.current?.stop();
    sttRef.current = null;
  }, []);

  // Tear down on unmount
  useEffect(() => () => stopSTT(), [stopSTT]);

  const submit = useCallback(
    (text: string) => {
      const t = text.trim();
      if (!t) return;
      void sendText(t);
      setInput("");
      finalBufRef.current = "";
      setState("idle");
    },
    [sendText]
  );

  async function handleMicClick() {
    // Voice-only mode → open the full conversation orb instead of single-shot mic.
    if (voiceMode) {
      setOrbOpen(true);
      setContinuousVoice(true);
      return;
    }

    if (state === "listening") {
      stopSTT();
      if (finalBufRef.current.trim()) {
        submit(finalBufRef.current);
      }
      setState("idle");
      return;
    }

    try {
      setState("listening");
      finalBufRef.current = "";
      sttRef.current = await startSTT({
        onInterim: (text) => {
          // Interim replaces input (combined with any committed finals)
          const combined = (finalBufRef.current + " " + text).trim();
          setInput(combined);
        },
        onFinal: (text) => {
          // Append final to buffer
          finalBufRef.current = (finalBufRef.current + " " + text).trim();
          setInput(finalBufRef.current);

          // In voice-only mode, auto-submit on final
          if (useChatStore.getState().voiceMode) {
            const toSend = finalBufRef.current;
            finalBufRef.current = "";
            setInput("");
            stopSTT();
            setState("idle");
            void useChatStore.getState().sendText(toSend);
          }
        },
        onError: (msg) => {
          console.error("stt error", msg);
          stopSTT();
          setState("idle");
        },
      });
    } catch (e) {
      console.error("stt failed to start", e);
      stopSTT();
      setState("idle");
    }
  }

  function handleSubmit() {
    if (isStreaming) {
      abort();
      return;
    }
    submit(input);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }

  function toggleVoiceOnly() {
    const next = !voiceMode;
    setVoiceMode(next);
    if (!next) {
      // Leaving voice-only: stop STT if running
      if (state === "listening") {
        stopSTT();
        setState("idle");
      }
    }
  }

  const showStop = isStreaming;
  const showSend = !showStop && state === "typing" && input.trim().length > 0;

  return (
    <>
      <div
        className={cn(
          // On the chat page only, the workspace panel takes ~40% on lg+. We
          // restrict the pill's right edge to the chat column so it stays
          // centered over the conversation, not the full viewport.
          "fixed inset-x-0 bottom-0 z-50 flex justify-center p-4 transition-opacity",
          onChat && "lg:right-[40%]",
          orbOpen && "pointer-events-none opacity-0"
        )}
      >
        <div className="relative w-full max-w-xl">
        <div
          className={cn(
            "flex items-center gap-2 rounded-full border px-5 py-1.5 backdrop-blur-md transition-all",
            "bg-[color:var(--card)]/85 shadow-[0_4px_24px_rgba(0,0,0,0.08)]",
            "dark:shadow-[0_4px_24px_rgba(0,0,0,0.35)]",
            state === "listening"
              ? "border-[var(--hairline-strong)]"
              : "border-[var(--hairline)]"
          )}
        >
          {state === "listening" ? (
            <WaveformBars />
          ) : voiceMode ? (
            <button
              onClick={handleMicClick}
              className="flex-1 py-2 text-left text-sm text-muted-foreground"
            >
              Tap to speak
            </button>
          ) : (
            <input
              ref={inputRef}
              type="text"
              placeholder="Talk to Ru..."
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                setState(e.target.value ? "typing" : "idle");
              }}
              onKeyDown={handleKeyDown}
              disabled={isStreaming && false /* keep editable */}
              className="flex-1 bg-transparent py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
            />
          )}

          {(showSend || showStop) && (
            <button
              onClick={handleSubmit}
              aria-label={showStop ? "Stop" : "Send"}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-foreground text-background transition-colors hover:bg-foreground/90"
            >
              {showStop ? (
                <Square className="h-3 w-3" />
              ) : (
                <Send className="h-3.5 w-3.5" />
              )}
            </button>
          )}

          <button
            onClick={toggleVoiceOnly}
            className={cn(
              "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] transition-colors",
              voiceMode
                ? "border-transparent bg-foreground text-background"
                : "border-[var(--hairline)] bg-[var(--secondary)] text-muted-foreground hover:text-foreground"
            )}
          >
            <span
              className={cn(
                "h-1.5 w-1.5 rounded-full",
                voiceMode ? "bg-background" : "bg-[var(--entity-routine)]"
              )}
            />
            Voice only
          </button>

          <button
            onClick={handleMicClick}
            aria-label={state === "listening" ? "Stop listening" : "Start mic"}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-foreground text-background transition-colors hover:bg-foreground/90"
          >
            {state === "listening" ? (
              <Square className="h-3 w-3" />
            ) : (
              <Mic className="h-4 w-4" />
            )}
          </button>
        </div>

          {/* Subtle 1px opacity-pulse line under the pill while streaming */}
          {isStreaming && (
            <div
              aria-hidden
              className="ru-pill-pulse pointer-events-none absolute inset-x-6 -bottom-px h-px bg-[var(--hairline-strong)]"
            />
          )}
        </div>
      </div>

      {orbOpen && (
        <VoiceConversation
          onClose={() => {
            setOrbOpen(false);
            setContinuousVoice(false);
          }}
        />
      )}
    </>
  );
}

function WaveformBars() {
  const bars = [
    { h: 8, d: "0s" }, { h: 16, d: "0.05s" }, { h: 22, d: "0.1s" },
    { h: 12, d: "0.15s" }, { h: 20, d: "0.2s" }, { h: 8, d: "0.25s" },
    { h: 14, d: "0.3s" }, { h: 18, d: "0.35s" }, { h: 6, d: "0.4s" },
    { h: 16, d: "0.45s" }, { h: 22, d: "0.5s" }, { h: 10, d: "0.55s" },
  ];

  return (
    <div className="flex flex-1 items-center gap-[3px] py-2">
      {bars.map((bar, i) => (
        <div
          key={i}
          className="w-[3px] animate-pulse rounded-full bg-foreground"
          style={{
            height: `${bar.h}px`,
            opacity: 0.3 + (bar.h / 22) * 0.7,
            animationDelay: bar.d,
            animationDuration: `${0.6 + (i % 3) * 0.2}s`,
          }}
        />
      ))}
    </div>
  );
}
