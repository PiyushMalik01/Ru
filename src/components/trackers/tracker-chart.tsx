// SVG chart for the tracker detail page. Three modes:
//   - line  : continuous polyline through points
//   - area  : line + filled wedge below
//   - bar   : one bar per entry, ordered by date
// All use the tracker's accent color. No external chart library — keeps the
// JS bundle small and the visual style cohesive with the rest of the app.

import type { TrackerEntry, TrackerField } from "@/lib/queries/trackers";

interface Props {
  entries: TrackerEntry[];
  primary: TrackerField | null;
  chartType: "line" | "bar" | "area";
  color: { bg: string; fg: string };
}

export function TrackerChart({ entries, primary, chartType, color }: Props) {
  if (!primary) {
    return (
      <ChartFrame>
        <div className="flex h-full items-center justify-center text-[13px] text-muted-foreground">
          Add a numeric field to plot a chart.
        </div>
      </ChartFrame>
    );
  }

  // Oldest-first for time axis.
  const ordered = [...entries].reverse();
  const points: { t: number; v: number; label: string }[] = [];
  for (const e of ordered) {
    const raw = e.values?.[primary.key];
    if (typeof raw === "number" && Number.isFinite(raw)) {
      points.push({
        t: new Date(e.entered_at).getTime(),
        v: raw,
        label: new Date(e.entered_at).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
        }),
      });
    }
  }

  if (points.length < 2) {
    return (
      <ChartFrame>
        <div className="flex h-full items-center justify-center text-[13px] text-muted-foreground">
          {points.length === 0
            ? "No numeric entries yet."
            : "Log at least two entries to see the trend."}
        </div>
      </ChartFrame>
    );
  }

  // Padded viewBox so the path doesn't touch the edges.
  const W = 800;
  const H = 280;
  const PAD_X = 36;
  const PAD_Y = 24;

  const minT = points[0].t;
  const maxT = points[points.length - 1].t;
  let minV = Math.min(...points.map((p) => p.v));
  let maxV = Math.max(...points.map((p) => p.v));
  if (minV === maxV) {
    // give it some headroom
    minV -= 1;
    maxV += 1;
  } else {
    const range = maxV - minV;
    minV -= range * 0.08;
    maxV += range * 0.08;
  }

  const xs = (t: number) =>
    maxT === minT ? W / 2 : PAD_X + ((t - minT) / (maxT - minT)) * (W - PAD_X * 2);
  const ys = (v: number) => H - PAD_Y - ((v - minV) / (maxV - minV)) * (H - PAD_Y * 2);

  // 4 horizontal gridlines + axis labels at top and bottom
  const yTicks = [0, 0.33, 0.67, 1].map((p) => minV + p * (maxV - minV));

  return (
    <ChartFrame>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-full w-full"
        preserveAspectRatio="none"
      >
        {/* Gridlines */}
        {yTicks.map((v, i) => (
          <g key={i}>
            <line
              x1={PAD_X}
              x2={W - PAD_X}
              y1={ys(v)}
              y2={ys(v)}
              stroke="var(--hairline-soft)"
              strokeWidth="1"
              strokeDasharray={i === 0 || i === yTicks.length - 1 ? "0" : "3 4"}
            />
            <text
              x={PAD_X - 6}
              y={ys(v) + 3}
              fontSize="10"
              fontFamily="var(--font-geist-mono), monospace"
              textAnchor="end"
              fill="var(--muted-foreground)"
              opacity={0.7}
            >
              {formatTick(v)}
            </text>
          </g>
        ))}

        {/* X labels: first, middle, last */}
        {[points[0], points[Math.floor(points.length / 2)], points[points.length - 1]].map((p, i) => (
          <text
            key={i}
            x={xs(p.t)}
            y={H - 6}
            fontSize="10"
            fontFamily="var(--font-geist-mono), monospace"
            textAnchor={i === 0 ? "start" : i === 2 ? "end" : "middle"}
            fill="var(--muted-foreground)"
            opacity={0.7}
          >
            {p.label}
          </text>
        ))}

        {/* Chart body */}
        {chartType === "bar" ? (
          <Bars points={points} xs={xs} ys={ys} baseY={ys(Math.max(0, minV))} color={color.bg} />
        ) : chartType === "area" ? (
          <>
            <Area
              points={points}
              xs={xs}
              ys={ys}
              baseY={ys(minV)}
              color={color.bg}
            />
            <LinePath points={points} xs={xs} ys={ys} color={color.bg} />
            <Dots points={points} xs={xs} ys={ys} color={color.bg} />
          </>
        ) : (
          <>
            <LinePath points={points} xs={xs} ys={ys} color={color.bg} />
            <Dots points={points} xs={xs} ys={ys} color={color.bg} />
          </>
        )}
      </svg>
    </ChartFrame>
  );
}

function ChartFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative h-[280px] w-full overflow-hidden rounded-2xl border border-[var(--hairline)] bg-[var(--card)] p-3">
      {children}
    </div>
  );
}

function LinePath({
  points,
  xs,
  ys,
  color,
}: {
  points: { t: number; v: number }[];
  xs: (t: number) => number;
  ys: (v: number) => number;
  color: string;
}) {
  const d = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${xs(p.t).toFixed(1)} ${ys(p.v).toFixed(1)}`)
    .join(" ");
  return (
    <path
      d={d}
      fill="none"
      stroke={color}
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  );
}

function Dots({
  points,
  xs,
  ys,
  color,
}: {
  points: { t: number; v: number }[];
  xs: (t: number) => number;
  ys: (v: number) => number;
  color: string;
}) {
  return (
    <>
      {points.map((p, i) => (
        <circle
          key={i}
          cx={xs(p.t)}
          cy={ys(p.v)}
          r={3}
          fill={color}
          stroke="var(--background)"
          strokeWidth="1.5"
        />
      ))}
    </>
  );
}

function Area({
  points,
  xs,
  ys,
  baseY,
  color,
}: {
  points: { t: number; v: number }[];
  xs: (t: number) => number;
  ys: (v: number) => number;
  baseY: number;
  color: string;
}) {
  const d =
    `M ${xs(points[0].t).toFixed(1)} ${baseY.toFixed(1)} ` +
    points
      .map((p) => `L ${xs(p.t).toFixed(1)} ${ys(p.v).toFixed(1)}`)
      .join(" ") +
    ` L ${xs(points[points.length - 1].t).toFixed(1)} ${baseY.toFixed(1)} Z`;
  return <path d={d} fill={color} opacity={0.22} />;
}

function Bars({
  points,
  xs,
  ys,
  baseY,
  color,
}: {
  points: { t: number; v: number }[];
  xs: (t: number) => number;
  ys: (v: number) => number;
  baseY: number;
  color: string;
}) {
  if (points.length === 0) return null;
  const widthPer =
    points.length > 1
      ? (xs(points[1].t) - xs(points[0].t)) * 0.65
      : 24;
  return (
    <>
      {points.map((p, i) => {
        const x = xs(p.t) - widthPer / 2;
        const y = Math.min(baseY, ys(p.v));
        const h = Math.abs(baseY - ys(p.v));
        return (
          <rect
            key={i}
            x={x}
            y={y}
            width={Math.max(2, widthPer)}
            height={Math.max(2, h)}
            fill={color}
            rx={3}
            opacity={0.9}
          />
        );
      })}
    </>
  );
}

function formatTick(n: number): string {
  if (Math.abs(n) >= 1000) return `${(n / 1000).toFixed(1)}k`;
  if (Number.isInteger(n)) return n.toString();
  if (Math.abs(n) >= 10) return n.toFixed(0);
  return n.toFixed(1);
}
