"use client";

import { useEffect, useRef } from "react";
import { useChatStore } from "@/lib/stores/chat-store";
import { MessageList } from "./message-list";

export function ChatView() {
  const messages = useChatStore((s) => s.messages);
  const status = useChatStore((s) => s.status);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll when content changes (new message, streaming delta).
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, status]);

  if (messages.length === 0) {
    return <EmptyState />;
  }

  return (
    <div className="w-full">
      <MessageList messages={messages} />
      <div ref={bottomRef} className="h-2" />
    </div>
  );
}

function EmptyState() {
  const hour = new Date().getHours();
  const greeting =
    hour < 5
      ? "Still up?"
      : hour < 12
        ? "Morning."
        : hour < 17
          ? "Afternoon."
          : hour < 21
            ? "Evening."
            : "Late tonight?";

  return (
    <div className="flex min-h-[60vh] flex-col items-start justify-center pl-1">
      <div className="max-w-[52ch]">
        <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          ru · ready
        </div>
        <h1 className="mt-5 text-[44px] font-medium leading-[1.05] tracking-tight text-foreground">
          {greeting}
        </h1>
        <p
          className="mt-5 text-[15px] text-muted-foreground"
          style={{ lineHeight: 1.65 }}
        >
          Tell me what&rsquo;s on your mind. A meeting you keep dodging, the run you
          want to start, a thought you don&rsquo;t want to lose. I&rsquo;ll keep
          track of the rest.
        </p>

        <div className="mt-10 flex flex-col gap-2.5 font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
          <div className="flex items-center gap-3">
            <span className="h-px w-6 bg-[rgba(255,255,255,0.16)]" aria-hidden />
            <span>type below, or hold the mic</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="h-px w-6 bg-[rgba(255,255,255,0.16)]" aria-hidden />
            <span>tap voice-only to go hands-free</span>
          </div>
        </div>
      </div>
    </div>
  );
}
