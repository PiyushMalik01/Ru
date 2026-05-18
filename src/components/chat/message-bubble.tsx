"use client";

import type { ChatMessage } from "@/lib/stores/chat-store";
import { Card } from "./cards";
import { StreamingCaret } from "./streaming-bubble";
import { Markdown } from "./markdown";
import { cn } from "@/lib/utils";

export function MessageBubble({ message }: { message: ChatMessage }) {
  if (message.role === "user") {
    return (
      <div className="flex w-full justify-end">
        <div
          className={cn(
            "max-w-[80%] rounded-2xl bg-secondary px-4 py-2.5",
            "whitespace-pre-wrap text-[14px] leading-snug text-foreground"
          )}
        >
          {message.content}
        </div>
      </div>
    );
  }

  // Assistant — no bubble. Long-form reading typography. Markdown formatting
  // (headings, lists, code, tables) renders inline so plans + outputs look
  // structured rather than a wall of text.
  const showCaret = message.streaming === true;

  return (
    <div className="flex w-full">
      <div className="w-full max-w-[62ch]">
        {message.content.length > 0 && (
          <div
            className="text-[15px] text-foreground"
            style={{ lineHeight: 1.65 }}
          >
            <Markdown>{message.content}</Markdown>
            {showCaret && <StreamingCaret />}
          </div>
        )}

        {message.cards.length > 0 && (
          <div className="mt-4 space-y-2">
            {message.cards.map((card, i) => (
              <Card key={i} kind={card.kind} data={card.data} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
