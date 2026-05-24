"use client";

import { useEffect, useRef } from "react";
import { useChatStore, type ChatMessage } from "@/lib/stores/chat-store";
import { MessageList } from "./message-list";
import { ThinkingIndicator } from "./thinking-indicator";

interface Props {
  initialMessages?: ChatMessage[];
  chatId?: string | null;
  chatTitle?: string | null;
}

export function ChatView({
  initialMessages = [],
  chatId = null,
  chatTitle = null,
}: Props) {
  const messages = useChatStore((s) => s.messages);
  const status = useChatStore((s) => s.status);
  const thinking = useChatStore((s) => s.thinking);
  const thinkingLabel = useChatStore((s) => s.thinkingLabel);
  const hydrate = useChatStore((s) => s.hydrate);
  const storeChatId = useChatStore((s) => s.chatId);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (chatId !== storeChatId) {
      hydrate(initialMessages, chatId);
    }
  }, [chatId, storeChatId, initialMessages, hydrate]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, status, thinking]);

  const showLoader =
    (thinking === "thinking" || thinking === "tooling") &&
    messages[messages.length - 1]?.streaming &&
    !messages[messages.length - 1]?.content;

  if (messages.length === 0 && status !== "streaming") {
    return <EmptyState />;
  }

  return (
    <div className="w-full">
      {chatTitle ? (
        <div
          className="sticky top-0 z-10 -mt-2 mb-3 flex items-baseline justify-between border-b border-[var(--hairline)] bg-background/85 px-1 py-3 backdrop-blur-sm"
        >
          <div
            className="text-[18px] lowercase text-foreground"
            style={{
              fontVariationSettings: "'wght' 700, 'wdth' 94, 'opsz' 22",
              letterSpacing: "-0.02em",
            }}
          >
            {chatTitle}
          </div>
          <div
            className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground"
            style={{ fontVariationSettings: "'wght' 540, 'wdth' 100" }}
          >
            {messages.length} {messages.length === 1 ? "message" : "messages"}
          </div>
        </div>
      ) : null}

      <MessageList messages={messages} />
      {showLoader && (
        <div className="mt-4 pl-11">
          <ThinkingIndicator phase={thinking} label={thinkingLabel} />
        </div>
      )}
      <div ref={bottomRef} className="h-2" />
    </div>
  );
}

const CHIP_PROMPTS = [
  { label: "+ log a quick activity", text: "Log a quick activity for me." },
  { label: "+ remind me tomorrow", text: "Remind me about something tomorrow." },
  { label: "what did I do this week?", text: "What did I do this week?" },
  { label: "+ draft my Monday plan", text: "Draft my plan for Monday." },
  { label: "+ start a new routine", text: "Help me start a new routine." },
  { label: "what's next?", text: "What's next on my plate?" },
] as const;

function EmptyState() {
  const sendText = useChatStore((s) => s.sendText);
  const hour = new Date().getHours();
  const greeting =
    hour < 5
      ? "still up"
      : hour < 12
        ? "morning"
        : hour < 17
          ? "afternoon"
          : hour < 21
            ? "evening"
            : "late tonight";

  return (
    <div className="flex min-h-[64vh] flex-col items-start justify-center px-1">
      <div className="w-full max-w-[64ch]">
        <div
          className="inline-flex items-center gap-2 rounded-full bg-[var(--entity-routine)] px-3 py-1.5 text-[10.5px] uppercase tracking-[0.16em] text-[var(--entity-routine-fg)]"
          style={{ fontVariationSettings: "'wght' 620, 'wdth' 100" }}
        >
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inset-0 animate-ping rounded-full bg-[var(--entity-routine-fg)] opacity-50" />
            <span className="relative h-1.5 w-1.5 rounded-full bg-[var(--entity-routine-fg)]" />
          </span>
          ru is listening
        </div>

        <h1
          className="mt-7 lowercase text-foreground"
          style={{
            fontSize: "clamp(56px, 9vw, 96px)",
            lineHeight: 0.94,
            letterSpacing: "-0.045em",
            fontVariationSettings: "'wght' 780, 'wdth' 92, 'opsz' 96",
          }}
        >
          {greeting}
        </h1>

        <p
          className="mt-6 max-w-[54ch] text-[16.5px] text-muted-foreground"
          style={{
            lineHeight: 1.55,
            fontVariationSettings: "'wght' 440, 'wdth' 96",
          }}
        >
          Tell me what&rsquo;s on your mind. A meeting you keep dodging, the run
          you want to start, a thought you don&rsquo;t want to lose. I&rsquo;ll
          keep track of the rest.
        </p>

        <div className="mt-8 flex flex-wrap gap-2">
          {CHIP_PROMPTS.map((c, i) => (
            <button
              key={i}
              type="button"
              onClick={() => void sendText(c.text)}
              className="rounded-full border-[1.5px] border-foreground bg-card px-4 py-2 text-[14px] text-foreground transition-all hover:-translate-y-px hover:bg-foreground hover:text-background"
              style={{
                fontVariationSettings: "'wght' 540, 'wdth' 96",
                letterSpacing: "-0.005em",
              }}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
