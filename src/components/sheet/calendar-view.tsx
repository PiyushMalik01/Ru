"use client";

// CalendarView — the week/day grid for the Sheet's calendar lens.
//
// Layout:
//   Header strip: weekday labels + dates + range navigation + "today" pill
//   Body: a single 13-hour vertical column (7am → 8pm) per visible day. Each
//     entity sits at its anchor time, painted in its entity color, height
//     proportional to duration (or a minimum chunky pill).
//
// Visual rules:
//   - Cobalt for tasks, lime for routines, coral for reminders, magenta for
//     activities. Color is the substance.
//   - Today's column gets a faint tint + the live now-line ticks across.
//   - Click a block → popover with detail + jump-to-edit affordance.
//   - Chunky 14px-radius blocks; no hairlines inside cells.

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

// Visible hour band on the grid. Most users live in 7am→8pm; we anchor here
// to keep blocks readable. (Items outside the band still get rendered at the
// edge with a clipped indicator.)
const START_HOUR = 6;
const END_HOUR = 22;
const HOUR_COUNT = END_HOUR - START_HOUR;
const HOUR_HEIGHT_PX = 56;

interface Props {
  items: CalendarItem[];
  /** Anchor date — start of the visible range. */
  anchor: Date;
  /** "week" shows 7 columns, "day" shows 1 wide column with hour labels. */
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

  // Bucket items by day for cheap render.
  const itemsByDay = useMemo(() => {
    const map = new Map<string, CalendarItem[]>();
    for (const d of days) map.set(d.toDateString(), []);
    for (const item of items) {
      const t = new Date(item.whenIso);
      if (t < visibleStart || t > visibleEnd) continue;
      const key = t.toDateString();
      if (!map.has(key)) continue;
      map.get(key)!.push(item);
    }
    return map;
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
      <div className="flex items-center justify-between pb-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => nav(-1)}
            aria-label="Previous"
            className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
          <span className="font-display text-[18px] leading-none">{headerLabel}</span>
          <button
            type="button"
            onClick={() => nav(1)}
            aria-label="Next"
            className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
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

      {/* Header row */}
      <div
        className="grid border-b border-[var(--hairline)]"
        style={{
          gridTemplateColumns: `56px repeat(${days.length}, minmax(0, 1fr))`,
        }}
      >
        <div />
        {days.map((d) => {
          const isToday = isSameDay(d, today);
          return (
            <div
              key={d.toISOString()}
              className={cn(
                "flex flex-col items-center justify-end gap-1 py-3",
                isToday && "text-foreground"
              )}
            >
              <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                {format(d, "EEE")}
              </div>
              <div
                className={cn(
                  "font-display text-[20px] leading-none tabular-nums",
                  isToday && "rounded-full bg-foreground px-2 py-1 text-[14px] text-background"
                )}
              >
                {format(d, isToday ? "d" : "d")}
              </div>
            </div>
          );
        })}
      </div>

      {/* Time grid */}
      <div
        className="relative grid"
        style={{
          gridTemplateColumns: `56px repeat(${days.length}, minmax(0, 1fr))`,
        }}
      >
        {/* Hour labels — left column */}
        <div className="flex flex-col">
          {Array.from({ length: HOUR_COUNT }, (_, i) => {
            const hour = START_HOUR + i;
            return (
              <div
                key={hour}
                className="flex items-start justify-end pr-2 pt-2 font-mono text-[10px] tabular-nums text-muted-foreground"
                style={{ height: HOUR_HEIGHT_PX }}
              >
                {format(new Date(2000, 0, 1, hour), "h a").toLowerCase()}
              </div>
            );
          })}
        </div>

        {/* Day columns */}
        {days.map((d, dayIdx) => {
          const dayItems = itemsByDay.get(d.toDateString()) ?? [];
          const isToday = isSameDay(d, today);
          const nowOffset = isToday ? computeNowOffset(today) : null;

          return (
            <div
              key={d.toISOString()}
              className={cn(
                "relative border-l border-[var(--hairline-soft)]",
                isToday && "bg-[var(--entity-routine)]/[0.04]",
                dayIdx === 0 && "border-l-[var(--hairline)]"
              )}
              style={{ height: HOUR_HEIGHT_PX * HOUR_COUNT }}
            >
              {/* Hour grid lines */}
              {Array.from({ length: HOUR_COUNT }, (_, i) => (
                <div
                  key={i}
                  className={cn(
                    "absolute inset-x-0 border-t",
                    i === 0
                      ? "border-transparent"
                      : "border-[var(--hairline-soft)]"
                  )}
                  style={{ top: i * HOUR_HEIGHT_PX }}
                />
              ))}

              {/* Items */}
              {dayItems.map((item) => {
                const placement = computePlacement(item);
                if (!placement) return null;
                return (
                  <ItemBlock
                    key={`${item.kind}-${item.id}`}
                    item={item}
                    top={placement.top}
                    height={placement.height}
                  />
                );
              })}

              {/* Live "now" line on today's column */}
              {nowOffset !== null && (
                <div
                  aria-hidden
                  className="absolute inset-x-0 z-20"
                  style={{ top: nowOffset }}
                >
                  <div className="relative">
                    <span className="absolute -left-1 top-1/2 h-2 w-2 -translate-y-1/2 rounded-full bg-[var(--entity-task)] shadow-[0_0_0_3px_var(--background)]" />
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

function computePlacement(item: CalendarItem): { top: number; height: number } | null {
  const t = new Date(item.whenIso);
  const hour = t.getHours() + t.getMinutes() / 60;
  // Clip outside-the-band items to the edges so they're still visible.
  let clampedHour = hour;
  if (hour < START_HOUR) clampedHour = START_HOUR;
  if (hour >= END_HOUR) clampedHour = END_HOUR - 0.25;
  const top = (clampedHour - START_HOUR) * HOUR_HEIGHT_PX;
  // Default block: 32px (≈30 min). Activities + tasks with duration get scaled.
  const minutes = item.durationMinutes ?? 30;
  const height = Math.max(28, (minutes / 60) * HOUR_HEIGHT_PX);
  return { top, height };
}

function ItemBlock({
  item,
  top,
  height,
}: {
  item: CalendarItem;
  top: number;
  height: number;
}) {
  const [open, setOpen] = useState(false);
  const t = new Date(item.whenIso);

  return (
    <div className="absolute inset-x-1" style={{ top, height }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "group block h-full w-full overflow-hidden rounded-[12px] px-2 py-1.5 text-left transition-transform",
          "hover:-translate-y-0.5 hover:shadow-md"
        )}
        style={{
          background: ENTITY_BG[item.kind],
          color: ENTITY_FG[item.kind],
        }}
      >
        <div className="font-mono text-[9.5px] uppercase tracking-[0.14em] opacity-75">
          {format(t, "h:mma").toLowerCase()}
        </div>
        <div className="mt-0.5 line-clamp-2 text-[12.5px] font-medium leading-tight">
          {item.title}
        </div>
      </button>

      {open && (
        <div className="absolute left-full top-0 z-30 ml-2 w-64 rounded-2xl border border-[var(--hairline)] bg-card p-4 text-card-foreground shadow-xl">
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
