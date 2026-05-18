"use client";

import { useTransition, useState } from "react";
import { CheckCircle2, Circle } from "lucide-react";
import { cn } from "@/lib/utils";
import { toggleRoutineToday } from "@/app/(app)/routines/actions";
import { StreakStrip } from "./streak-strip";

interface RoutineRowProps {
  id: string;
  title: string;
  frequency: "daily" | "weekdays" | "weekly" | "custom";
  timeOfDay: string | null;
  streak: number;
  todayCompleted: boolean;
  lastSevenDays: { date: string; completed: boolean }[];
}

function formatTime(t: string | null): string | null {
  if (!t) return null;
  // t is "HH:MM:SS" or "HH:MM"
  const [hStr, mStr] = t.split(":");
  const h = parseInt(hStr, 10);
  const m = parseInt(mStr ?? "0", 10);
  if (Number.isNaN(h)) return t;
  const period = h >= 12 ? "pm" : "am";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  if (!m) return `${h12}${period}`;
  return `${h12}:${m.toString().padStart(2, "0")}${period}`;
}

export function RoutineRow({
  id,
  title,
  frequency,
  timeOfDay,
  streak,
  todayCompleted,
  lastSevenDays,
}: RoutineRowProps) {
  const [optimisticDone, setOptimisticDone] = useState(todayCompleted);
  const [pending, startTransition] = useTransition();

  // Reflect optimistic update in the strip — last entry is today.
  const displayDays = lastSevenDays.map((d, i) =>
    i === lastSevenDays.length - 1 ? { ...d, completed: optimisticDone } : d
  );

  // Optimistic streak: bump up if we just completed and it wasn't before;
  // drop to (streak - 1) on un-toggle if today previously counted.
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
      if (!res.ok) {
        // Revert on failure
        setOptimisticDone((v) => !v);
      }
    });
  }

  const timeStr = formatTime(timeOfDay);

  return (
    <div
      className={cn(
        "group flex items-center gap-5 border-b border-[rgba(255,255,255,0.05)] py-5",
        "last:border-b-0"
      )}
    >
      {/* Streak number — the visual anchor */}
      <div className="flex w-14 shrink-0 flex-col items-start">
        <span
          className={cn(
            "font-mono text-[32px] font-light leading-none tracking-tight tabular-nums",
            displayStreak === 0 && "text-muted-foreground/60"
          )}
        >
          {displayStreak}
        </span>
        <span className="mt-1.5 font-mono text-[9px] uppercase tracking-[0.16em] text-muted-foreground">
          day streak
        </span>
      </div>

      {/* Title + meta */}
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2.5">
          <span
            className={cn(
              "truncate text-[15px] font-medium leading-tight",
              optimisticDone && "text-muted-foreground"
            )}
          >
            {title}
          </span>
        </div>
        <div className="mt-1.5 flex items-center gap-3 font-mono text-[10px] lowercase tracking-[0.08em] text-muted-foreground">
          <span>{frequency}</span>
          {timeStr && (
            <>
              <span className="opacity-30">·</span>
              <span>{timeStr}</span>
            </>
          )}
        </div>
      </div>

      {/* 7-day strip */}
      <StreakStrip days={displayDays} />

      {/* Toggle */}
      <button
        type="button"
        onClick={onToggle}
        disabled={pending}
        aria-label={optimisticDone ? "Mark as not done today" : "Mark as done today"}
        className={cn(
          "shrink-0 transition-opacity",
          pending && "opacity-50",
          "hover:opacity-100"
        )}
      >
        {optimisticDone ? (
          <CheckCircle2 className="h-[22px] w-[22px] text-success" strokeWidth={1.5} />
        ) : (
          <Circle
            className="h-[22px] w-[22px] text-muted-foreground/60 transition-colors hover:text-foreground"
            strokeWidth={1.5}
          />
        )}
      </button>
    </div>
  );
}
