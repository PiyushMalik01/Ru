"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Mic, Square, ArrowUp, Check, X } from "lucide-react";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useChatStore, isTTSPlaying } from "@/lib/stores/chat-store";
import { startSTT, type STTHandle } from "@/lib/voice/stt";
import { VoiceConversation } from "@/components/chat/voice-conversation";
import { usePushToTalk } from "@/lib/hooks/use-push-to-talk";
import {
  isLikelyScattered,
  type SanityReason,
} from "@/lib/voice/transcript-sanity";
import { VoiceToggle } from "./voice-toggle";
import { MiniOrb } from "./mini-orb";

interface PendingConfirm {
  text: string;
  reason: SanityReason;
}

function reasonLabel(reason: SanityReason): string {
  switch (reason) {
    case "empty":           return "nothing came through";
    case "too-short":       return "did i get that?";
    case "single-syllable": return "did i get that?";
    case "repetition":      return "did you mean to repeat?";
    case "low-content":     return "did i get that?";
  }
}

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

  // TTS keeps playing audio after the SSE stream ends — the model finished
  // generating text but Ru is still reading it aloud. Poll the audio player
  // so the Stop button stays visible (and clickable) the whole time.
  const [ttsPlaying, setTtsPlaying] = useState(false);
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const p = isTTSPlaying();
      setTtsPlaying((prev) => (prev === p ? prev : p));
      raf = window.setTimeout(tick, 200) as unknown as number;
    };
    tick();
    return () => window.clearTimeout(raf);
  }, []);

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

  // Sanity-checked submit for voice-derived transcripts. If the text looks
  // scattered (mic noise, single short token, repetition, low-content
  // soup), surface a tick/cross toast instead of firing the LLM on
  // garbage. Typed input goes through `submit` directly — no gate.
  const [pendingConfirm, setPendingConfirm] = useState<PendingConfirm | null>(null);
  const submitVoice = useCallback(
    (text: string) => {
      const t = text.trim();
      if (!t) return;
      const sanity = isLikelyScattered(t);
      if (!sanity.ok && sanity.reason) {
        setPendingConfirm({ text: t, reason: sanity.reason });
        setInput("");
        finalBufRef.current = "";
        setState("idle");
        return;
      }
      submit(t);
    },
    [submit]
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
        submitVoice(finalBufRef.current);
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
    // Stop button: kill the stream AND cut Ru's audio mid-sentence.
    // abort() already calls interruptTTS internally.
    if (isStreaming || ttsPlaying) {
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
          // Voice-derived → gate behind sanity check.
          submitVoice(text);
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

  // Show Stop while the model is streaming OR while Ru is still speaking
  // queued audio. The user explicitly asked for a way to shut her up mid-reply.
  const showStop = isStreaming || ttsPlaying;
  const showSend = !showStop && state === "typing" && input.trim().length > 0;

  // Single status dot on the left — replaces the "Voice only" labeled chip's
  // colored dot and gives the pill a visible state at a glance.
  const dotState: "idle" | "typing" | "listening" | "streaming" =
    isStreaming || ttsPlaying ? "streaming" : state;

  return (
    <>
      <div
        className={cn(
          // On the chat page only, the workspace panel takes ~32% on lg+. We
          // restrict the pill's right edge to the chat column so it stays
          // centered over the conversation, not the full viewport.
          "fixed inset-x-0 bottom-0 z-50 flex flex-col items-center gap-2 p-4 transition-opacity",
          onChat && "lg:right-[32%]",
          orbOpen && "pointer-events-none opacity-0",
        )}
      >
        {pendingConfirm && (
          <div
            role="dialog"
            aria-label="Confirm what was heard"
            className="flex max-w-xl items-center gap-2 rounded-full border border-[var(--hairline-strong)] bg-[color:var(--card)]/95 px-3 py-2 shadow-[0_10px_28px_-12px_rgba(0,0,0,0.28)] backdrop-blur-xl"
          >
            <span
              className="shrink-0 rounded-full bg-[var(--secondary)] px-2 py-1 text-[10px] uppercase tracking-[0.14em] text-muted-foreground"
              style={{ fontVariationSettings: "'wght' 620, 'wdth' 100" }}
            >
              {reasonLabel(pendingConfirm.reason)}
            </span>
            <span
              className="min-w-0 flex-1 truncate text-[13.5px] italic text-foreground"
              style={{ fontVariationSettings: "'wght' 460, 'wdth' 96" }}
            >
              &ldquo;{pendingConfirm.text}&rdquo;
            </span>
            <button
              type="button"
              onClick={() => {
                const t = pendingConfirm.text;
                setPendingConfirm(null);
                submit(t);
              }}
              aria-label="Send anyway"
              title="Send anyway"
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-foreground text-background transition-transform hover:scale-[1.05]"
            >
              <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
            </button>
            <button
              type="button"
              onClick={() => setPendingConfirm(null)}
              aria-label="Discard"
              title="Discard"
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-[var(--secondary)] hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" strokeWidth={2.25} />
            </button>
          </div>
        )}
        {voiceMode ? (
          // Collapsed pill — voice mode. The orb is the affordance; tap it to
          // open the full conversation. Toggle stays visible so the user can
          // jump back to text mode.
          <div
            className={cn(
              "flex items-center gap-3 rounded-full px-3 py-2 backdrop-blur-xl",
              "bg-[color:var(--card)]/90 shadow-[0_8px_28px_-12px_rgba(0,0,0,0.18)]",
              "dark:shadow-[0_8px_28px_-12px_rgba(0,0,0,0.55)]",
              "border-2 border-[var(--hairline)]",
            )}
          >
            <VoiceToggle on={voiceMode} onChange={() => toggleVoiceOnly()} />
            <button
              type="button"
              onClick={handleMicClick}
              aria-label="Open voice conversation"
              title="Tap to start talking"
              className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-full bg-[#0a0a0e] shadow-[0_6px_22px_-6px_rgba(0,0,0,0.45)] transition-transform hover:scale-[1.04] active:scale-95"
            >
              <MiniOrb size={56} />
            </button>
          </div>
        ) : (
          <div className="relative w-full max-w-xl">
            <div
              className={cn(
                // Same chunky pill shell as before — only the headphones
                // toggle was replaced with the new VoiceToggle switch.
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
              <StatusDot state={dotState} voiceMode={voiceMode} />

              <div className="relative flex-1">
                {state === "listening" ? (
                  <WaveformBars />
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

              <VoiceToggle on={voiceMode} onChange={() => toggleVoiceOnly()} />

              <button
                type="button"
                onClick={handleMicClick}
                aria-label={state === "listening" ? "Stop listening" : "Start mic"}
                title="Hold space, or tap to speak"
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

            {isStreaming && (
              <div
                aria-hidden
                className="ru-pill-pulse pointer-events-none absolute inset-x-6 -bottom-px h-px bg-[var(--hairline-strong)]"
              />
            )}

            {state === "idle" && !isStreaming && (
              <div className="pointer-events-none absolute inset-x-0 -top-6 flex justify-center font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground/50 opacity-0 transition-opacity duration-300 group-hover/pill:opacity-100">
                hold <kbd className="mx-1 rounded border border-[var(--hairline)] px-1">space</kbd> to talk
              </div>
            )}
          </div>
        )}
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
