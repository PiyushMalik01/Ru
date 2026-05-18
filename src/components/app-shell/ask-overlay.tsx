"use client";

// AskHud — a heads-up display, not a modal.
//
// Closed: a slim, context-aware pill at the bottom-center with a placeholder
//   that reflects the page you're on ("Add a task...", "Update this plan...").
// Open: the pill expands to a wider input; a glossy response card floats
//   directly above it showing the streaming reply. The rest of the page
//   stays fully visible and interactive — no full-screen overlay, no page
//   blur. Like a car's heads-up display: it sits in the air over the road.
//
// Context: the HUD inspects the current pathname + search params and:
//   1. picks a placeholder that frames the ask for that page
//   2. sends a `context` payload to /api/chat so Ru's reply is relevant
//      to what the user is looking at (a plan id, a sheet filter, etc.)

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Mic, Send, Square, X } from "lucide-react";
import { useChatStore, type ChatMessage } from "@/lib/stores/chat-store";
import { useRuCompanion } from "@/lib/stores/ru-companion-store";
import { startSTT, type STTHandle } from "@/lib/voice/stt";
import { Markdown } from "@/components/chat/markdown";
import { ThinkingIndicator } from "@/components/chat/thinking-indicator";
import { usePushToTalk } from "@/lib/hooks/use-push-to-talk";
import { cn } from "@/lib/utils";

interface PageContext {
  label: string;
  placeholder: string;
  hint: string; // sent to the API to ground Ru's reply
  workspaceId?: string;
}

function derivePageContext(
  pathname: string,
  filter: string | null
): PageContext {
  // /plans/[id] → plan-aware
  const planMatch = pathname.match(/^\/plans\/([0-9a-f-]{36})$/i);
  if (planMatch) {
    return {
      label: "this plan",
      placeholder: "Update or extend this plan…",
      hint: `The user is viewing a specific plan (workspace id ${planMatch[1]}). Any new tasks/routines they ask for should attach to this plan via open_workspace or by referencing the workspace_id.`,
      workspaceId: planMatch[1],
    };
  }
  if (pathname.startsWith("/plans")) {
    return {
      label: "plans",
      placeholder: "Start a new plan…",
      hint: "The user is on the Plans index. Frame replies around building or revisiting a plan.",
    };
  }
  if (pathname.startsWith("/sheet")) {
    if (filter === "tasks") {
      return {
        label: "tasks",
        placeholder: "Add a task…",
        hint: "The user is looking at their task list. Prefer creating tasks over routines.",
      };
    }
    if (filter === "routines") {
      return {
        label: "routines",
        placeholder: "Declare a routine…",
        hint: "The user is looking at their routines. Prefer declaring routines.",
      };
    }
    if (filter === "reminders") {
      return {
        label: "reminders",
        placeholder: "Set a reminder…",
        hint: "The user is looking at reminders. Prefer creating reminders.",
      };
    }
    if (filter === "activities") {
      return {
        label: "activities",
        placeholder: "Log an activity…",
        hint: "The user is looking at their activity log. Prefer logging an activity.",
      };
    }
    return {
      label: "sheet",
      placeholder: "Ask, log, or build…",
      hint: "The user is on the unified Sheet view (all entity types visible).",
    };
  }
  if (pathname.startsWith("/today")) {
    return {
      label: "today",
      placeholder: "Ask Ru about your day…",
      hint: "The user is on the Today briefing. Reply with what's relevant to today.",
    };
  }
  if (pathname.startsWith("/settings")) {
    return {
      label: "settings",
      placeholder: "Talk to Ru…",
      hint: "The user is on Settings.",
    };
  }
  return {
    label: "ru",
    placeholder: "Talk to Ru…",
    hint: "",
  };
}

