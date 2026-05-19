"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Mic, Square, ArrowUp, Headphones } from "lucide-react";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useChatStore } from "@/lib/stores/chat-store";
import { startSTT, type STTHandle } from "@/lib/voice/stt";
import { VoiceConversation } from "@/components/chat/voice-conversation";
import { usePushToTalk } from "@/lib/hooks/use-push-to-talk";

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

  // Hold-space-to-talk on /chat as well. Disabled in voice-only mode (the
  // orb already runs continuously and would conflict) and when the orb is open.
  usePushToTalk({
    enabled: !voiceMode && !orbOpen,
    onStart: () => {
      if (state === "listening") return;
      void handleMicClick();
    },
    onStop: () => {
      if (sttRef.current) {
        stopSTT();
      }
      window.setTimeout(() => {
        const text = (input.trim() || finalBufRef.current.trim()).trim();
        if (text) {
          submit(text);
        } else {
          setState("idle");
        }
      }, 80);
    },
  });

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

  // Single status dot on the left — replaces the "Voice only" labeled chip's
  // colored dot and gives the pill a visible state at a glance.
  const dotState: "idle" | "typing" | "listening" | "streaming" =
    isStreaming ? "streaming" : state;

  return (
    <>
      <div
        className={cn(
          // On the chat page only, the workspace panel takes ~40% on lg+. We
          // restrict the pill's right edge to the chat column so it stays
          // centered over the conversation, not the full viewport.
          "fixed inset-x-0 bottom-0 z-50 flex justify-center p-4 transition-opacity",
          onChat && "lg:right-[40%]",
          orbOpen && "pointer-events-none opacity-0",
        )}
      >
        <div className="relative w-full max-w-xl">
          <div
            className={cn(
              // The shell. Chunky pill (full-radius), focus-aware border
              // weight, and a soft outer glow so it reads as the primary
              // input surface — not a control bar.
              "group/pill flex items-center gap-2 rounded-full px-4 py-2 backdrop-blur-xl transition-all",
              "bg-[color:var(--card)]/90 shadow-[0_8px_28px_-12px_rgba(0,0,0,0.18)]",
              "dark:shadow-[0_8px_28px_-12px_rgba(0,0,0,0.55)]",
              "border-2",
              state === "listening"
                ? "border-[var(--entity-routine)]/70"
                : state === "typing"
                  ? "border-[var(--hairline-strong)] focus-within:border-foreground/30"
                  : "border-[var(--hairline)] focus-within:border-foreground/30",
            )}
          >
            {/* Status dot — single source of truth for what the pill is doing.
                Color carries the meaning so the icon set on the right can stay
                visually quiet. */}
            <StatusDot state={dotState} voiceMode={voiceMode} />

            {/* Input surface — text field, listening waveform, or voice-mode
                breathing placeholder. The three states are mutually exclusive
                and animate via opacity so the swap is calm. */}
            <div className="relative flex-1">
              {state === "listening" ? (
                <WaveformBars />
              ) : voiceMode ? (
                <button
                  type="button"
                  onClick={handleMicClick}
                  className="ru-voice-placeholder flex w-full items-center py-2 text-left text-[14.5px] text-muted-foreground"
                >
                  Tap to speak
                </button>
              ) : (
                <input
                  ref={inputRef}
                  type="text"
                  placeholder="Talk to Ru…"
                  value={input}
                  onChange={(e) => {
                    setInput(e.target.value);
                    setState(e.target.value ? "typing" : "idle");
                  }}
                  onKeyDown={handleKeyDown}
                  className="w-full bg-transparent py-2 text-[14.5px] text-foreground placeholder:text-muted-foreground/70 focus:outline-none"
                />
              )}
            </div>

            {/* Right control cluster — visual hierarchy is Send > Mic > Voice
                toggle. Send/Stop is the only filled-foreground button. Mic
                gets a subtle background only when listening. Voice-only is a
                small icon toggle (Headphones), tertiary. */}
            <button
              type="button"
              onClick={toggleVoiceOnly}
              aria-pressed={voiceMode}
              aria-label={voiceMode ? "Disable voice-only mode" : "Enable voice-only mode"}
              title={voiceMode ? "Voice only · on" : "Voice only"}
              className={cn(
                "flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-all",
                voiceMode
                  ? "bg-foreground text-background shadow-[0_0_0_4px_rgba(0,0,0,0.06)] dark:shadow-[0_0_0_4px_rgba(255,255,255,0.06)]"
                  : "text-muted-foreground hover:bg-[var(--secondary)] hover:text-foreground",
              )}
            >
              <Headphones className="h-[15px] w-[15px]" strokeWidth={1.75} />
            </button>

            <button
              type="button"
              onClick={handleMicClick}
              aria-label={state === "listening" ? "Stop listening" : "Start mic"}
              title={voiceMode ? "Start conversation" : "Hold space, or tap to speak"}
              className={cn(
                "flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-all",
                state === "listening"
                  ? "bg-[var(--entity-routine)] text-[var(--entity-routine-fg)]"
                  : "text-foreground hover:bg-[var(--secondary)]",
              )}
            >
              {state === "listening" ? (
                <Square className="h-3 w-3" fill="currentColor" />
              ) : (
                <Mic className="h-[15px] w-[15px]" strokeWidth={1.75} />
              )}
            </button>

            {/* Send/Stop — primary action. Only visible when there's content
                to send or a stream to stop. Filled foreground so it's
                unambiguously the "go" button. */}
            {(showSend || showStop) && (
              <button
                type="button"
                onClick={handleSubmit}
                aria-label={showStop ? "Stop" : "Send"}
                title={showStop ? "Stop" : "Send (Enter)"}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-foreground text-background shadow-[0_2px_8px_-2px_rgba(0,0,0,0.25)] transition-transform hover:scale-[1.04] active:scale-95"
              >
                {showStop ? (
                  <Square className="h-3 w-3" fill="currentColor" />
                ) : (
                  <ArrowUp className="h-[15px] w-[15px]" strokeWidth={2.25} />
                )}
              </button>
            )}
          </div>

          {/* Subtle 1px opacity-pulse line under the pill while streaming */}
          {isStreaming && (
            <div
              aria-hidden
              className="ru-pill-pulse pointer-events-none absolute inset-x-6 -bottom-px h-px bg-[var(--hairline-strong)]"
            />
          )}

          {/* Inline keyboard hint — appears only when idle + not voice-mode.
              Tells the user about hold-space-to-talk without crowding. */}
          {!voiceMode && state === "idle" && !isStreaming && (
            <div className="pointer-events-none absolute inset-x-0 -top-6 flex justify-center font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground/50 opacity-0 transition-opacity duration-300 group-hover/pill:opacity-100">
              hold <kbd className="mx-1 rounded border border-[var(--hairline)] px-1">space</kbd> to talk
            </div>
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

function StatusDot({
  state,
  voiceMode,
}: {
  state: "idle" | "typing" | "listening" | "streaming";
  voiceMode: boolean;
}) {
  const color =
    state === "listening"
      ? "var(--entity-routine)"
      : state === "streaming"
        ? "var(--entity-task)"
        : voiceMode
          ? "var(--foreground)"
          : "var(--muted-foreground)";

  const pulses = state === "listening" || state === "streaming";

  return (
    <span
      aria-hidden
      className="relative ml-1 mr-1 flex h-2 w-2 shrink-0 items-center justify-center"
    >
      {pulses && (
        <span
          className="absolute inset-0 animate-ping rounded-full opacity-60"
          style={{ background: color }}
        />
      )}
      <span
        className="relative h-2 w-2 rounded-full transition-colors"
        style={{ background: color, opacity: state === "idle" ? 0.55 : 1 }}
      />
    </span>
  );
}

function WaveformBars() {
  // 14 thin bars with staggered animation. Heights are deliberately
  // asymmetric so the row doesn't read as a uniform equalizer demo.
  const bars = [6, 14, 22, 10, 18, 8, 16, 24, 12, 20, 8, 14, 18, 10];
  return (
    <div className="flex h-9 flex-1 items-center gap-[3px] py-2">
      {bars.map((h, i) => (
        <div
          key={i}
          className="w-[3px] rounded-full"
          style={{
            height: `${h}px`,
            background: "var(--entity-routine)",
            opacity: 0.4 + (h / 24) * 0.6,
            animation: `ru-wave 1.05s ease-in-out infinite`,
            animationDelay: `${i * 0.06}s`,
          }}
        />
      ))}
    </div>
  );
}
