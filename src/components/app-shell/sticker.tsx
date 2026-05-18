// A tilted sticker badge — small pill of text in mono caps, rotated slightly
// for personality. Use sparingly: status callouts ("Active", "Plan", "Streak").

import { cn } from "@/lib/utils";

interface Props {
  children: React.ReactNode;
  /** Random-ish tilt in degrees. Default -2. Pass a different one for variety. */
  tilt?: number;
  /** Inverse — black sticker with cream text instead of the default white sticker. */
  dark?: boolean;
  className?: string;
}

export function Sticker({ children, tilt = -2, dark = false, className }: Props) {
  return (
    <span
      style={{ transform: `rotate(${tilt}deg)` }}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.16em]",
        dark ? "bg-[#0a0a0c] text-[#f5f0e6]" : "bg-white text-[#0a0a0c]",
        "shadow-[0_1px_3px_rgba(0,0,0,0.08)]",
        className
      )}
    >
      {children}
    </span>
  );
}
