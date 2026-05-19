// ACTIVITY TOTAL tile — pink full bg. Fraunces count + one-line sparkline
// of the last 30 days of daily activity counts.

import { BentoCard } from "@/components/today/bento-card";
import { Sticker } from "@/components/app-shell/sticker";
import { cn } from "@/lib/utils";

interface Props {
  total: number;
  series: { date: string; count: number }[];
  delta: number | null; // % vs prior, or null when no baseline
  className?: string;
}

function buildSparklinePath(values: number[], width: number, height: number): string {
  if (values.length === 0) return "";
  const max = Math.max(1, ...values);
  const n = values.length;
  const step = n > 1 ? width / (n - 1) : 0;
  return values
    .map((v, i) => {
      const x = i * step;
      const y = height - (v / max) * height;
      return `${i === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
}

function buildAreaPath(values: number[], width: number, height: number): string {
  if (values.length === 0) return "";
  const max = Math.max(1, ...values);
  const n = values.length;
  const step = n > 1 ? width / (n - 1) : 0;
  let d = `M0,${height}`;
  values.forEach((v, i) => {
    const x = i * step;
    const y = height - (v / max) * height;
    d += ` L${x.toFixed(2)},${y.toFixed(2)}`;
  });
  d += ` L${width},${height} Z`;
  return d;
}

export function BentoActivityTotal({ total, series, delta, className }: Props) {
  const values = series.map((s) => s.count);
  const w = 320;
  const h = 56;
  const line = buildSparklinePath(values, w, h);
  const area = buildAreaPath(values, w, h);

  const empty = total === 0;
  const arrow = delta === null ? null : delta >= 0 ? "▲" : "▼";
  const deltaStr = delta === null ? null : `${Math.abs(Math.round(delta))}%`;

  return (
    <BentoCard variant="activity" className={cn("min-h-[200px]", className)} href="/sheet">
      <div className="flex h-full flex-col">
        <div className="flex items-start justify-between">
          <Sticker tilt={-2}>Activity</Sticker>
          {arrow && (
            <Sticker tilt={2} dark>
              {arrow} {deltaStr}
            </Sticker>
          )}
        </div>

        <div className="mt-auto">
          <div
            className="font-display leading-[0.82] tracking-[-0.04em]"
            style={{ fontSize: "clamp(82px, 11vw, 120px)" }}
          >
            {empty ? "—" : total}
          </div>

          {/* Sparkline */}
          <div className="mt-5">
            <svg
              viewBox={`0 0 ${w} ${h}`}
              preserveAspectRatio="none"
              width="100%"
              height={h}
              aria-hidden
            >
              <path d={area} fill="rgba(255,255,255,0.18)" />
              <path
                d={line}
                fill="none"
                stroke="white"
                strokeWidth={1.5}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>

          <div className="mt-3 flex items-center justify-between font-mono text-[11px] uppercase tracking-[0.16em] opacity-90">
            <span>entries · 30d</span>
            <span className="tabular-nums">
              {series.length.toString().padStart(2, "0")} days
            </span>
          </div>
        </div>
      </div>
    </BentoCard>
  );
}
