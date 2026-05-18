"use client";

// CalendarView — proper week/day grid with overlap-aware layout.
//
// Visual rules:
//   - Hour labels sit AT each grid line (vertically centered on it), not below.
//   - Faint half-hour lines for rhythm; stronger lines at the hour.
//   - Concurrent items are packed side-by-side via a classic two-pass column
//     algorithm: events that overlap form a group; each group divides its
//     day column into N equal sub-columns and places each event in its
//     assigned column. No more stacked, overlapping blocks.
//   - Min block height 28px so a 15-min reminder still reads.
//   - Today's column has a stronger lime tint + the live "now" line.
//   - Click a block → popover with detail.

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  addDays,
  addWeeks,
  format,
  isSameDay,
  startOfWeek,
  startOfDay,
  endOfDay,
} from "date-fns";
import type { CalendarItem, CalendarItemKind } from "@/lib/queries/calendar";
import { cn } from "@/lib/utils";

const ENTITY_BG: Record<CalendarItemKind, string> = {
  task: "var(--entity-task)",
  routine: "var(--entity-routine)",
  reminder: "var(--entity-reminder)",
  activity: "var(--entity-activity)",
};
const ENTITY_FG: Record<CalendarItemKind, string> = {
  task: "var(--entity-task-fg)",
  routine: "var(--entity-routine-fg)",
  reminder: "var(--entity-reminder-fg)",
  activity: "var(--entity-activity-fg)",
};

const START_HOUR = 6;
const END_HOUR = 22;
const HOUR_COUNT = END_HOUR - START_HOUR;
const HOUR_HEIGHT_PX = 60;
const MIN_BLOCK_HEIGHT_PX = 28;

// Per-kind default duration in minutes (used when the item has no explicit one).
const DEFAULT_DURATION: Record<CalendarItemKind, number> = {
  task: 30,
  routine: 30,
  reminder: 20,
  activity: 30,
};

interface PlacedItem extends CalendarItem {
  startMin: number;     // minutes from midnight (clamped to band)
  endMin: number;
  column: number;
  totalColumns: number;
}

/**
 * Lays out a single day's items so concurrent events sit side-by-side.
 *
 * Algorithm:
 *   1. Compute each event's [startMin, endMin).
 *   2. Sort by startMin, then by endMin desc to keep longer-event packing stable.
 *   3. Group events that transitively overlap (one ends after the next starts).
 *   4. Within each group, greedily assign each event to the first column whose
 *      most-recent event ended at or before this event's start. Add a new
 *      column when none fits. totalColumns = the group's column count.
 *
 * Result: every event has (column, totalColumns); the renderer maps these to
 * left/width percentages inside the day column.
 */
function layoutDayItems(items: CalendarItem[]): PlacedItem[] {
  if (items.length === 0) return [];

  const sized = items.map((item) => {
    const t = new Date(item.whenIso);
    const startMin = t.getHours() * 60 + t.getMinutes();
    const dur = item.durationMinutes ?? DEFAULT_DURATION[item.kind];
    return { ...item, startMin, endMin: startMin + dur };
  });

  sized.sort((a, b) => a.startMin - b.startMin || b.endMin - a.endMin);

  // Group transitively-overlapping events.
  const groups: typeof sized[] = [];
  let group: typeof sized = [];
  let groupEnd = -1;
  for (const e of sized) {
    if (group.length === 0 || e.startMin < groupEnd) {
      group.push(e);
      groupEnd = Math.max(groupEnd, e.endMin);
    } else {
      groups.push(group);
      group = [e];
      groupEnd = e.endMin;
    }
  }
  if (group.length) groups.push(group);

  // Assign columns per group.
  const out: PlacedItem[] = [];
  for (const g of groups) {
    const columnEnds: number[] = [];
    const assigned: { item: typeof g[number]; column: number }[] = [];
    for (const e of g) {
      let col = columnEnds.findIndex((end) => end <= e.startMin);
      if (col === -1) {
        columnEnds.push(e.endMin);
        col = columnEnds.length - 1;
      } else {
        columnEnds[col] = e.endMin;
      }
      assigned.push({ item: e, column: col });
    }
    const totalColumns = columnEnds.length;
    for (const { item, column } of assigned) {
      out.push({ ...item, column, totalColumns });
    }
  }

  return out;
}

interface Props {
  items: CalendarItem[];
  anchor: Date;
  mode: "week" | "day";
  nowMs: number;
}

