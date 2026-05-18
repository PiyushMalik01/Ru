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
  streak?: number;
  routine_title?: string;
  rate?: number;
  count?: number;
  category?: string;
  period?: string;
}

function clampPct(v: number): number {
  const pct = v <= 1 ? v * 100 : v;
  return Math.max(0, Math.min(100, Math.round(pct)));
}

function labelFor(kind: InsightKind): string {
  switch (kind) {
    case "routine_streak":            return "streak";
    case "routine_completion_rate":   return "routine completion";
    case "task_completion_rate":      return "task completion";
    case "activity_count":            return "activity";
  }
}

// Full teal tile, dark type. Big metric is the hero — Fraunces.
export function InsightCard({ data }: { data: InsightCardData }) {
  const [open, setOpen] = useState(false);

  return (
    <button
      type="button"
      onClick={() => setOpen((v) => !v)}
      className={cn(
        "block w-full overflow-hidden rounded-2xl text-left transition-transform",
        "hover:-translate-y-0.5"
      )}
      style={{
        background: "var(--entity-insight)",
        color: "var(--entity-insight-fg)",
      }}
    >
      <div className="px-5 py-4">
        <div className="mb-3 flex items-center gap-2">
          <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] opacity-75">
            insight · {labelFor(data.kind)}
          </span>
        </div>
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
            <div className="border-t border-black/15 px-5 py-3 font-mono text-[11px] uppercase tracking-wide opacity-80">
              {data.period ?? "—"}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </button>
  );
}

function InsightBody({ data }: { data: InsightCardData }) {
  if (data.kind === "routine_streak") {
    const streak = Math.max(0, data.streak ?? 0);
    return (
      <div className="flex items-baseline justify-between gap-4">
        <div className="min-w-0">
          <div className="font-display text-[60px] leading-[0.85] tracking-tight tabular-nums">
            {streak}
          </div>
          <div className="mt-2 truncate text-[14.5px] font-medium leading-tight">
            {data.routine_title ?? data.title ?? "current streak"}
          </div>
        </div>
        <div className="shrink-0 font-mono text-[10px] uppercase tracking-[0.16em] opacity-75">
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
          <div className="font-display text-[60px] leading-[0.85] tracking-tight tabular-nums">
            {pct}
            <span className="ml-1 text-[22px] opacity-65">%</span>
          </div>
          <div className="shrink-0 font-mono text-[10px] uppercase tracking-[0.16em] opacity-75">
            {data.period ?? "this week"}
          </div>
        </div>
        <div className="mt-3 truncate text-[13px] opacity-80">{label}</div>
        <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-black/15">
          <div className="h-full bg-black/70 transition-all" style={{ width: `${pct}%` }} aria-hidden />
        </div>
      </div>
    );
  }

  const count = Math.max(0, data.count ?? 0);
  return (
    <div className="flex items-baseline justify-between gap-4">
      <div className="min-w-0">
        <div className="font-display text-[56px] leading-[0.85] tracking-tight tabular-nums">
          {count}
        </div>
        <div className="mt-2 truncate text-[14.5px] font-medium leading-tight">
          {data.category ? `${data.category}` : data.title ?? "activities"}
        </div>
      </div>
      <div className="shrink-0 font-mono text-[10px] uppercase tracking-[0.16em] opacity-75">
        {data.period ?? "this week"}
      </div>
    </div>
  );
}
