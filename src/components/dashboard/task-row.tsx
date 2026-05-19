"use client";

import { useTransition, useState } from "react";
import { CheckCircle2, Circle } from "lucide-react";
import { cn } from "@/lib/utils";
import { toggleTaskComplete } from "@/app/(app)/tasks/actions";

interface TaskRowProps {
  id: string;
  title: string;
  status: "pending" | "in_progress" | "completed" | "missed";
  priority: "low" | "medium" | "high";
  dueAt: string | null;
  tags: string[];
  /** Render a subtle today-highlight band (when the row is in the Today bucket). */
  highlightToday?: boolean;
}

const priorityDot: Record<TaskRowProps["priority"], string> = {
  low: "bg-success",
  medium: "bg-warning",
  high: "bg-error",
};

function formatDue(due: string | null, nowMs: number): { label: string; overdue: boolean } | null {
  if (!due) return null;
  const d = new Date(due);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date(nowMs);
  const msDay = 1000 * 60 * 60 * 24;
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfDue = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dayDiff = Math.round((startOfDue.getTime() - startOfToday.getTime()) / msDay);

  const time = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }).toLowerCase().replace(" ", "");
  const overdue = d.getTime() < now.getTime();

  if (dayDiff === 0) return { label: `today ${time}`, overdue };
  if (dayDiff === 1) return { label: `tomorrow ${time}`, overdue };
  if (dayDiff === -1) return { label: `yesterday ${time}`, overdue };
  if (dayDiff > 1 && dayDiff <= 7) return { label: `in ${dayDiff} days`, overdue };
  if (dayDiff < -1 && dayDiff >= -7) return { label: `${Math.abs(dayDiff)}d ago`, overdue };
  const absLabel = d.toLocaleDateString([], { month: "short", day: "numeric" }).toLowerCase();
  return { label: absLabel, overdue };
}

export function TaskRow({ id, title, status, priority, dueAt, tags, highlightToday }: TaskRowProps) {
  const [optimisticDone, setOptimisticDone] = useState(status === "completed");
  const [pending, startTransition] = useTransition();

  // Capture "now" once at mount so render stays pure across re-renders.
  const [mountedAt] = useState(() => Date.now());

  function onToggle() {
    setOptimisticDone((v) => !v);
    startTransition(async () => {
      const res = await toggleTaskComplete(id);
      if (!res.ok) setOptimisticDone((v) => !v);
    });
  }

  const due = formatDue(dueAt, mountedAt);
  const isOverdue =
    !optimisticDone &&
    (status === "missed" || (dueAt ? new Date(dueAt).getTime() < mountedAt : false));

  const visibleTags = tags.slice(0, 2);
  const extraTags = tags.length - visibleTags.length;

  // Left strip color: cobalt for open, coral for overdue, transparent for done.
  const stripColor = optimisticDone
    ? "transparent"
    : isOverdue
      ? "var(--entity-reminder)"
      : "var(--entity-task)";

  return (
    <div
      className={cn(
        "group relative flex items-center gap-3 border-b border-[var(--hairline-soft)] py-4 pl-4 pr-2 transition-colors",
        "last:border-b-0",
        highlightToday && !optimisticDone && "bg-[color-mix(in_srgb,var(--entity-task)_4%,transparent)]",
        "hover:bg-[var(--tint-hover)]",
      )}
    >
      {/* 3px left strip — entity color marker. */}
      <span
        aria-hidden
        className="absolute left-0 top-2 bottom-2 w-[3px] rounded-full transition-colors"
        style={{ background: stripColor }}
      />
      {/* Toggle */}
      <button
        type="button"
        onClick={onToggle}
        disabled={pending}
        aria-label={optimisticDone ? "Mark as not done" : "Mark as done"}
        className={cn(
          "shrink-0 transition-opacity",
          pending && "opacity-50"
        )}
      >
        {optimisticDone ? (
          <CheckCircle2 className="h-[18px] w-[18px] text-success" strokeWidth={1.5} />
        ) : (
          <Circle
            className="h-[18px] w-[18px] text-muted-foreground/50 transition-colors hover:text-foreground"
            strokeWidth={1.5}
          />
        )}
      </button>

      {/* Priority dot */}
      <span
        className={cn(
          "h-1.5 w-1.5 shrink-0 rounded-full",
          optimisticDone ? "bg-muted-foreground/30" : priorityDot[priority]
        )}
        aria-hidden
      />

      {/* Title + tags */}
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span
            className={cn(
              "truncate text-[16px] font-medium leading-snug tracking-[-0.008em]",
              optimisticDone && "text-muted-foreground line-through",
            )}
          >
            {title}
          </span>
        </div>
        {(visibleTags.length > 0 || isOverdue) && (
          <div className="mt-1.5 flex items-center gap-2 font-mono text-[10px] lowercase tracking-[0.08em] text-muted-foreground">
            {visibleTags.map((t) => (
              <span key={t}>#{t}</span>
            ))}
            {extraTags > 0 && <span>+{extraTags}</span>}
            {isOverdue && (
              <span className="text-error/80">
                {visibleTags.length > 0 || extraTags > 0 ? "·" : ""} overdue
              </span>
            )}
          </div>
        )}
      </div>

      {/* Due — mono uppercase tracking */}
      {due && (
        <div
          className={cn(
            "shrink-0 font-mono text-[10.5px] uppercase tracking-[0.14em] tabular-nums",
            optimisticDone
              ? "text-muted-foreground/40 line-through"
              : isOverdue
                ? "text-error/80"
                : "text-muted-foreground",
          )}
        >
          {due.label}
        </div>
      )}
    </div>
  );
}
