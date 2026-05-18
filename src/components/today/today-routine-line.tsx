"use client";

import { useState, useTransition } from "react";
import { cn } from "@/lib/utils";
import { toggleRoutineToday } from "@/app/(app)/routines/actions";

interface Props {
  id: string;
  title: string;
  timeOfDay: string | null;
  todayCompleted: boolean;
}

function formatTime(t: string | null): string {
  if (!t) return "anytime";
  // "07:00:00" → "7am"
  const [hStr, mStr] = t.split(":");
  const h = parseInt(hStr ?? "", 10);
  if (Number.isNaN(h)) return "anytime";
  const m = parseInt(mStr ?? "0", 10) || 0;
  const ampm = h < 12 ? "am" : "pm";
  const hour12 = ((h + 11) % 12) + 1;
  return m === 0 ? `${hour12}${ampm}` : `${hour12}:${m.toString().padStart(2, "0")}${ampm}`;
}

export function TodayRoutineLine({ id, title, timeOfDay, todayCompleted }: Props) {
  const [done, setDone] = useState(todayCompleted);
  const [pending, startTransition] = useTransition();

  return (
    <div className="group flex items-center gap-4 border-b border-[rgba(255,255,255,0.05)] py-3 last:border-b-0">
      <button
        type="button"
        onClick={() => {
          setDone((v) => !v);
          startTransition(async () => {
            const r = await toggleRoutineToday(id);
            if (!r.ok) setDone((v) => !v);
          });
        }}
        disabled={pending}
        aria-label={done ? "Mark routine undone" : "Mark routine done"}
        className={cn(
          "shrink-0 w-5 text-left font-mono text-[15px] leading-none transition-colors",
          done ? "text-success" : "text-muted-foreground/70 hover:text-foreground",
          pending && "opacity-50",
        )}
      >
        {done ? "☑" : "⟳"}
      </button>

      <span
        className={cn(
          "min-w-0 flex-1 truncate text-[14.5px] leading-tight",
          done && "text-muted-foreground line-through",
        )}
      >
        {title}
      </span>

      <span
        className={cn(
          "shrink-0 font-mono text-[11px] tabular-nums",
          done ? "text-muted-foreground/40 line-through" : "text-muted-foreground",
        )}
      >
        {formatTime(timeOfDay)}
      </span>
    </div>
  );
}
