// Routine leaderboard — top 5 by streak. Each row: rank, name, Fraunces
// streak number, lime 7-day strip. Lime is the routine entity color.

interface RoutineRow {
  id: string;
  title: string;
  streak: number;
  rate7: number;
  rate30: number;
  lastSevenDays: { date: string; completed: boolean }[];
}

interface Props {
  routines: RoutineRow[];
}

export function RoutineLeaderboard({ routines }: Props) {
  const ranked = [...routines]
    .sort((a, b) => b.streak - a.streak || b.rate30 - a.rate30)
    .slice(0, 5);

  if (ranked.length === 0) {
    return (
      <div className="py-6 font-mono text-[12px] lowercase tracking-wide text-muted-foreground/70">
        no routines tracked. tell ru about a habit to start one.
      </div>
    );
  }

  return (
    <div>
      {ranked.map((r, i) => (
        <div
          key={r.id}
          className="grid grid-cols-[28px_1fr_auto_auto] items-center gap-4 py-5 [&:not(:first-child)]:border-t"
          style={{ borderColor: "var(--hairline-soft)" }}
        >
          {/* Rank */}
          <span className="font-mono text-[11px] uppercase tracking-[0.18em] tabular-nums text-muted-foreground/70">
            {(i + 1).toString().padStart(2, "0")}
          </span>

          {/* Title + 30d rate bar */}
          <div className="min-w-0">
            <div className="truncate text-[15px] font-medium leading-tight">
              {r.title}
            </div>
            <div className="mt-2 flex items-center gap-3">
              <div
                className="h-[3px] flex-1 overflow-hidden rounded-full"
                style={{ background: "var(--hairline)" }}
              >
                <div
                  className="h-full"
                  style={{
                    width: `${Math.min(100, r.rate30)}%`,
                    background: "var(--entity-routine)",
                  }}
                />
              </div>
              <span className="font-mono text-[10px] uppercase tracking-[0.16em] tabular-nums text-muted-foreground/70">
                {r.rate30}% · 30d
              </span>
            </div>
          </div>

          {/* 7-day strip */}
          <div className="flex items-center gap-[3px]" aria-hidden>
            {r.lastSevenDays.map((d) => (
              <span
                key={d.date}
                title={`${d.date} · ${d.completed ? "done" : "missed"}`}
                className="h-3.5 w-3.5 rounded-[3px]"
                style={{
                  background: d.completed
                    ? "var(--entity-routine)"
                    : "var(--hairline)",
                }}
              />
            ))}
          </div>

          {/* Streak — Fraunces hero number */}
          <div className="flex w-16 shrink-0 flex-col items-end">
            <span
              className="font-display leading-none tabular-nums"
              style={{
                fontSize: "30px",
                color:
                  r.streak > 0
                    ? "var(--foreground)"
                    : "var(--muted-foreground)",
              }}
            >
              {r.streak}
            </span>
            <span className="mt-1.5 font-mono text-[9px] uppercase tracking-[0.16em] text-muted-foreground/70">
              streak
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
