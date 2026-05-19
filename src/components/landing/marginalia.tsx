type ColorProps = { color?: string; opacity?: number };

/**
 * Inline pill highlighting the brand name "ru" inside body text.
 * Renders as a tight forest-bg/lime-text rounded pill that flows
 * naturally in a paragraph.
 */
export function RuMark({
  bg = "#1a5632",
  color = "#d9fb60",
}: { bg?: string; color?: string } = {}) {
  return (
    <span
      className="inline-flex items-baseline rounded-full"
      style={{
        background: bg,
        color,
        padding: "1px 9px 2px",
        margin: "0 1px",
        fontFamily: "var(--font-serif)",
        fontWeight: 700,
        fontSize: "0.92em",
        lineHeight: 1.1,
        letterSpacing: "-0.01em",
        verticalAlign: "baseline",
      }}
    >
      ru
    </span>
  );
}

export function Sparkle({ size = 16, color = "#d9fb60", opacity = 0.7 }: { size?: number } & ColorProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M8 0.5 L9.4 6.6 L15.5 8 L9.4 9.4 L8 15.5 L6.6 9.4 L0.5 8 L6.6 6.6 Z"
        fill={color}
        opacity={opacity}
      />
    </svg>
  );
}

export function WobblyUnderline({ color = "#d9fb60", opacity = 0.8, thickness = 4 }: ColorProps & { thickness?: number }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 200 14"
      preserveAspectRatio="none"
      style={{
        position: "absolute",
        left: 0,
        bottom: "-0.04em",
        width: "100%",
        height: "0.18em",
        overflow: "visible",
        pointerEvents: "none",
      }}
    >
      <path
        d="M3 8 C 40 2, 80 11, 120 5 S 180 9, 197 6"
        stroke={color}
        strokeWidth={thickness}
        strokeLinecap="round"
        fill="none"
        opacity={opacity}
      />
    </svg>
  );
}

export function ScribbleCircle({
  size = 280,
  color = "#2d2a26",
  opacity = 0.18,
  className,
}: { size?: number; className?: string } & ColorProps) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      width={size}
      height={size}
      viewBox="0 0 300 280"
      fill="none"
    >
      <path
        d="M168 28 C 78 24, 28 96, 42 178 C 56 254, 152 268, 222 238 C 282 212, 286 132, 252 78 C 220 28, 154 26, 118 44 C 86 60, 60 92, 56 132"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        fill="none"
        opacity={opacity}
      />
    </svg>
  );
}

export function Squiggle({
  width = 200,
  height = 18,
  color = "#2d2a26",
  opacity = 0.5,
  className,
}: { width?: number; height?: number; className?: string } & ColorProps) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      width={width}
      height={height}
      viewBox="0 0 200 18"
      fill="none"
      preserveAspectRatio="none"
    >
      <path
        d="M3 10 C 25 3, 45 17, 70 9 S 120 3, 145 11 S 180 5, 197 9"
        stroke={color}
        strokeWidth="2.5"
        strokeLinecap="round"
        fill="none"
        opacity={opacity}
      />
    </svg>
  );
}

export function DotGrid({
  rows = 5,
  cols = 5,
  gap = 24,
  color = "#2d2a26",
  opacity = 0.1,
  className,
}: { rows?: number; cols?: number; gap?: number; className?: string } & ColorProps) {
  const size = gap * (Math.max(rows, cols) - 1) + 24;
  return (
    <svg
      aria-hidden="true"
      className={className}
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      fill="none"
      style={{ opacity }}
    >
      {Array.from({ length: rows }).map((_, r) =>
        Array.from({ length: cols }).map((_, c) => (
          <circle key={`${r}-${c}`} cx={12 + c * gap} cy={12 + r * gap} r="2.5" fill={color} />
        ))
      )}
    </svg>
  );
}

export function CurvedArrow({
  width = 220,
  height = 180,
  color = "#6b665e",
  opacity = 0.55,
  label,
  className,
  style,
}: {
  width?: number;
  height?: number;
  label?: string;
  className?: string;
  style?: React.CSSProperties;
} & ColorProps) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      style={style}
      width={width}
      height={height}
      viewBox="0 0 220 180"
      fill="none"
    >
      {label && (
        <text
          x="110"
          y="28"
          style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", fontSize: "17px", fill: color, opacity: opacity + 0.2 }}
        >
          {label}
        </text>
      )}
      <path
        d="M195 50 C 180 95, 130 110, 70 115 C 40 117, 22 122, 10 130"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        fill="none"
        opacity={opacity}
      />
      <path
        d="M 22 120 L 10 130 L 22 140"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
        opacity={opacity}
      />
    </svg>
  );
}

export function CornerBracket({
  size = 60,
  color = "#2d2a26",
  opacity = 0.3,
  corner = "tl",
  className,
}: { size?: number; corner?: "tl" | "tr" | "bl" | "br"; className?: string } & ColorProps) {
  const rotation = { tl: 0, tr: 90, br: 180, bl: 270 }[corner];
  return (
    <svg
      aria-hidden="true"
      className={className}
      width={size}
      height={size}
      viewBox="0 0 60 60"
      fill="none"
      style={{ transform: `rotate(${rotation}deg)` }}
    >
      <path
        d="M5 30 C 6 18, 14 8, 28 6 C 35 5, 45 6, 55 6"
        stroke={color}
        strokeWidth="1.8"
        strokeLinecap="round"
        fill="none"
        opacity={opacity}
      />
    </svg>
  );
}
