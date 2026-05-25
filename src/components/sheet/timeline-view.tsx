"use client";

// TimelineView — horizontal gantt-style strip of plans across dates.
//
// Visual rules (post-redesign):
// - Range nav (prev/next/today) — matches CalendarView so the two date
//   views share one mental model.
// - Plan title floats ABOVE its bar when the bar is narrow (< 140 px),
//   instead of being clipped inside a 48-px pill.
// - Today anchor line + "today" label, soft tint to today's column.
// - Two-letter day abbreviations (mo/tu/we/th/fr/sa/su) so Tue ≠ Thu and
//   Sat ≠ Sun by sight alone.
// - Zero-item plans are filtered upstream (in /sheet page.tsx); this
//   component only deals with plans that actually carry items.

import { useMemo } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  addDays,
  addWeeks,
  differenceInCalendarDays,
  format,
  isSameDay,
  parseISO,
  startOfDay,
} from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { TimelinePlan } from "@/lib/queries/timeline";
import { cn } from "@/lib/utils";

const ENTITY_BG: Record<string, string> = {
  task: "var(--entity-task)",
  routine: "var(--entity-routine)",
  reminder: "var(--entity-reminder)",
  activity: "var(--entity-activity)",
};

const DAY_WIDTH_PX = 56;
const ROW_HEIGHT_PX = 64; // a touch taller — gives the title space when it floats above
const NARROW_BAR_THRESHOLD_PX = 140;

// Two-letter abbreviations so the eye can tell Tue from Thu, Sat from Sun.
const DAY_LETTERS = ["mo", "tu", "we", "th", "fr", "sa", "su"];
function dayAbbr(d: Date): string {
  // Mon = 1 in date-fns getDay (Sun = 0); we want Mon-first ordering.
  const idx = (d.getDay() + 6) % 7;
  return DAY_LETTERS[idx];
}

interface Props {
  plans: TimelinePlan[];
  nowMs: number;
}

