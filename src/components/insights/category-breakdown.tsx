// Category breakdown — horizontal bars for each activity category, sorted by
// count desc. Bars are pink (activity entity color). Shows share % alongside.

interface Item {
  category: string;
  count: number;
}

interface Props {
  items: Item[];
}

export function CategoryBreakdown({ items }: Props) {
  const total = items.reduce((s, x) => s + x.count, 0);
  const max = items.reduce((m, x) => (x.count > m ? x.count : m), 0);

  if (items.length === 0 || total === 0) {
    return (
      <div className="py-6 font-mono text-[12px] lowercase tracking-wide text-muted-foreground/70">
        nothing categorised yet — log something via chat.
      </div>
    );
  }

  return (
    <div>
      {items.map((it) => {
        const share = Math.round((it.count / total) * 100);
        const barPct = max ? (it.count / max) * 100 : 0;
        return (
          <div
            key={it.category}
            className="grid grid-cols-[160px_1fr_64px_56px] items-center gap-4 py-4 [&:not(:first-child)]:border-t"
            style={{ borderColor: "var(--hairline-soft)" }}
          >
            <div className="truncate font-mono text-[12px] lowercase tracking-wide">
              {it.category}
            </div>
            <div
              className="h-[8px] overflow-hidden rounded-full"
              style={{ background: "var(--hairline)" }}
            >
              <div
                className="h-full"
                style={{
                  width: `${barPct}%`,
                  background: "var(--entity-activity)",
                }}
              />
            </div>
            <div className="text-right font-mono text-[11px] uppercase tracking-[0.14em] tabular-nums text-muted-foreground/80">
              {share}%
            </div>
            <div className="text-right font-mono text-[15px] font-light tabular-nums">
              {it.count}
            </div>
          </div>
        );
      })}
    </div>
  );
}
