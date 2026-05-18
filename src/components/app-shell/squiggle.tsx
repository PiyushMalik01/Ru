// A hand-drawn-style wavy line. Used as a section divider in place of
// plain <hr> / hairline rules — adds personality without illustration weight.

import { cn } from "@/lib/utils";

interface Props {
  className?: string;
  color?: string;
  /** Width in pixels controls density of the wave. Default 240. */
  width?: number;
}

export function Squiggle({ className, color = "currentColor", width = 240 }: Props) {
  return (
    <svg
      width={width}
      height="14"
      viewBox="0 0 240 14"
      fill="none"
      className={cn("opacity-70", className)}
      aria-hidden
    >
      <path
        d="M2 7 Q15 1, 30 7 T 60 7 T 90 7 T 120 7 T 150 7 T 180 7 T 210 7 T 238 7"
        stroke={color}
        strokeWidth="1.6"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}
