"use client";

// Hover-revealed action row attached under a message bubble. Shows different
// affordances per role:
//   user      → Copy + Edit
//   assistant → Copy + Regenerate (last reply only)
//
// Actions are quiet by default; the row fades in on hover of the parent
// `.group/msg` container.

import { useState } from "react";
import { Check, Copy, Pencil, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  role: "user" | "assistant";
  content: string;
  /** True only on the most recent assistant message. */
  isLast?: boolean;
  /** Streaming messages can't be edited or regenerated. */
  streaming?: boolean;
  onEdit?: () => void;
  onRegenerate?: () => void;
}

export function MessageActions({
  role,
  content,
  isLast = false,
  streaming = false,
  onEdit,
  onRegenerate,
}: Props) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      /* clipboard blocked — ignore */
    }
  }

  const showEdit = role === "user" && !streaming && onEdit;
  const showRegenerate = role === "assistant" && isLast && !streaming && onRegenerate;

  return (
    <div
      className={cn(
        "mt-1 flex items-center gap-1 opacity-0 transition-opacity duration-200",
        "group-hover/msg:opacity-100 focus-within:opacity-100",
        role === "user" ? "justify-end" : "justify-start",
      )}
    >
      <ActionButton onClick={copy} title={copied ? "Copied" : "Copy"} aria-label="Copy">
        {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      </ActionButton>
      {showEdit && (
        <ActionButton onClick={onEdit} title="Edit & resend" aria-label="Edit and resend">
          <Pencil className="h-3.5 w-3.5" />
        </ActionButton>
      )}
      {showRegenerate && (
        <ActionButton
          onClick={onRegenerate}
          title="Regenerate"
          aria-label="Regenerate reply"
        >
          <RefreshCw className="h-3.5 w-3.5" />
        </ActionButton>
      )}
    </div>
  );
}

function ActionButton({
  children,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { children: React.ReactNode }) {
  return (
    <button
      type="button"
      {...rest}
      className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-[var(--secondary)] hover:text-foreground"
    >
      {children}
    </button>
  );
}
