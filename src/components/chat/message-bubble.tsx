"use client";

import { useState } from "react";
import { Check, X } from "lucide-react";
import { type ChatMessage, useChatStore } from "@/lib/stores/chat-store";
import { Card } from "./cards";
import { StreamingCaret } from "./streaming-bubble";
import { Markdown } from "./markdown";
import { MessageActions } from "./message-actions";
import { MiniOrb } from "@/components/app-shell/mini-orb";
import { cn } from "@/lib/utils";

interface Props {
  message: ChatMessage;
  /** True if this is the latest message in the list. */
  isLast?: boolean;
}

function formatTimestamp(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const now = new Date();
  const time = d.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
  if (d.toDateString() === now.toDateString()) return time;
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return `yesterday · ${time}`;
  const day = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return `${day} · ${time}`;
}

export function MessageBubble({ message, isLast = false }: Props) {
  const editMessage = useChatStore((s) => s.editMessage);
  const regenerateLast = useChatStore((s) => s.regenerateLast);
  const status = useChatStore((s) => s.status);

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(message.content);

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

  // ===== USER =====
  if (message.role === "user") {
    return (
      <div className="group/msg flex w-full flex-col items-end gap-1.5">
        {editing ? (
          <div className="w-full max-w-[80%] rounded-2xl border border-foreground/20 bg-card p-3 shadow-sm">
            <textarea
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") cancelEdit();
                if (
                  (e.key === "Enter" && (e.metaKey || e.ctrlKey)) ||
                  (e.key === "Enter" && !e.shiftKey)
                ) {
                  e.preventDefault();
                  void commitEdit();
                }
              }}
              rows={Math.min(8, Math.max(2, draft.split("\n").length))}
              className="w-full resize-none bg-transparent text-[14px] leading-snug text-foreground focus:outline-none"
            />
            <div className="mt-2 flex items-center justify-between gap-2">
              <span
                className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground"
                style={{ fontVariationSettings: "'wght' 500, 'wdth' 100" }}
              >
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
          <>
            <div
              className={cn(
                // Ink-on-cream user bubble with the asymmetric corner that
                // says "this is mine, I just said this" — visually distinct
                // from the assistant's grounded prose. The 4px corner on the
                // bottom-right is the "tail" of the speech.
                "max-w-[78%] whitespace-pre-wrap rounded-[20px_20px_4px_20px] px-4 py-2.5",
                "bg-foreground text-background",
                "text-[14.5px] leading-[1.5]",
                "shadow-[0_6px_18px_-8px_rgba(0,0,0,0.2)]",
              )}
              style={{ fontVariationSettings: "'wght' 460, 'wdth' 96" }}
            >
              {message.content}
            </div>
            <div
              className="pr-2 text-[10px] uppercase tracking-[0.14em] text-muted-foreground"
              style={{ fontVariationSettings: "'wght' 540, 'wdth' 100" }}
            >
              {formatTimestamp(message.created_at)}
            </div>
          </>
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

  // ===== ASSISTANT =====
  // An empty, non-streaming assistant message means the stream was aborted
  // before any text or cards landed. Rendering an orb + timestamp with no
  // content reads as a phantom turn. Hide it.
  if (
    !message.streaming &&
    !message.content &&
    message.cards.length === 0
  ) {
    return null;
  }
  const showCaret = message.streaming === true;
  return (
    <div className="group/msg flex w-full">
      <div className="flex w-full gap-3">
        {/* Orb anchor — the same wave-ring creature that lives in the pill
            and the voice modal, at 28px. Cohesion with the voice surface,
            and a visual ground for each Ru reply so two adjacent turns
            don't blur into each other. */}
        <div
          className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#0a0a0e]"
          aria-hidden
        >
          <MiniOrb size={28} />
        </div>

        <div className="min-w-0 flex-1">
          {message.content.length > 0 && (
            <div
              className="text-[15px] text-foreground"
              style={{
                lineHeight: 1.65,
                fontVariationSettings: "'wght' 440, 'wdth' 96",
              }}
            >
              <Markdown>{message.content}</Markdown>
              {showCaret && <StreamingCaret />}
            </div>
          )}

          {message.cards.length > 0 && (
            <div className="mt-3 flex max-w-[540px] flex-col gap-2">
              {message.cards.map((card, i) => (
                <Card key={i} kind={card.kind} data={card.data} />
              ))}
            </div>
          )}

          {!message.streaming && (
            <div
              className="mt-2 text-[10px] uppercase tracking-[0.14em] text-muted-foreground"
              style={{ fontVariationSettings: "'wght' 540, 'wdth' 100" }}
            >
              {formatTimestamp(message.created_at)}
            </div>
          )}

          <MessageActions
            role="assistant"
            content={message.content}
            isLast={isLast}
            streaming={message.streaming}
            onRegenerate={canRegenerate ? regenerateLast : undefined}
          />
        </div>
      </div>
    </div>
  );
}