export function CalendarView({ items, anchor, mode, nowMs }: Props) {
  const router = useRouter();
  const search = useSearchParams();
  const today = new Date(nowMs);

  const days = useMemo(() => {
    if (mode === "day") return [startOfDay(anchor)];
    const monday = startOfWeek(anchor, { weekStartsOn: 1 });
    return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  }, [anchor, mode]);

  const visibleStart = days[0];
  const visibleEnd = endOfDay(days[days.length - 1]);

  // Bucket items by day, then layout each day's items independently.
  const placedByDay = useMemo(() => {
    const byDay = new Map<string, CalendarItem[]>();
    for (const d of days) byDay.set(d.toDateString(), []);
    for (const item of items) {
      const t = new Date(item.whenIso);
      if (t < visibleStart || t > visibleEnd) continue;
      const key = t.toDateString();
      if (!byDay.has(key)) continue;
      byDay.get(key)!.push(item);
    }
    const placed = new Map<string, PlacedItem[]>();
    for (const [key, dayItems] of byDay) {
      placed.set(key, layoutDayItems(dayItems));
    }
    return placed;
  }, [items, days, visibleStart, visibleEnd]);

  function nav(direction: -1 | 1) {
    const next = mode === "week" ? addWeeks(anchor, direction) : addDays(anchor, direction);
    const params = new URLSearchParams(search);
    params.set("date", format(next, "yyyy-MM-dd"));
    router.push(`?${params.toString()}`);
  }
  function goToday() {
    const params = new URLSearchParams(search);
    params.delete("date");
    const s = params.toString();
    router.push(s ? `?${s}` : "?");
  }
  function setMode(next: "week" | "day") {
    const params = new URLSearchParams(search);
    if (next === "week") params.delete("range");
    else params.set("range", "day");
    router.push(`?${params.toString()}`);
  }

  const headerLabel =
    mode === "week"
      ? `${format(days[0], "MMM d")} – ${format(days[6], "MMM d")}`
      : format(days[0], "EEEE, MMM d");

  return (
    <div className="mt-2 flex flex-col">
      {/* Range nav + view toggle */}
      <div className="flex items-center justify-between pb-4">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => nav(-1)}
            aria-label="Previous"
            className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
          <span className="font-display text-[22px] leading-none">{headerLabel}</span>
          <button
            type="button"
            onClick={() => nav(1)}
            aria-label="Next"
            className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={goToday}
            className="ml-2 rounded-full border border-[var(--hairline)] bg-[var(--card)] px-3 py-1 font-mono text-[10px] uppercase tracking-[0.16em] text-foreground transition-colors hover:bg-secondary"
          >
            today
          </button>
        </div>

        <div className="flex items-center gap-1 rounded-full border border-[var(--hairline)] bg-[var(--card)] p-0.5 font-mono text-[10px] uppercase tracking-[0.16em]">
          <button
            type="button"
            onClick={() => setMode("week")}
            className={cn(
              "rounded-full px-3 py-1 transition-colors",
              mode === "week"
                ? "bg-foreground text-background"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            week
          </button>
          <button
            type="button"
            onClick={() => setMode("day")}
            className={cn(
              "rounded-full px-3 py-1 transition-colors",
              mode === "day"
                ? "bg-foreground text-background"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            day
          </button>
        </div>
      </div>

      {/* Day-of-week header strip */}
      <div
        className="grid border-b border-[var(--hairline)]"
        style={{
          gridTemplateColumns: `64px repeat(${days.length}, minmax(0, 1fr))`,
        }}
      >
        <div />
        {days.map((d) => {
          const isToday = isSameDay(d, today);
          return (
            <div
              key={d.toISOString()}
              className="flex flex-col items-center justify-end gap-1 py-3"
            >
              <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                {format(d, "EEE")}
              </div>
              <div
                className={cn(
                  "font-display tabular-nums leading-none",
                  isToday
                    ? "rounded-full bg-foreground px-2.5 py-1 text-[15px] text-background"
                    : "text-[20px] text-foreground/85"
                )}
              >
                {format(d, "d")}
              </div>
            </div>
          );
        })}
      </div>

      {/* Time grid */}
      <div
        className="grid"
        style={{
          gridTemplateColumns: `64px repeat(${days.length}, minmax(0, 1fr))`,
        }}
      >
        {/* Hour-label rail — labels absolutely positioned at each line so they
            always center on the grid rule. */}
        <div className="relative" style={{ height: HOUR_HEIGHT_PX * HOUR_COUNT }}>
          {Array.from({ length: HOUR_COUNT + 1 }, (_, i) => {
            const hour = START_HOUR + i;
            if (i === 0 || i === HOUR_COUNT) return null;
            return (
              <div
                key={hour}
                className="absolute right-3 -translate-y-1/2 font-mono text-[10px] tabular-nums text-muted-foreground/65"
                style={{ top: i * HOUR_HEIGHT_PX }}
              >
                {format(new Date(2000, 0, 1, hour), "h a").toLowerCase()}
              </div>
            );
          })}
        </div>

        {/* Day columns */}
        {days.map((d, dayIdx) => {
          const dayItems = placedByDay.get(d.toDateString()) ?? [];
          const isToday = isSameDay(d, today);
          const nowOffset = isToday ? computeNowOffset(today) : null;

          return (
            <div
              key={d.toISOString()}
              className={cn(
                "relative border-l border-[var(--hairline-soft)]",
                isToday && "bg-[var(--entity-routine)]/[0.06]",
                dayIdx === 0 && "border-l-[var(--hairline)]"
              )}
              style={{ height: HOUR_HEIGHT_PX * HOUR_COUNT }}
            >
              {/* Hour + half-hour grid lines. */}
              {Array.from({ length: HOUR_COUNT }, (_, i) => (
                <div
                  key={`h${i}`}
                  className={cn(
                    "pointer-events-none absolute inset-x-0 border-t",
                    i === 0
                      ? "border-transparent"
                      : "border-[var(--hairline-soft)]"
                  )}
                  style={{ top: i * HOUR_HEIGHT_PX }}
                />
              ))}
              {Array.from({ length: HOUR_COUNT }, (_, i) => (
                <div
                  key={`hh${i}`}
                  className="pointer-events-none absolute inset-x-0 border-t border-dashed border-[var(--hairline-soft)]/60"
                  style={{ top: i * HOUR_HEIGHT_PX + HOUR_HEIGHT_PX / 2 }}
                />
              ))}

              {/* Items */}
              {dayItems.map((item) => (
                <ItemBlock key={`${item.kind}-${item.id}`} item={item} />
              ))}

              {/* Live "now" line on today's column */}
              {nowOffset !== null && (
                <div
                  aria-hidden
                  className="absolute inset-x-0 z-30"
                  style={{ top: nowOffset }}
                >
                  <div className="relative">
                    <span className="absolute -left-1 top-1/2 h-2.5 w-2.5 -translate-y-1/2 rounded-full bg-[var(--entity-task)] shadow-[0_0_0_3px_var(--background)]" />
                    <div className="h-px bg-[var(--entity-task)]" />
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function computeNowOffset(now: Date): number | null {
  const hour = now.getHours() + now.getMinutes() / 60;
  if (hour < START_HOUR || hour >= END_HOUR) return null;
  return (hour - START_HOUR) * HOUR_HEIGHT_PX;
}

function ItemBlock({ item }: { item: PlacedItem }) {
  const [open, setOpen] = useState(false);
  const t = new Date(item.whenIso);

  const startClamped = Math.max(item.startMin, START_HOUR * 60);
  const endClamped = Math.min(item.endMin, END_HOUR * 60);
  const top = ((startClamped - START_HOUR * 60) / 60) * HOUR_HEIGHT_PX;
  const heightRaw = ((endClamped - startClamped) / 60) * HOUR_HEIGHT_PX;
  const height = Math.max(MIN_BLOCK_HEIGHT_PX, heightRaw);

  // Side-by-side packing for overlapping events.
  const widthPct = 100 / item.totalColumns;
  const leftPct = item.column * widthPct;
  const compact = item.totalColumns >= 3 || height < 44;

  return (
    <div
      className="absolute z-10 pl-1 pr-1"
      style={{
        top,
        height,
        left: `${leftPct}%`,
        width: `${widthPct}%`,
      }}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "group flex h-full w-full flex-col items-stretch overflow-hidden rounded-[10px] px-2 py-1.5 text-left",
          "transition-[transform,box-shadow] hover:-translate-y-px hover:shadow-[0_6px_16px_-4px_rgba(0,0,0,0.18)]",
          "ring-1 ring-black/[0.04]"
        )}
        style={{
          background: ENTITY_BG[item.kind],
          color: ENTITY_FG[item.kind],
        }}
      >
        {compact ? (
          <span className="truncate text-[11.5px] font-medium leading-tight">
            {item.title}
          </span>
        ) : (
          <>
            <span className="font-mono text-[9.5px] uppercase tracking-[0.14em] opacity-70">
              {format(t, "h:mma").toLowerCase()}
            </span>
            <span className="mt-0.5 line-clamp-2 text-[12.5px] font-medium leading-tight">
              {item.title}
            </span>
          </>
        )}
      </button>

      {open && (
        <div
          className={cn(
            "absolute z-40 mt-1 w-64 rounded-2xl border border-[var(--hairline)] bg-card p-4 text-card-foreground shadow-xl",
            leftPct > 50 ? "right-0" : "left-0"
          )}
          style={{ top: height + 4 }}
        >
          <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            {item.kind} · {format(t, "EEE, MMM d · h:mma").toLowerCase()}
          </div>
          <div className="mt-2 text-[15px] font-medium leading-tight">{item.title}</div>
          {item.category && (
            <div className="mt-2 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              {item.category}
            </div>
          )}
          {item.status && (
            <div className="mt-2 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              status · {item.status}
            </div>
          )}
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="mt-3 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground transition-colors hover:text-foreground"
          >
            close
          </button>
        </div>
      )}
    </div>
  );
}
