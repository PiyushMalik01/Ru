"use client";

// TimelineView — horizontal gantt-style strip of plans across dates.
//
// Each row is a plan; each plan's bar spans from its earliest item to its
// latest. Markers along the bar show item density (entity-color dots). The
// header is a date axis with weekday labels and "today" highlighted.
//
// Pure render — no drag, no editing. Click a plan → /plans/[id].

import { useMemo } from "react";
import Link from "next/link";
import {
  addDays,
  differenceInCalendarDays,
  format,
  isSameDay,
  parseISO,
  startOfDay,
} from "date-fns";
import type { TimelinePlan } from "@/lib/queries/timeline";
import { cn } from "@/lib/utils";

const ENTITY_BG: Record<string, string> = {
  task: "var(--entity-task)",
  routine: "var(--entity-routine)",
  reminder: "var(--entity-reminder)",
  activity: "var(--entity-activity)",
};

const DAY_WIDTH_PX = 56;
const ROW_HEIGHT_PX = 56;

interface Props {
  plans: TimelinePlan[];
  nowMs: number;
}

export function TimelineView({ plans, nowMs }: Props) {
  const today = startOfDay(new Date(nowMs));

  // Compute the visible date window: the earliest plan start to the latest
  // plan end, clamped to a minimum of 14 days from today on either side.
  const { rangeStart, rangeEnd } = useMemo(() => {
    if (plans.length === 0) {
      const start = addDays(today, -7);
      const end = addDays(today, 21);
      return { rangeStart: start, rangeEnd: end };
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
    <div className="mt-2 flex flex-col overflow-x-auto">
      <div className="relative" style={{ width: totalWidth, minWidth: "100%" }}>
        {/* Date axis */}
        <div className="sticky top-0 z-10 flex border-b border-[var(--hairline)] bg-[var(--background)]">
          {days.map((d) => {
            const isToday = isSameDay(d, today);
            const isMonthStart = d.getDate() === 1;
            return (
              <div
                key={d.toISOString()}
                className={cn(
                  "flex flex-col items-center justify-end gap-1 pb-2",
                  isToday && "text-foreground",
                  isMonthStart && "border-l border-[var(--hairline)]"
                )}
                style={{ width: DAY_WIDTH_PX }}
              >
                {isMonthStart && (
                  <div className="absolute top-0 -translate-x-2 -translate-y-3 font-mono text-[9.5px] uppercase tracking-[0.18em] text-muted-foreground">
                    {format(d, "MMM")}
                  </div>
                )}
                <div className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-muted-foreground">
                  {format(d, "EEEEE")}
                </div>
                <div
                  className={cn(
                    "font-mono text-[11px] tabular-nums",
                    isToday
                      ? "rounded-full bg-foreground px-1.5 py-0.5 text-background"
                      : "text-foreground/80"
                  )}
                >
                  {format(d, "d")}
                </div>
              </div>
            );
          })}
        </div>

        {/* Today vertical line, spans all rows */}
        {todayOffset >= 0 && todayOffset < totalWidth && (
          <div
            aria-hidden
            className="pointer-events-none absolute z-0 w-px bg-[var(--entity-task)]/40"
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
            plans.map((plan, rowIdx) => {
              const start = startOfDay(parseISO(plan.startIso));
              const end = startOfDay(parseISO(plan.endIso));
              const left = differenceInCalendarDays(start, rangeStart) * DAY_WIDTH_PX;
              const span = Math.max(1, differenceInCalendarDays(end, start) + 1);
              const width = span * DAY_WIDTH_PX;
              const pct = plan.itemCount > 0 ? Math.round((plan.doneCount / plan.itemCount) * 100) : 0;

              return (
                <div
                  key={plan.id}
                  className="relative border-t border-[var(--hairline-soft)]"
                  style={{ height: ROW_HEIGHT_PX }}
                >
                  {/* Plan bar */}
                  <Link
                    href={`/plans/${plan.id}`}
                    className={cn(
                      "group absolute top-1/2 -translate-y-1/2 overflow-hidden rounded-full transition-transform",
                      "hover:-translate-y-[55%] hover:shadow-lg"
                    )}
                    style={{
                      left,
                      width: Math.max(DAY_WIDTH_PX - 8, width - 8),
                      marginLeft: 4,
                      height: 36,
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
                      <span className="truncate text-[13px] font-medium leading-tight">
                        {plan.title}
                      </span>
                      <span className="ml-auto shrink-0 font-mono text-[10px] tabular-nums opacity-80">
                        {plan.doneCount}/{plan.itemCount}
                      </span>
                    </div>
                  </Link>

                  {/* Item markers */}
                  {plan.markers.map((m, i) => {
                    const md = startOfDay(parseISO(m.dateIso));
                    const offset = differenceInCalendarDays(md, rangeStart) * DAY_WIDTH_PX;
                    return (
                      <span
                        key={i}
                        aria-hidden
                        className="absolute h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full"
                        style={{
                          left: offset + DAY_WIDTH_PX / 2,
                          top: rowIdx === 0 ? "20%" : "80%",
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
  );
}
