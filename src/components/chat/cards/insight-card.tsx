"use client";

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { CardActions, CardLabel } from "./task-card";

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
  return (
    <div
      className="block w-full overflow-hidden rounded-2xl transition-transform hover:-translate-y-0.5"
      style={{
        background: "var(--entity-insight)",
        color: "var(--entity-insight-fg)",
      }}
    >
      <div className="px-5 pt-4">
        <CardLabel>insight · {labelFor(data.kind)}</CardLabel>
      </div>
      <div className="px-5 pb-3 pt-3">
        <InsightBody data={data} />
      </div>

      <CardActions>
        <Link
          href="/insights"
          className="inline-flex items-center gap-1.5 rounded-full bg-black/85 px-3 py-1.5 text-[11.5px] text-white transition-colors hover:bg-black"
          style={{ fontVariationSettings: "'wght' 580, 'wdth' 96" }}
        >
          open insights
          <ArrowUpRight className="h-3 w-3" strokeWidth={2.25} />
        </Link>
        {data.period && (
          <span
            className="ml-auto text-[10.5px] uppercase tracking-[0.16em] opacity-70"
            style={{ fontVariationSettings: "'wght' 580, 'wdth' 100" }}
          >
            {data.period}
          </span>
        )}
      </CardActions>
    </div>
  );
}

function InsightBody({ data }: { data: InsightCardData }) {
  if (data.kind === "routine_streak") {
    const streak = Math.max(0, data.streak ?? 0);
    return (
      <div className="flex items-baseline justify-between gap-4">
        <div className="min-w-0">
          <div
            className="font-display text-[60px] leading-[0.85] tracking-tight tabular-nums"
            style={{ fontVariationSettings: "'wght' 620, 'opsz' 144" }}
          >
            {streak}
          </div>
          <div
            className="mt-2 truncate text-[14.5px] leading-tight"
            style={{ fontVariationSettings: "'wght' 580, 'wdth' 96" }}
          >
            {data.routine_title ?? data.title ?? "current streak"}
          </div>
        </div>
        <div
          className="shrink-0 text-[10px] uppercase tracking-[0.16em] opacity-75"
          style={{ fontVariationSettings: "'wght' 580, 'wdth' 100" }}
        >
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
          <div
            className="font-display text-[60px] leading-[0.85] tracking-tight tabular-nums"
            style={{ fontVariationSettings: "'wght' 620, 'opsz' 144" }}
          >
            {pct}
            <span className="ml-1 text-[22px] opacity-65">%</span>
          </div>
          <div
            className="shrink-0 text-[10px] uppercase tracking-[0.16em] opacity-75"
            style={{ fontVariationSettings: "'wght' 580, 'wdth' 100" }}
          >
            {data.period ?? "this week"}
          </div>
        </div>
        <div className="mt-3 truncate text-[13px] opacity-80">{label}</div>
        <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-black/15">
          <div
            className="h-full bg-black/70 transition-all"
            style={{ width: `${pct}%` }}
            aria-hidden
          />
        </div>
      </div>
    );
  }

  const count = Math.max(0, data.count ?? 0);
  return (
    <div className="flex items-baseline justify-between gap-4">
      <div className="min-w-0">
        <div
          className="font-display text-[56px] leading-[0.85] tracking-tight tabular-nums"
          style={{ fontVariationSettings: "'wght' 620, 'opsz' 144" }}
        >
          {count}
        </div>
        <div
          className="mt-2 truncate text-[14.5px] leading-tight"
          style={{ fontVariationSettings: "'wght' 580, 'wdth' 96" }}
        >
          {data.category ? `${data.category}` : data.title ?? "activities"}
        </div>
      </div>
      <div
        className="shrink-0 text-[10px] uppercase tracking-[0.16em] opacity-75"
        style={{ fontVariationSettings: "'wght' 580, 'wdth' 100" }}
      >
        {data.period ?? "this week"}
      </div>
    </div>
  );
}
