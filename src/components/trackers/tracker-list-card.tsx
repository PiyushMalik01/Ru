// Link-card for the /routines Trackers section. Mirrors the Today bento
// aesthetic — saturated full-color tile, chunky rounded corner, hero number.

import Link from "next/link";
import { trackerColor } from "@/lib/trackers/color";
import type { Tracker, TrackerEntry, TrackerStats, TrackerField } from "@/lib/queries/trackers";
import { Sparkline } from "./sparkline";

interface Props {
  tracker: Tracker;
  stats: TrackerStats;
  recent: TrackerEntry[];
  primary: TrackerField | null;
}

export function TrackerListCard({ tracker, stats, recent, primary }: Props) {
  const color = trackerColor(tracker.id);
  const hero =
    primary && stats.primarySum !== null && stats.primaryAvg !== null
      ? primary.type === "duration"
        ? formatNum(stats.primaryAvg)
        : formatNum(stats.primaryAvg)
      : stats.entryCount.toString();

  const heroLabel =
    primary && stats.primaryAvg !== null
      ? `avg ${primary.label}${primary.unit ? " · " + primary.unit : ""}`
      : "entries";

  return (
    <Link
      href={`/trackers/${tracker.id}`}
      className="group block w-full overflow-hidden rounded-[28px] transition-transform hover:-translate-y-0.5"
      style={{ background: color.bg, color: color.fg }}
    >
      <div className="flex items-center gap-2 px-6 pt-5">
        <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] opacity-75">
          tracker
        </span>
        <span className="opacity-40">·</span>
        <span className="font-mono text-[10px] uppercase tracking-[0.16em] opacity-75 tabular-nums">
          {stats.entryCount} {stats.entryCount === 1 ? "entry" : "entries"}
        </span>
        {stats.streakDays > 1 && (
          <>
            <span className="opacity-40">·</span>
            <span className="font-mono text-[10px] uppercase tracking-[0.16em] opacity-80 tabular-nums">
              {stats.streakDays}-day streak
            </span>
          </>
        )}
      </div>

      <div className="px-6 pb-2 pt-1">
        <div className="font-display text-[26px] leading-[1.02] tracking-tight">
          {tracker.name}
        </div>
      </div>

      <div className="flex items-end gap-4 px-6 pb-5 pt-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className="font-display text-[44px] leading-none tabular-nums">
              {hero}
            </span>
            {primary?.unit && (
              <span className="text-[12px] opacity-70">{primary.unit}</span>
            )}
          </div>
          <div className="mt-1 truncate font-mono text-[10px] uppercase tracking-[0.16em] opacity-70">
            {heroLabel}
          </div>
        </div>

        <div className="h-10 w-28 shrink-0">
          <Sparkline
            entries={recent}
            primaryKey={primary?.key ?? null}
            strokeColor={color.fg}
          />
        </div>
      </div>
    </Link>
  );
}

function formatNum(n: number): string {
  if (Number.isInteger(n)) return n.toString();
  if (Math.abs(n) >= 100) return n.toFixed(0);
  return n.toFixed(1);
}
