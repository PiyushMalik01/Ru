"use client";

// A single line in the Today / Now / Later sections. Optimistic toggle.
// Custom typographic glyph instead of a Lucide check.

import { useState, useTransition } from "react";
import { cn } from "@/lib/utils";
import { toggleTaskComplete } from "@/app/(app)/tasks/actions";
import { formatWhen } from "@/components/app-shell/primitives";

interface Props {
  id: string;
  title: string;
  status: "pending" | "in_progress" | "completed" | "missed";
  dueAt: string | null;
  priority: "low" | "medium" | "high";
  /** Stable timestamp from the server render, so SSR/CSR agree on relative dates. */
  nowMs: number;
}

const priorityDot: Record<Props["priority"], string> = {
  low: "bg-success/80",
  medium: "bg-warning/80",
  high: "bg-error/80",
};

export function TodayTaskLine({ id, title, status, dueAt, priority, nowMs }: Props) {
  const [done, setDone] = useState(status === "completed");
  const [pending, startTransition] = useTransition();

  const due = formatWhen(dueAt, nowMs);
  const overdue =
    !done && (status === "missed" || (dueAt ? new Date(dueAt).getTime() < nowMs : false));

  return (
    <div className="group flex items-center gap-4 border-b border-[rgba(255,255,255,0.05)] py-3 last:border-b-0">
      <button
        type="button"
        onClick={() => {
          setDone((v) => !v);
          startTransition(async () => {
            const r = await toggleTaskComplete(id);
            if (!r.ok) setDone((v) => !v);
          });
        }}
        disabled={pending}
        aria-label={done ? "Mark not done" : "Mark done"}
        className={cn(
          // Typographic glyph button — not a Lucide check. Sits in mono.
          "shrink-0 w-5 text-left font-mono text-[15px] leading-none transition-colors",
          done ? "text-success" : "text-muted-foreground/70 hover:text-foreground",
          pending && "opacity-50",
        )}
      >
        {done ? "☑" : "○"}
      </button>

      <span
        className={cn("h-1 w-1 shrink-0 rounded-full", done ? "bg-muted-foreground/30" : priorityDot[priority])}
        aria-hidden
      />

      <span
        className={cn(
          "min-w-0 flex-1 truncate text-[14.5px] leading-tight",
          done && "text-muted-foreground line-through",
        )}
      >
        {title}
      </span>

      {due && (
        <span
          className={cn(
            "shrink-0 font-mono text-[11px] tabular-nums",
            done
              ? "text-muted-foreground/40 line-through"
              : overdue
                ? "text-error/80"
                : "text-muted-foreground",
          )}
        >
          {due}
        </span>
      )}
    </div>
  );
}
