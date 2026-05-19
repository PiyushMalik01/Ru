// Flat row for /routines — matches the RoutineRow aesthetic on purpose so
// trackers feel like a peer of routines, not a louder section.
//
// Layout: hero number · name + meta · 7-day strip · today-tick
//   - The hero shows the latest entry value (or count if there's no numeric
//     primary field).
//   - The 7-day strip lights up for days the user logged an entry.
//   - The "today" tick is decorative state — clicking the row navigates to
//     the detail page where the user can actually log. (Logging from this
//     row would need a value form; not worth the complexity here.)

import Link from "next/link";
import { CheckCircle2, Circle } from "lucide-react";
import type {
  Tracker,
  TrackerEntry,
  TrackerStats,
  TrackerField,
} from "@/lib/queries/trackers";
import { cn } from "@/lib/utils";

interface Props {
  tracker: Tracker;
  stats: TrackerStats;
  recent: TrackerEntry[];
  primary: TrackerField | null;
}

export function TrackerRow({ tracker, stats, recent, primary }: Props) {
  // Latest numeric value for the hero — fall back to entry count.
  let heroValue: string;
  let heroLabel: string;
  if (primary && recent.length > 0) {
    const lastVal = recent[0]?.values?.[primary.key];
    if (typeof lastVal === "number") {
      heroValue = formatNum(lastVal);
      heroLabel = `last ${primary.label.toLowerCase()}${primary.unit ? " · " + primary.unit : ""}`;
    } else {
      heroValue = stats.entryCount.toString();
      heroLabel = stats.entryCount === 1 ? "entry" : "entries";
    }
  } else {
    heroValue = stats.entryCount.toString();
    heroLabel = stats.entryCount === 1 ? "entry" : "entries";
  }

  // Build the last-7-days mask. entered_at dates, latest 30 entries is enough.
  const today = new Date();
  const days: { date: string; completed: boolean }[] = [];
  const loggedDates = new Set(
    recent.map((e) => e.entered_at.slice(0, 10)),
  );
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const iso = d.toISOString().slice(0, 10);
    days.push({ date: iso, completed: loggedDates.has(iso) });
  }

  const loggedToday = days[days.length - 1].completed;

  // Field labels strung together — keeps the sheet feel without a real grid.
  const fieldsLine = tracker.fields
    .slice(0, 4)
    .map((f) => f.label.toLowerCase())
    .join(" · ");

  return (
    <Link
      href={`/trackers/${tracker.id}`}
      className={cn(
        "group flex items-center gap-5 border-b border-[var(--hairline-soft)] py-5 transition-colors",
        "last:border-b-0 hover:bg-[var(--secondary)]/30",
      )}
    >
      {/* Hero number — the visual anchor, matches RoutineRow's streak slot */}
      <div className="flex w-14 shrink-0 flex-col items-start">
        <span
          className={cn(
            "font-mono text-[32px] font-light leading-none tracking-tight tabular-nums",
            heroValue === "0" && "text-muted-foreground/60",
          )}
        >
          {heroValue}
        </span>
        <span className="mt-1.5 font-mono text-[9px] uppercase tracking-[0.16em] text-muted-foreground">
          {heroLabel}
        </span>
      </div>

      {/* Title + columns line */}
      <div className="min-w-0 flex-1">
        <div className="truncate text-[15px] font-medium leading-tight text-foreground">
          {tracker.name}
        </div>
        <div className="mt-1.5 flex items-center gap-3 font-mono text-[10px] lowercase tracking-[0.08em] text-muted-foreground">
          {fieldsLine || <span>no columns yet</span>}
          {stats.streakDays > 1 && (
            <>
              <span className="opacity-30">·</span>
              <span>{stats.streakDays}-day streak</span>
            </>
          )}
        </div>
      </div>

      {/* 7-day strip — filled = a day with at least one entry */}
      <div className="flex shrink-0 items-end gap-[3px]" aria-hidden>
        {days.map((d, i) => {
          const isToday = i === days.length - 1;
          return (
            <span
              key={d.date}
              className={cn(
                "h-4 w-[3px] rounded-full transition-colors",
                d.completed
                  ? "bg-success"
                  : isToday
                    ? "bg-[var(--hairline-strong)]"
                    : "bg-[var(--hairline-soft)]",
              )}
            />
          );
        })}
      </div>

      {/* Today tick — state indicator. Clicking the row navigates to detail
          where the user can log (we don't try to inline-log here because the
          row would need a multi-field form). */}
      <span
        aria-label={loggedToday ? "Logged today" : "No entry today"}
        className="shrink-0"
      >
        {loggedToday ? (
          <CheckCircle2
            className="h-[22px] w-[22px] text-success"
            strokeWidth={1.5}
          />
        ) : (
          <Circle
            className="h-[22px] w-[22px] text-muted-foreground/60 transition-colors group-hover:text-foreground"
            strokeWidth={1.5}
          />
        )}
      </span>
    </Link>
  );
}

function formatNum(n: number): string {
  if (Number.isInteger(n)) return n.toString();
  if (Math.abs(n) >= 100) return n.toFixed(0);
  return n.toFixed(1);
}
