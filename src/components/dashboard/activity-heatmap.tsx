import { cn } from "@/lib/utils";

interface ActivityHeatmapProps {
  days: { date: string; count: number }[]; // ordered oldest -> newest, length ~30
}

function bucketOpacity(count: number, max: number): string {
  if (count === 0) return "bg-[rgba(255,255,255,0.04)]";
  if (max === 0) return "bg-[rgba(255,255,255,0.04)]";
  const ratio = count / max;
  if (ratio <= 0.25) return "bg-foreground/10";
  if (ratio <= 0.5) return "bg-foreground/30";
  if (ratio <= 0.75) return "bg-foreground/55";
  return "bg-foreground/85";
}

function formatDateTitle(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

/**
 * Calendar-week heatmap. Columns are weeks, rows are weekdays (Mon..Sun).
 * Pure server render; native title attribute carries the hover info.
 */
export function ActivityHeatmap({ days }: ActivityHeatmapProps) {
  const max = days.reduce((m, d) => (d.count > m ? d.count : m), 0);

  // Build columns of 7 (Mon..Sun). First column may have leading blanks.
  // JS getDay(): Sun=0..Sat=6. Convert to Mon-index: (getDay()+6)%7.
  if (days.length === 0) return null;

  const firstDate = new Date(days[0].date + "T00:00:00");
  const firstMondayIdx = (firstDate.getDay() + 6) % 7;

  type Cell = { date: string; count: number } | null;
  const cells: Cell[] = [];
  for (let i = 0; i < firstMondayIdx; i++) cells.push(null);
  cells.push(...days);
  while (cells.length % 7 !== 0) cells.push(null);

  const weekCount = cells.length / 7;
  const columns: Cell[][] = [];
  for (let w = 0; w < weekCount; w++) {
    const col: Cell[] = [];
    for (let r = 0; r < 7; r++) col.push(cells[w * 7 + r]);
    columns.push(col);
  }

  const dayLabels = ["M", "T", "W", "T", "F", "S", "S"];

  const total = days.reduce((s, d) => s + d.count, 0);

  if (total === 0) {
    return (
      <div className="font-mono text-[11px] lowercase tracking-wide text-muted-foreground/70">
        no activity logged yet — start logging via chat
      </div>
    );
  }

  return (
    <div className="flex items-start gap-2.5">
      {/* Weekday labels */}
      <div className="flex flex-col gap-[3px] pt-[1px] font-mono text-[9px] uppercase tracking-wider text-muted-foreground/60">
        {dayLabels.map((d, i) => (
          <span key={i} className="flex h-[14px] items-center">
            {i % 2 === 0 ? d : ""}
          </span>
        ))}
      </div>

      {/* Grid */}
      <div className="flex gap-[3px]">
        {columns.map((col, ci) => (
          <div key={ci} className="flex flex-col gap-[3px]">
            {col.map((cell, ri) => {
              if (!cell) {
                return <span key={ri} className="h-[14px] w-[14px]" />;
              }
              return (
                <span
                  key={cell.date}
                  title={`${formatDateTitle(cell.date)} · ${cell.count} ${cell.count === 1 ? "entry" : "entries"}`}
                  className={cn(
                    "h-[14px] w-[14px] rounded-[3px] transition-opacity hover:ring-1 hover:ring-foreground/20",
                    bucketOpacity(cell.count, max)
                  )}
                />
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
