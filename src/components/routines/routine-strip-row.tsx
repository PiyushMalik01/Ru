"use client";

import { useState, useTransition } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { toggleRoutineToday } from "@/app/(app)/routines/actions";

interface Props {
  id: string;
  title: string;
  frequency: "daily" | "weekdays" | "weekly" | "custom";
  timeOfDay: string | null;
  streak: number;
  todayCompleted: boolean;
  lastSevenDays: { date: string; completed: boolean }[];
  origin?: "user_declared" | "auto_detected";
  isLast?: boolean;
}

function formatTime(t: string | null): string | null {
  if (!t) return null;
  const [hStr, mStr] = t.split(":");
  const h = parseInt(hStr, 10);
  const m = parseInt(mStr ?? "0", 10);
  if (Number.isNaN(h)) return t;
  const period = h >= 12 ? "pm" : "am";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  if (!m) return `${h12}${period}`;
  return `${h12}:${m.toString().padStart(2, "0")}${period}`;
}

export function RoutineStripRow({
  id,
  title,
  frequency,
  timeOfDay,
  streak,
  todayCompleted,
  lastSevenDays,
  origin = "user_declared",
  isLast = false,
}: Props) {
  const [optimisticDone, setOptimisticDone] = useState(todayCompleted);
  const [pending, startTransition] = useTransition();

  const displayDays = lastSevenDays.map((d, i) =>
    i === lastSevenDays.length - 1 ? { ...d, completed: optimisticDone } : d,
  );

  const displayStreak = optimisticDone
    ? todayCompleted
      ? streak
      : streak + 1
    : todayCompleted
      ? Math.max(0, streak - 1)
      : streak;

  function onToggle() {
    setOptimisticDone((v) => !v);
    startTransition(async () => {
      const res = await toggleRoutineToday(id);
      if (!res.ok) setOptimisticDone((v) => !v);
    });
  }

  const timeStr = formatTime(timeOfDay);

  return (
    <div
      className={cn(
        "group relative flex items-center gap-4 py-4 pr-2 pl-4 sm:gap-5 sm:pl-5",
        !isLast && "border-b border-[var(--hairline-soft)]",
      )}
    >
      <span
        aria-hidden
        className="absolute top-3 bottom-3 left-0 w-[3px] rounded-full"
        style={{
          background: optimisticDone
            ? "var(--entity-routine)"
            : "color-mix(in srgb, var(--entity-routine) 55%, transparent)",
        }}
      />

      <div className="flex w-12 shrink-0 flex-col items-start sm:w-14">
        <span
          className={cn(
            "font-display leading-none tabular-nums",
            displayStreak === 0 && "text-muted-foreground/55",
          )}
          style={{
            fontSize: "clamp(26px, 3.2vw, 32px)",
            fontVariationSettings: "'wght' 580, 'opsz' 96",
            letterSpacing: "-0.025em",
          }}
        >
          {displayStreak}
        </span>
        <span
          className="mt-1 font-mono text-[9px] uppercase tracking-[0.18em] text-muted-foreground"
          style={{ fontVariationSettings: "'wght' 600, 'wdth' 100" }}
        >
          day
        </span>
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2.5">
          <span
            className={cn(
              "truncate text-[15px] leading-tight",
              optimisticDone && "text-muted-foreground",
            )}
            style={{ fontVariationSettings: "'wght' 540, 'wdth' 100" }}
          >
            {title}
          </span>
          {origin === "auto_detected" && (
            <span
              title="ru noticed this pattern"
              className="shrink-0 rounded-full px-1.5 py-[1px] font-mono text-[9px] uppercase tracking-[0.16em]"
              style={{
                background: "var(--entity-insight)",
                color: "var(--entity-insight-fg)",
                fontVariationSettings: "'wght' 640, 'wdth' 100",
              }}
            >
              noticed
            </span>
          )}
        </div>
        <div
          className="mt-1.5 flex items-center gap-2.5 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground"
          style={{ fontVariationSettings: "'wght' 540, 'wdth' 96" }}
        >
          <span>{frequency}</span>
          {timeStr && (
            <>
              <span className="opacity-40">·</span>
              <span className="tabular-nums">{timeStr}</span>
            </>
          )}
          {displayStreak > 0 && (
            <>
              <span className="opacity-40">·</span>
              <span className="tabular-nums">
                streak {displayStreak.toString().padStart(2, "0")}
              </span>
            </>
          )}
        </div>
      </div>

      <div
        className="hidden shrink-0 items-end gap-[3px] sm:flex"
        aria-hidden
      >
        {displayDays.map((d, i) => {
          const isToday = i === displayDays.length - 1;
          return (
            <span
              key={d.date}
              className="w-[3px] rounded-full"
              style={{
                height: 20,
                background: d.completed
                  ? "var(--entity-routine)"
                  : isToday
                    ? "var(--hairline-strong)"
                    : "var(--hairline)",
              }}
            />
          );
        })}
      </div>

      <button
        type="button"
        onClick={onToggle}
        disabled={pending}
        aria-label={
          optimisticDone ? "mark not done today" : "mark done today"
        }
        className={cn(
          "ml-1 inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 font-mono text-[10.5px] uppercase tracking-[0.16em] transition-all",
          pending && "opacity-50",
        )}
        style={
          optimisticDone
            ? {
                background: "var(--entity-routine)",
                color: "var(--entity-routine-fg)",
                fontVariationSettings: "'wght' 640, 'wdth' 100",
              }
            : {
                background: "transparent",
                color: "var(--foreground)",
                boxShadow: "inset 0 0 0 1px var(--hairline-strong)",
                fontVariationSettings: "'wght' 600, 'wdth' 100",
              }
        }
      >
        <Check
          className="h-3 w-3"
          strokeWidth={optimisticDone ? 3 : 2}
        />
        {optimisticDone ? "done today" : "mark today"}
      </button>
    </div>
  );
}
