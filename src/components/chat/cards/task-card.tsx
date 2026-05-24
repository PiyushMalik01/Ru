"use client";

import { useState, useTransition } from "react";
import { Check, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
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

  const completed = status === "completed";

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
      className="block w-full overflow-hidden rounded-2xl"
      style={{
        background: "var(--entity-task)",
        color: "var(--entity-task-fg)",
      }}
    >
      <div className="flex items-center gap-3 px-5 pt-4">
        <CardLabel>task</CardLabel>
        <span className="opacity-40">·</span>
        <CardMeta>{data.priority ?? "no priority"}</CardMeta>
        {data.due_at && (
          <span className="ml-auto text-[11px] tabular-nums opacity-85" style={meta}>
            {formatDue(data.due_at)}
          </span>
        )}
      </div>
      <div className="flex items-start gap-3 px-5 pb-3 pt-2">
        <div
          className={cn(
            "flex-1 text-[15px] leading-snug",
            completed && "line-through opacity-60",
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
