// Month-over-month deltas. Shows the current 30d count alongside the
// prior 30d count, with a ▲ or ▼ in the matching entity color.

interface DeltaSpec {
  label: string;
  current: number;
  prior: number;
  entityColor: string; // CSS var ref e.g. "var(--entity-task)"
}

interface Props {
  items: DeltaSpec[];
}

function pctDelta(current: number, prior: number): number | null {
  if (prior === 0 && current === 0) return null;
  if (prior === 0) return 100; // emerging signal — show as full positive
  return ((current - prior) / prior) * 100;
}

export function MonthDeltas({ items }: Props) {
  return (
    <div
      className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4"
      style={{ borderColor: "var(--hairline)" }}
    >
      {items.map((it) => {
        const delta = pctDelta(it.current, it.prior);
        const up = delta !== null && delta >= 0;
        const arrow = delta === null ? "·" : up ? "▲" : "▼";
        const deltaStr =
          delta === null ? "first period" : `${Math.abs(Math.round(delta))}%`;
        const color = delta === null ? "var(--muted-foreground)" : it.entityColor;

        return (
          <div
            key={it.label}
            className="flex flex-col gap-3 border-t pt-5"
            style={{ borderColor: "var(--hairline)" }}
          >
            <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              {it.label}
            </div>
            <div className="flex items-baseline gap-3">
              <span className="font-display text-[44px] leading-none tabular-nums">
                {it.current}
              </span>
              <span
                className="font-mono text-[12px] uppercase tracking-[0.14em] tabular-nums"
                style={{ color }}
              >
                {arrow} {deltaStr}
              </span>
            </div>
            <div className="font-mono text-[10px] uppercase tracking-[0.16em] tabular-nums text-muted-foreground/70">
              prior · {it.prior}
            </div>
          </div>
        );
      })}
    </div>
  );
}