export function TimelineView({ plans, nowMs }: Props) {
  const router = useRouter();
  const search = useSearchParams();
  const today = startOfDay(new Date(nowMs));

  function nav(direction: -1 | 1) {
    const next = addWeeks(today, direction);
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

  // Range: cover from min(plan starts, today - 7) to max(plan ends, today + 21).
  const { rangeStart, rangeEnd } = useMemo(() => {
    if (plans.length === 0) {
      return { rangeStart: addDays(today, -7), rangeEnd: addDays(today, 21) };
    }
    const allStarts = plans.map((p) => startOfDay(parseISO(p.startIso)));
    const allEnds = plans.map((p) => startOfDay(parseISO(p.endIso)));
    const earliest = allStarts.reduce((a, b) => (a < b ? a : b));
    const latest = allEnds.reduce((a, b) => (a > b ? a : b));
    const start = earliest < addDays(today, -7) ? earliest : addDays(today, -7);
    const end = latest > addDays(today, 14) ? addDays(latest, 3) : addDays(today, 21);
    return { rangeStart: start, rangeEnd: end };
  }, [plans, today]);

  const totalDays = differenceInCalendarDays(rangeEnd, rangeStart) + 1;
  const days = Array.from({ length: totalDays }, (_, i) => addDays(rangeStart, i));
  const totalWidth = totalDays * DAY_WIDTH_PX;
  const todayOffset = differenceInCalendarDays(today, rangeStart) * DAY_WIDTH_PX;

  return (
    <div className="mt-2 flex flex-col">
      {/* Range nav — matches calendar so the two date views feel like one
          interaction model. */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-4">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => nav(-1)}
            aria-label="Previous week"
            className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
          <span className="font-display text-[22px] leading-none lowercase">
            {plans.length === 0 ? "no plans yet" : `${plans.length} plan${plans.length === 1 ? "" : "s"}`}
          </span>
          <button
            type="button"
            onClick={() => nav(1)}
            aria-label="Next week"
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

        {/* Legend — the previous timeline gave the user dots with no key. */}
        <div className="flex items-center gap-3 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
          {(["task", "routine", "reminder", "activity"] as const).map((k) => (
            <span key={k} className="inline-flex items-center gap-1.5">
              <span
                aria-hidden
                className="inline-block h-1.5 w-1.5 rounded-full"
                style={{ background: ENTITY_BG[k] }}
              />
              {k}
            </span>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-[var(--hairline)] bg-[var(--card)]/40">
        <div className="relative" style={{ width: totalWidth, minWidth: "100%" }}>
          {/* Date axis */}
          <div className="sticky top-0 z-10 flex border-b border-[var(--hairline)] bg-[var(--card)]/95 backdrop-blur-sm">
            {days.map((d) => {
              const isToday = isSameDay(d, today);
              const isMonthStart = d.getDate() === 1;
              return (
                <div
                  key={d.toISOString()}
                  className={cn(
                    "flex flex-col items-center justify-end gap-1 py-2",
                    isToday ? "text-foreground" : "text-muted-foreground",
                    isMonthStart && "border-l border-[var(--hairline)]",
                  )}
                  style={{ width: DAY_WIDTH_PX }}
                >
                  {isMonthStart && (
                    <div
                      className="absolute top-1 -translate-x-2 font-mono text-[9.5px] uppercase tracking-[0.18em] text-muted-foreground"
                    >
                      {format(d, "MMM")}
                    </div>
                  )}
                  <div className="font-mono text-[9.5px] uppercase tracking-[0.14em]">
                    {dayAbbr(d)}
                  </div>
                  <div
                    className={cn(
                      "font-mono text-[11px] tabular-nums",
                      isToday
                        ? "rounded-full bg-foreground px-1.5 py-0.5 text-background"
                        : "",
                    )}
                  >
                    {format(d, "d")}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Today vertical line, spans all rows */}
          {todayOffset >= 0 && todayOffset < totalWidth && plans.length > 0 && (
            <div
              aria-hidden
              className="pointer-events-none absolute z-0 w-px bg-[var(--entity-task)]/35"
              style={{
                left: todayOffset + DAY_WIDTH_PX / 2,
                top: 56,
                height: plans.length * ROW_HEIGHT_PX,
              }}
            />
          )}

          {/* Plan rows */}
          <div className="relative">
            {plans.length === 0 ? (
              <div className="flex h-32 items-center justify-center text-muted-foreground">
                <p className="font-mono text-[12px] lowercase tracking-wide">
                  no plans yet — start one and items will land on the timeline.
                </p>
              </div>
            ) : (
              plans.map((plan) => {
                const start = startOfDay(parseISO(plan.startIso));
                const end = startOfDay(parseISO(plan.endIso));
                const left = differenceInCalendarDays(start, rangeStart) * DAY_WIDTH_PX;
                const span = Math.max(1, differenceInCalendarDays(end, start) + 1);
                const width = span * DAY_WIDTH_PX;
                const pct =
                  plan.itemCount > 0
                    ? Math.round((plan.doneCount / plan.itemCount) * 100)
                    : 0;
                const narrow = width < NARROW_BAR_THRESHOLD_PX;

                return (
                  <div
                    key={plan.id}
                    className="relative border-t border-[var(--hairline-soft)]"
                    style={{ height: ROW_HEIGHT_PX }}
                  >
                    {/* Title floats above narrow bars so it isn't clipped. */}
                    {narrow && (
                      <Link
                        href={`/plans/${plan.id}`}
                        className="absolute top-1.5 z-20 max-w-[200px] truncate font-mono text-[10.5px] uppercase tracking-[0.14em] text-foreground/85 transition-colors hover:text-foreground"
                        style={{ left: left + 4 }}
                      >
                        {plan.title}
                      </Link>
                    )}

                    {/* Plan bar */}
                    <Link
                      href={`/plans/${plan.id}`}
                      className={cn(
                        "group absolute overflow-hidden rounded-full transition-transform",
                        "hover:shadow-lg",
                      )}
                      style={{
                        left: left + 4,
                        width: Math.max(DAY_WIDTH_PX - 8, width - 8),
                        top: narrow ? 28 : 14,
                        height: 32,
                        background: "var(--entity-plan)",
                        color: "var(--entity-plan-fg)",
                      }}
                    >
                      {/* Progress fill */}
                      <div
                        aria-hidden
                        className="absolute inset-y-0 left-0 bg-black/15"
                        style={{ width: `${pct}%` }}
                      />
                      <div className="relative flex h-full items-center gap-2 px-3">
                        {!narrow && (
                          <span className="truncate text-[13px] font-medium leading-tight">
                            {plan.title}
                          </span>
                        )}
                        <span
                          className={cn(
                            "shrink-0 font-mono text-[10px] tabular-nums opacity-85",
                            !narrow && "ml-auto",
                          )}
                          style={{ fontVariationSettings: "'wght' 600, 'wdth' 100" }}
                        >
                          {plan.doneCount}/{plan.itemCount}
                        </span>
                      </div>
                    </Link>

                    {/* Item markers — entity-color dots along the bar */}
                    {plan.markers.map((m, i) => {
                      const md = startOfDay(parseISO(m.dateIso));
                      const offset =
                        differenceInCalendarDays(md, rangeStart) * DAY_WIDTH_PX;
                      return (
                        <span
                          key={i}
                          aria-hidden
                          className="absolute h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full"
                          style={{
                            left: offset + DAY_WIDTH_PX / 2,
                            top: narrow ? 52 : 50,
                            background: ENTITY_BG[m.kind] ?? "var(--foreground)",
                            boxShadow: "0 0 0 2px var(--background)",
                          }}
                        />
                      );
                    })}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
