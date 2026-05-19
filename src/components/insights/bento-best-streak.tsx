// BEST STREAK tile — cream tile with a HUGE lime number + the routine title.
// Slight variant of the Today streak bento, surfaced on Insights.

import { BentoCard } from "@/components/today/bento-card";
import { Sticker } from "@/components/app-shell/sticker";
import { cn } from "@/lib/utils";

interface Props {
  title: string | null;
  days: number;
  className?: string;
}

export function BentoBestStreak({ title, days, className }: Props) {
  const safe = Math.max(0, Math.floor(days));
  const empty = !title || safe === 0;

  return (
    <BentoCard variant="cream" className={cn("min-h-[200px]", className)} href="/routines">
      <div className="flex h-full flex-col">
        <div className="flex items-start justify-between">
          <Sticker tilt={-2}>Best streak</Sticker>
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            {empty ? "—" : safe === 1 ? "1 day" : `${safe} days`}
          </span>
        </div>

        <div className="mt-auto">
          <div
            className="font-display leading-[0.82] tracking-[-0.04em]"
            style={{
              color: "var(--entity-routine)",
              fontSize: "clamp(82px, 11vw, 120px)",
              WebkitTextStroke: "1px var(--entity-routine-fg)",
            }}
          >
            {safe}
          </div>

          <div className="mt-5 truncate font-display text-[22px] leading-[1.05]">
            {empty ? "No streak yet." : title}
          </div>
          <div className="mt-2 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            {empty ? "tell ru about a habit to start" : "consecutive days"}
          </div>
        </div>
      </div>
    </BentoCard>
  );
}