export function AskOverlay() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const filter = searchParams?.get("filter") ?? null;
  const ctx = useMemo(
    () => derivePageContext(pathname, filter),
    [pathname, filter]
  );

  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [listening, setListening] = useState(false);
  const sttRef = useRef<STTHandle | null>(null);
  const finalBufRef = useRef("");
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const status = useChatStore((s) => s.status);
  const thinking = useChatStore((s) => s.thinking);
  const thinkingLabel = useChatStore((s) => s.thinkingLabel);
  const messages = useChatStore((s) => s.messages);
  const sendText = useChatStore((s) => s.sendText);
  const setPageContext = useChatStore((s) => s.setPageContext);
  const abort = useChatStore((s) => s.abort);

  const isStreaming = status === "streaming";

  // Keep the chat store's pageContext in sync. The store forwards it to
  // /api/chat with each sendText call so Ru's reply is contextually grounded.
  useEffect(() => {
    setPageContext(ctx.hint ? { hint: ctx.hint, workspaceId: ctx.workspaceId } : null);
  }, [ctx, setPageContext]);

  // Tell Ru the HUD is open so she flies over and sits near it while we talk.
  useEffect(() => {
    useRuCompanion.getState().setAskHudOpen(open);
    return () => {
      useRuCompanion.getState().setAskHudOpen(false);
    };
  }, [open]);

  // "/" anywhere opens the HUD; Esc closes it.
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

  // Click outside the HUD area closes it (but doesn't blur the page underneath).
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [open]);

  useEffect(() => {
    if (open) {
      const t = window.setTimeout(() => inputRef.current?.focus(), 60);
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

  // Hold-space-to-talk: when held anywhere, open the HUD and start listening.
  // On release, stop the mic and submit the captured transcript.
  usePushToTalk({
    onStart: () => {
      if (!open) setOpen(true);
      if (!sttRef.current) {
        void handleMic();
      }
    },
    onStop: () => {
      if (sttRef.current) {
        stopSTT();
      }
      // Slight delay so the final transcript can settle into state.
      window.setTimeout(() => {
        const text = (input.trim() || finalBufRef.current.trim()).trim();
        if (text) {
          setInput("");
          finalBufRef.current = "";
          void sendText(text);
        }
      }, 80);
    },
  });

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

  const lastAssistant: ChatMessage | null = useMemo(
    () => [...messages].reverse().find((m) => m.role === "assistant") ?? null,
    [messages]
  );

  // The HUD response card shows when the HUD is open AND there's something
  // to show (streaming or a recent assistant message with content).
  const showResponse =
    open && (isStreaming || (lastAssistant !== null && lastAssistant.content.length > 0));

  return (
    <div
      ref={containerRef}
      className="pointer-events-none fixed inset-x-0 bottom-5 z-40 flex justify-center px-4"
    >
      <div className="pointer-events-auto flex w-full max-w-md flex-col items-stretch gap-2">
        {/* Floating response card — sits in the air ABOVE the pill */}
        <AnimatePresence>
          {showResponse && (
            <motion.div
              initial={{ opacity: 0, y: 12, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.98 }}
              transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
              className={cn(
                "overflow-hidden rounded-3xl border border-[var(--hairline)]",
                "bg-[color:var(--card)]/80 backdrop-blur-2xl",
                "shadow-[0_18px_60px_-12px_rgba(0,0,0,0.25)]",
                "dark:shadow-[0_24px_80px_-12px_rgba(0,0,0,0.55)]"
              )}
            >
              <div className="flex items-center justify-between px-5 pt-4">
                <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
                  ru · on {ctx.label}
                </span>
                {isStreaming && (
                  <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-foreground/70">
                    streaming
                  </span>
                )}
              </div>

              <div className="max-h-[42vh] overflow-y-auto px-5 pb-5 pt-3">
                {lastAssistant && lastAssistant.content ? (
                  <div
                    className="text-[14.5px] text-foreground"
                    style={{ lineHeight: 1.6 }}
                  >
                    <Markdown>{lastAssistant.content}</Markdown>
                  </div>
                ) : (
                  <ThinkingIndicator
                    phase={thinking === "idle" ? "thinking" : thinking}
                    label={thinkingLabel}
                  />
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* The pill — slim by default, expands inline when open */}
        <motion.div
          layout
          transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
          className={cn(
            "relative overflow-hidden rounded-full border border-[var(--hairline)]",
            "bg-[color:var(--card)]/80 backdrop-blur-xl",
            "shadow-[0_8px_28px_-4px_rgba(0,0,0,0.18)]",
            "dark:shadow-[0_10px_36px_-4px_rgba(0,0,0,0.5)]"
          )}
        >
          {open ? (
            <div className="flex items-center gap-2 px-3 py-2">
              <div className="ml-1 flex shrink-0 items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-[var(--entity-routine)]" />
                <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                  {ctx.label}
                </span>
              </div>

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
                placeholder={ctx.placeholder}
                className="flex-1 bg-transparent px-2 py-1.5 text-[14px] text-foreground placeholder:text-muted-foreground focus:outline-none"
              />

              <button
                type="button"
                onClick={handleMic}
                aria-label={listening ? "Stop listening" : "Start mic"}
                className={cn(
                  "flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors",
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
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-foreground text-background"
                >
                  <Square className="h-3 w-3" />
                </button>
              ) : input.trim() ? (
                <button
                  type="button"
                  onClick={submit}
                  aria-label="Send"
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-foreground text-background"
                >
                  <Send className="h-3.5 w-3.5" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="Close"
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="flex w-full items-center gap-2 px-4 py-2.5 text-left transition-colors hover:bg-[var(--tint-hover)]"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--entity-routine)]" />
              <span className="text-[12.5px] text-muted-foreground">{ctx.placeholder}</span>
              <span className="ml-auto flex items-center gap-1 font-mono text-[9.5px] tracking-wide text-muted-foreground">
                <span className="rounded-full bg-foreground/10 px-1.5 py-0.5">/</span>
                <span className="rounded-full bg-foreground/10 px-2 py-0.5">hold ⎵</span>
              </span>
            </button>
          )}
        </motion.div>
      </div>
    </div>
  );
}
