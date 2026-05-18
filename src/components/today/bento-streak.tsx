// STREAK tile — a big lime "7" in Fraunces. Routine identity.

import { BentoCard } from "./bento-card";
import { cn } from "@/lib/utils";

interface Props {
  value: number;
  className?: string;
}

export function BentoStreak({ value, className }: Props) {
  const safe = Math.max(0, Math.floor(value));
  return (
    <BentoCard
      tint="routine"
      eyebrow="streak"
      caption={safe === 1 ? "day" : "days"}
      className={cn("min-h-[180px]", className)}
      href="/routines"
    >
      <div className="flex h-full flex-col justify-between gap-4">
        <div className="font-display text-[88px] leading-[0.85] tracking-[-0.04em] text-foreground sm:text-[104px]">
          {safe}
        </div>
        <div className="flex items-center gap-1" aria-hidden>
          {Array.from({ length: 7 }).map((_, i) => {
            const filled = i < Math.min(7, safe % 7 === 0 && safe > 0 ? 7 : safe % 7);
            return (
              <span
                key={i}
                className="h-2 flex-1 rounded-full"
                style={{
                  background: filled
                    ? "var(--entity-routine)"
                    : "var(--hairline-soft)",
                }}
              />
            );
          })}
        </div>
        <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          best running streak
        </div>
      </div>
    </BentoCard>
  );
}
