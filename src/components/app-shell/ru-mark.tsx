// Ru's mascot/identity glyph — a friendly squircle with a single dot eye
// and a tiny upward curve. Rendered as inline SVG so it scales and recolors
// cleanly. Used in the TopNav wordmark and as Today's greeter.

import { cn } from "@/lib/utils";

interface Props {
  size?: number;
  className?: string;
  fill?: string;
  /** When true, uses a warm cream face on a charcoal base — the inverse. */
  inverse?: boolean;
}

export function RuMark({ size = 32, className, fill, inverse = false }: Props) {
  const bg = inverse ? "#0a0a0c" : (fill ?? "var(--entity-routine)");
  const fg = inverse ? "#f5f0e6" : "#0a0a08";

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      className={cn("shrink-0", className)}
      aria-hidden
    >
      {/* Body — soft squircle */}
      <path
        d="M8 6 C5 6 2 9 2 14 L2 26 C2 31 5 34 8 34 L32 34 C35 34 38 31 38 26 L38 14 C38 9 35 6 32 6 Z"
        fill={bg}
      />
      {/* Eye — single offset dot */}
      <circle cx="27" cy="17" r="2.4" fill={fg} />
      {/* Smile — short upward curve */}
      <path
        d="M14 24 Q19 28 24 24"
        stroke={fg}
        strokeWidth="2.2"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}
