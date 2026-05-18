// Minimal SVG sparkline. Used in the list card next to the hero number.
// No axis, no labels — just the shape. Renders nothing for trackers with
// fewer than 2 numeric entries.

import type { TrackerEntry } from "@/lib/queries/trackers";

interface Props {
  entries: TrackerEntry[];
  primaryKey: string | null;
  strokeColor: string;
}

export function Sparkline({ entries, primaryKey, strokeColor }: Props) {
  if (!primaryKey || entries.length < 2) {
    return <div className="h-full w-full" aria-hidden />;
  }

  // Oldest-first for left-to-right read.
  const ordered = [...entries].reverse();
  const points: { t: number; v: number }[] = [];
  for (const e of ordered) {
    const raw = e.values?.[primaryKey];
    if (typeof raw === "number" && Number.isFinite(raw)) {
      points.push({ t: new Date(e.entered_at).getTime(), v: raw });
    }
  }
  if (points.length < 2) return <div className="h-full w-full" aria-hidden />;

  const minT = points[0].t;
  const maxT = points[points.length - 1].t;
  const minV = Math.min(...points.map((p) => p.v));
  const maxV = Math.max(...points.map((p) => p.v));

  const W = 112; // ≈ w-28 in px
  const H = 40;
  const PAD = 2;

  const xs = (t: number) =>
    maxT === minT ? W / 2 : PAD + ((t - minT) / (maxT - minT)) * (W - PAD * 2);
  const ys = (v: number) =>
    maxV === minV ? H / 2 : H - PAD - ((v - minV) / (maxV - minV)) * (H - PAD * 2);

  const d = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${xs(p.t).toFixed(2)} ${ys(p.v).toFixed(2)}`)
    .join(" ");

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="h-full w-full"
      preserveAspectRatio="none"
      aria-hidden
    >
      <path
        d={d}
        fill="none"
        stroke={strokeColor}
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={0.85}
      />
      {/* Dot on the last point */}
      <circle
        cx={xs(points[points.length - 1].t)}
        cy={ys(points[points.length - 1].v)}
        r="2.2"
        fill={strokeColor}
      />
    </svg>
  );
}
