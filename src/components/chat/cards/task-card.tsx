"use client";

import { useState, useTransition } from "react";
import { Check, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import { useNowTick } from "@/lib/hooks/use-now-tick";
import {
  completeTaskInline,
  reopenTaskInline,
} from "@/app/(app)/chat/card-actions";

export interface TaskCardData {
  id: string;
  title: string;
  priority?: "low" | "medium" | "high";
  due_at?: string | null;
  status?: "pending" | "completed" | string;
}

function formatDue(due?: string | null): string {
  if (!due) return "";
  const d = new Date(due);
  if (Number.isNaN(d.getTime())) return "";
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  if (sameDay) return `today, ${time}`;
  const day = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return `${day}, ${time}`;
}

export function TaskCard({ data }: { data: TaskCardData }) {
  const [status, setStatus] = useState<"pending" | "completed" | string>(
    data.status ?? "pending",
  );
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  useNowTick(); // re-evaluate overdue every minute

  const completed = status === "completed";
  const overdue =
    !completed &&
    !!data.due_at &&
    new Date(data.due_at).getTime() < Date.now();

  function toggle() {
    setError(null);
    const fn = completed ? reopenTaskInline : completeTaskInline;
    const nextStatus = completed ? "pending" : "completed";
    startTransition(async () => {
      const res = await fn(data.id);
      if (res.ok && res.state) {
        setStatus(nextStatus);
      } else {
        setError(res.error ?? "Couldn't update.");
      }
    });
  }

  return (
    <div
      className={cn(
        "block w-full overflow-hidden rounded-2xl transition-[filter] duration-300",
        overdue && "saturate-[0.78]",
      )}
      style={{
        background: "var(--entity-task)",
        color: "var(--entity-task-fg)",
      }}
    >
      <div className={cn("flex items-center gap-3 px-5 pt-4", overdue && "opacity-80")}>
        <CardLabel>task</CardLabel>
        <span className="opacity-40">·</span>
        <CardMeta>{data.priority ?? "no priority"}</CardMeta>
        {overdue && <StaleMark>overdue</StaleMark>}
        {data.due_at && (
          <span className="ml-auto text-[11px] tabular-nums opacity-85" style={meta}>
            {formatDue(data.due_at)}
          </span>
        )}
      </div>
      <div className="flex items-start gap-3 px-5 pb-3 pt-2">
        <div
          className={cn(
            "flex-1 text-[15px] leading-snug transition-opacity",
            completed && "line-through opacity-60",
            overdue && "opacity-75",
          )}
          style={{ fontVariationSettings: "'wght' 540, 'wdth' 96" }}
        >
          {data.title}
        </div>
      </div>
      <CardActions>
        {!completed ? (
          <PrimaryAction onClick={toggle} pending={pending}>
            <Check className="h-3 w-3" strokeWidth={3} />
            done
          </PrimaryAction>
        ) : (
          <SecondaryAction onClick={toggle} pending={pending}>
            <RotateCcw className="h-3 w-3" strokeWidth={2.5} />
            undo
          </SecondaryAction>
        )}
      </CardActions>
      {error && <ActionError>{error}</ActionError>}
    </div>
  );
}

// ==================== shared card sub-components ====================

const meta = { fontVariationSettings: "'wght' 580, 'wdth' 100" } as const;

export function CardLabel({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="text-[10px] uppercase tracking-[0.18em] opacity-75"
      style={meta}
    >
      {children}
    </span>
  );
}

export function CardMeta({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="text-[10px] uppercase tracking-[0.16em] opacity-80"
      style={meta}
    >
      {children}
    </span>
  );
}

export function CardActions({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-1.5 border-t border-black/15 px-3 py-2.5">
      {children}
    </div>
  );
}

export function PrimaryAction({
  children,
  onClick,
  pending,
}: {
  children: React.ReactNode;
  onClick: () => void;
  pending?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      className="inline-flex items-center gap-1.5 rounded-full bg-black/85 px-3 py-1.5 text-[11.5px] text-white transition-colors hover:bg-black disabled:opacity-50"
      style={{ fontVariationSettings: "'wght' 580, 'wdth' 96" }}
    >
      {pending ? "…" : children}
    </button>
  );
}

export function SecondaryAction({
  children,
  onClick,
  pending,
}: {
  children: React.ReactNode;
  onClick: () => void;
  pending?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      className="inline-flex items-center gap-1.5 rounded-full bg-black/12 px-3 py-1.5 text-[11.5px] text-current transition-colors hover:bg-black/22 disabled:opacity-50"
      style={{ fontVariationSettings: "'wght' 580, 'wdth' 96" }}
    >
      {pending ? "…" : children}
    </button>
  );
}

export function ActionError({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="border-t border-black/15 bg-black/12 px-5 py-2 text-[11px]"
      style={{ fontVariationSettings: "'wght' 500, 'wdth' 96" }}
    >
      {children}
    </div>
  );
}

/**
 * Small uppercase pill that appears on stale cards (overdue tasks,
 * missed reminders, routines past their scheduled time). Lives in the
 * card head row next to the existing label/meta. Dark-on-tile pill so it
 * reads as a quiet flag, not a button.
 */
export function StaleMark({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full bg-black/22 px-1.5 py-[2px] text-[9.5px] uppercase tracking-[0.14em]"
      style={{ fontVariationSettings: "'wght' 700, 'wdth' 100" }}
    >
      <span aria-hidden className="inline-block h-1 w-1 rounded-full bg-current opacity-80" />
      {children}
    </span>
  );
}
