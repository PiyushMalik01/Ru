"use client";

// AskOverlay — the chat summoning surface for non-chat pages.
//
// Closed: a slim, subtle pill at the bottom-center reading "Ask Ru anything…".
// Click (or focus, or hit "/") → the pill expands into a centered modal with
// a backdrop blur. The user can type or hit the mic. Their message goes into
// their current chat thread; Ru's streaming response renders inside the
// overlay. Esc, backdrop click, or "Continue in chat ↗" dismisses.

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { Mic, Send, Square, X, ArrowUpRight } from "lucide-react";
import { useChatStore, type ChatMessage } from "@/lib/stores/chat-store";
import { startSTT, type STTHandle } from "@/lib/voice/stt";
import { Markdown } from "@/components/chat/markdown";
import { ThinkingIndicator } from "@/components/chat/thinking-indicator";
import { cn } from "@/lib/utils";

export function AskOverlay() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [listening, setListening] = useState(false);
  const sttRef = useRef<STTHandle | null>(null);
  const finalBufRef = useRef("");
  const inputRef = useRef<HTMLInputElement>(null);

  const status = useChatStore((s) => s.status);
  const thinking = useChatStore((s) => s.thinking);
  const thinkingLabel = useChatStore((s) => s.thinkingLabel);
  const messages = useChatStore((s) => s.messages);
  const sendText = useChatStore((s) => s.sendText);
  const abort = useChatStore((s) => s.abort);

  const isStreaming = status === "streaming";

  // "/" anywhere opens the overlay (when not typing in another input).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && open) {
        e.preventDefault();
        setOpen(false);
        return;
      }
      if (e.key === "/" && !open) {
        const tag = (e.target as HTMLElement)?.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA") return;
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // Focus the input when the overlay opens.
  useEffect(() => {
    if (open) {
      const t = window.setTimeout(() => inputRef.current?.focus(), 50);
      return () => window.clearTimeout(t);
    }
  }, [open]);

  const stopSTT = useCallback(() => {
    sttRef.current?.stop();
    sttRef.current = null;
    setListening(false);
  }, []);

  useEffect(() => () => stopSTT(), [stopSTT]);

  function submit() {
    const t = input.trim();
    if (!t) return;
    setInput("");
    finalBufRef.current = "";
    void sendText(t);
  }

  async function handleMic() {
    if (listening) {
      stopSTT();
      if (finalBufRef.current.trim()) {
        setInput((v) => (v.trim() ? v + " " + finalBufRef.current : finalBufRef.current));
      }
      return;
    }
    try {
      setListening(true);
      finalBufRef.current = "";
      sttRef.current = await startSTT({
        onInterim: (text) => {
          const combined = (finalBufRef.current + " " + text).trim();
          setInput(combined);
        },
        onFinal: (text) => {
          finalBufRef.current = (finalBufRef.current + " " + text).trim();
          setInput(finalBufRef.current);
        },
        onError: (msg) => {
          console.error("stt error", msg);
          stopSTT();
        },
      });
    } catch (e) {
      console.error("stt start failed", e);
      stopSTT();
    }
  }

  // The last assistant message — used for the streaming preview in the overlay.
  const lastAssistant: ChatMessage | null =
    [...messages].reverse().find((m) => m.role === "assistant") ?? null;

  return (
    <>
      {/* Closed-state trigger — a slim pill at the bottom-center.
          Glass-tinted, no chrome until hover. Always visible. */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Ask Ru"
        className={cn(
          "fixed inset-x-0 bottom-5 z-30 mx-auto flex w-fit items-center gap-2 px-4 py-2.5",
          "rounded-full border border-[var(--hairline)] backdrop-blur-md",
          "bg-[color:var(--background)]/70 text-foreground/80 shadow-sm",
          "transition-all hover:bg-[color:var(--background)]/85 hover:text-foreground hover:scale-[1.02]"
        )}
      >
        <span className="text-[12.5px] font-medium tracking-tight">Ask Ru</span>
        <span className="rounded-full bg-foreground/10 px-1.5 py-0.5 font-mono text-[9.5px] tracking-wide">
          /
        </span>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-[60] flex items-center justify-center p-4"
            onClick={(e) => {
              if (e.target === e.currentTarget) setOpen(false);
            }}
          >
            {/* Backdrop — semi-transparent, blurs the page beneath. */}
            <div className="absolute inset-0 bg-[color:var(--background)]/60 backdrop-blur-md" />

            {/* The card */}
            <motion.div
              initial={{ y: 12, scale: 0.98 }}
              animate={{ y: 0, scale: 1 }}
              exit={{ y: 12, scale: 0.98 }}
              transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
              className={cn(
                "relative z-10 w-full max-w-2xl overflow-hidden rounded-[28px]",
                "border border-[var(--hairline)] bg-card text-card-foreground shadow-2xl"
              )}
            >
              {/* Header */}
              <div className="flex items-center justify-between border-b border-[var(--hairline-soft)] px-5 py-3">
                <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
                  Ask Ru
                </span>
                <div className="flex items-center gap-2 text-[11px]">
                  <Link
                    href="/chat"
                    className="inline-flex items-center gap-1 text-muted-foreground transition-colors hover:text-foreground"
                  >
                    Open full chat <ArrowUpRight className="h-3 w-3" />
                  </Link>
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    aria-label="Close"
                    className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              {/* Streaming preview region — last assistant message + thinking */}
              <div className="max-h-[40vh] min-h-[120px] overflow-y-auto px-5 py-5">
                {lastAssistant && lastAssistant.content ? (
                  <div
                    className="text-[15px] text-foreground"
                    style={{ lineHeight: 1.65 }}
                  >
                    <Markdown>{lastAssistant.content}</Markdown>
                  </div>
                ) : isStreaming ? (
                  <ThinkingIndicator
                    phase={thinking === "idle" ? "thinking" : thinking}
                    label={thinkingLabel}
                  />
                ) : (
                  <div className="flex h-full items-center justify-center py-6 text-center">
                    <p className="max-w-md text-[13px] text-muted-foreground">
                      Tell Ru what&rsquo;s on your mind. Quick log, a question,
                      a plan to build — it&rsquo;ll show up in your chat.
                    </p>
                  </div>
                )}
              </div>

              {/* Input bar */}
              <div className="border-t border-[var(--hairline-soft)] p-3">
                <div
                  className={cn(
                    "flex items-center gap-2 rounded-full border border-[var(--hairline)] bg-[color:var(--background)] px-4 py-2",
                    listening && "border-[var(--hairline-strong)]"
                  )}
                >
                  <input
                    ref={inputRef}
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        submit();
                      }
                    }}
                    placeholder="Talk to Ru…"
                    className="flex-1 bg-transparent py-1 text-[14px] text-foreground placeholder:text-muted-foreground focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={handleMic}
                    aria-label={listening ? "Stop listening" : "Start mic"}
                    className={cn(
                      "flex h-8 w-8 items-center justify-center rounded-full transition-colors",
                      listening
                        ? "bg-foreground text-background"
                        : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                    )}
                  >
                    {listening ? (
                      <Square className="h-3 w-3" />
                    ) : (
                      <Mic className="h-3.5 w-3.5" />
                    )}
                  </button>
                  {isStreaming ? (
                    <button
                      type="button"
                      onClick={abort}
                      aria-label="Stop"
                      className="flex h-8 w-8 items-center justify-center rounded-full bg-foreground text-background"
                    >
                      <Square className="h-3 w-3" />
                    </button>
                  ) : (
                    input.trim() && (
                      <button
                        type="button"
                        onClick={submit}
                        aria-label="Send"
                        className="flex h-8 w-8 items-center justify-center rounded-full bg-foreground text-background"
                      >
                        <Send className="h-3.5 w-3.5" />
                      </button>
                    )
                  )}
                </div>
                <div className="mt-2 flex items-center justify-between px-2 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                  <span>esc to close · / to summon</span>
                  {isStreaming && <span className="text-foreground/70">streaming</span>}
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
