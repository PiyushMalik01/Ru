"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

export type InsightKind =
  | "routine_streak"
  | "routine_completion_rate"
  | "task_completion_rate"
  | "activity_count";

export interface InsightCardData {
  kind: InsightKind;
  title?: string;
  // routine_streak
  streak?: number;
  routine_title?: string;
  // *_completion_rate
  rate?: number; // 0..1 or 0..100
  // activity_count
  count?: number;
  category?: string;
  period?: string;
}

function clampPct(v: number): number {
  const pct = v <= 1 ? v * 100 : v;
  return Math.max(0, Math.min(100, Math.round(pct)));
}

export function InsightCard({ data }: { data: InsightCardData }) {
  const [open, setOpen] = useState(false);

  return (
    <button
      type="button"
      onClick={() => setOpen((v) => !v)}
      className={cn(
        "block w-full rounded-xl border border-border bg-card text-left transition-colors",
        "hover:border-[rgba(255,255,255,0.16)]"
      )}
    >
      <div className="px-4 py-4">
        <InsightBody data={data} />
      </div>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18, ease: [0.4, 0, 0.2, 1] }}
            className="overflow-hidden"
          >
            <div className="border-t border-border px-4 py-2.5">
              <div className="flex items-center justify-between font-mono text-[11px] uppercase tracking-wide text-muted-foreground">
                <span>{labelFor(data.kind)}</span>
                <span>{data.period ?? "—"}</span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </button>
  );
}

function labelFor(kind: InsightKind): string {
  switch (kind) {
    case "routine_streak":
      return "streak";
    case "routine_completion_rate":
      return "routine completion";
    case "task_completion_rate":
      return "task completion";
    case "activity_count":
      return "activity";
  }
}

function InsightBody({ data }: { data: InsightCardData }) {
  if (data.kind === "routine_streak") {
    const streak = Math.max(0, data.streak ?? 0);
    return (
      <div className="flex items-baseline justify-between gap-4">
        <div className="min-w-0">
          <div className="font-mono text-[42px] font-light leading-none tracking-tight tabular-nums">
            {streak}
          </div>
          <div className="mt-2 truncate text-[14px] font-medium leading-tight">
            {data.routine_title ?? data.title ?? "current streak"}
          </div>
        </div>
        <div className="shrink-0 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
          {streak === 1 ? "day" : "days"}
        </div>
      </div>
    );
  }

  if (data.kind === "routine_completion_rate" || data.kind === "task_completion_rate") {
    const pct = clampPct(data.rate ?? 0);
    const label =
      data.title ??
      (data.kind === "routine_completion_rate" ? "routines completed" : "tasks completed");
    return (
      <div>
        <div className="flex items-baseline justify-between gap-4">
          <div className="font-mono text-[42px] font-light leading-none tracking-tight tabular-nums">
            {pct}
            <span className="ml-1 text-[18px] text-muted-foreground">%</span>
          </div>
          <div className="shrink-0 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
            {data.period ?? "this week"}
          </div>
        </div>
        <div className="mt-3 truncate text-[13px] text-muted-foreground">{label}</div>
        <div className="mt-3 h-px w-full overflow-hidden rounded-full bg-[rgba(255,255,255,0.08)]">
          <div
            className="h-px bg-success transition-all"
            style={{ width: `${pct}%` }}
            aria-hidden
          />
        </div>
      </div>
    );
  }

  // activity_count
  const count = Math.max(0, data.count ?? 0);
  return (
    <div className="flex items-baseline justify-between gap-4">
      <div className="min-w-0">
        <div className="font-mono text-[42px] font-light leading-none tracking-tight tabular-nums">
          {count}
        </div>
        <div className="mt-2 truncate text-[14px] font-medium leading-tight">
          {data.category ? `${data.category}` : data.title ?? "activities"}
        </div>
      </div>
      <div className="shrink-0 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
        {data.period ?? "this week"}
      </div>
    </div>
  );
}
