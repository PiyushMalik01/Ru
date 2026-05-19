"use client";

import { useState } from "react";
import { Check, X } from "lucide-react";
import { type ChatMessage, useChatStore } from "@/lib/stores/chat-store";
import { Card } from "./cards";
import { StreamingCaret } from "./streaming-bubble";
import { Markdown } from "./markdown";
import { MessageActions } from "./message-actions";
import { cn } from "@/lib/utils";

interface Props {
  message: ChatMessage;
  /** True if this is the latest message in the list. */
  isLast?: boolean;
}

export function MessageBubble({ message, isLast = false }: Props) {
  const editMessage = useChatStore((s) => s.editMessage);
  const regenerateLast = useChatStore((s) => s.regenerateLast);
  const status = useChatStore((s) => s.status);

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(message.content);

  // Disable affordances during streaming so we don't fight an in-flight turn.
  const busy = status === "streaming";
  const canEdit = message.role === "user" && !busy && !message.id.startsWith("local-");
  const canRegenerate =
    isLast &&
    message.role === "assistant" &&
    !message.streaming &&
    !busy &&
    !message.id.startsWith("local-");

  function startEdit() {
    setDraft(message.content);
    setEditing(true);
  }
  function cancelEdit() {
    setEditing(false);
    setDraft(message.content);
  }
  async function commitEdit() {
    const trimmed = draft.trim();
    if (!trimmed || trimmed === message.content) {
      cancelEdit();
      return;
    }
    setEditing(false);
    await editMessage(message.id, trimmed);
  }

  if (message.role === "user") {
    return (
      <div className="group/msg flex w-full flex-col items-end">
        {editing ? (
          <div className="w-full max-w-[80%] rounded-2xl border border-foreground/20 bg-card p-3 shadow-sm">
            <textarea
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") cancelEdit();
                if ((e.key === "Enter" && (e.metaKey || e.ctrlKey)) ||
                    (e.key === "Enter" && !e.shiftKey)) {
                  e.preventDefault();
                  void commitEdit();
                }
              }}
              rows={Math.min(8, Math.max(2, draft.split("\n").length))}
              className="w-full resize-none bg-transparent text-[14px] leading-snug text-foreground focus:outline-none"
            />
            <div className="mt-2 flex items-center justify-between gap-2">
              <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                editing · enter to send · esc to cancel
              </span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={cancelEdit}
                  className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-[var(--secondary)] hover:text-foreground"
                  aria-label="Cancel"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={commitEdit}
                  disabled={draft.trim().length === 0}
                  className="flex h-7 w-7 items-center justify-center rounded-md bg-foreground text-background transition-opacity disabled:opacity-40"
                  aria-label="Save and resend"
                >
                  <Check className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div
            className={cn(
              "max-w-[80%] rounded-2xl bg-secondary px-4 py-2.5",
              "whitespace-pre-wrap text-[14px] leading-snug text-foreground",
            )}
          >
            {message.content}
          </div>
        )}
        {!editing && (
          <MessageActions
            role="user"
            content={message.content}
            onEdit={canEdit ? startEdit : undefined}
          />
        )}
      </div>
    );
  }

  // Assistant — no bubble. Long-form reading typography. Markdown renders
  // inline so plans + outputs look structured rather than a wall of text.
  const showCaret = message.streaming === true;

  return (
    <div className="group/msg flex w-full flex-col">
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
      <MessageActions
        role="assistant"
        content={message.content}
        isLast={isLast}
        streaming={message.streaming}
        onRegenerate={canRegenerate ? regenerateLast : undefined}
      />
    </div>
  );
}
