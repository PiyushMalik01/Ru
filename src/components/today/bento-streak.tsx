// STREAK tile — cream tile with a HUGE lime number as the visual hero.
// 7-segment week strip in lime below it.

import { BentoCard } from "./bento-card";
import { Sticker } from "@/components/app-shell/sticker";
import { cn } from "@/lib/utils";

interface Props {
  value: number;
  className?: string;
}

export function BentoStreak({ value, className }: Props) {
  const safe = Math.max(0, Math.floor(value));
  const weekFilled = safe % 7 === 0 && safe > 0 ? 7 : safe % 7;

  return (
    <BentoCard variant="cream" className={cn("min-h-[180px]", className)} href="/routines">
      <div className="flex h-full flex-col">
        <div className="flex items-start justify-between">
          <Sticker tilt={-2}>Streak</Sticker>
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            {safe === 1 ? "1 day" : `${safe} days`}
          </span>
        </div>

        <div className="mt-auto">
          <div
            className="font-display leading-[0.82] tracking-[-0.04em]"
            style={{
              color: "var(--entity-routine)",
              fontSize: "clamp(96px, 12vw, 132px)",
              WebkitTextStroke: "1px var(--entity-routine-fg)",
            }}
          >
            {safe}
          </div>

          <div className="mt-5 flex items-center gap-1.5" aria-hidden>
            {Array.from({ length: 7 }).map((_, i) => {
              const filled = i < weekFilled;
              return (
                <span
                  key={i}
                  className="h-2.5 flex-1 rounded-full"
                  style={{
                    background: filled
                      ? "var(--entity-routine)"
                      : "var(--hairline)",
                  }}
                />
              );
            })}
          </div>
        </div>
      </div>
    </BentoCard>
  );
}
