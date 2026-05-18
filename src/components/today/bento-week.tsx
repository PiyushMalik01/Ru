// THIS WEEK tile — full teal background, big mono "12" hero.

import { BentoCard } from "./bento-card";
import { Sticker } from "@/components/app-shell/sticker";
import { cn } from "@/lib/utils";

interface Props {
  count: number;
  taskCount: number;
  routineCount: number;
  className?: string;
}

export function BentoWeek({ count, taskCount, routineCount, className }: Props) {
  return (
    <BentoCard variant="insight" className={cn("min-h-[180px]", className)} href="/sheet">
      <div className="flex h-full flex-col">
        <div className="flex items-start justify-between">
          <Sticker tilt={-2}>This week</Sticker>
          <Sticker tilt={2} dark>
            open
          </Sticker>
        </div>

        <div className="mt-auto">
          <div
            className="font-display leading-[0.82] tracking-[-0.04em]"
            style={{ fontSize: "clamp(96px, 12vw, 128px)" }}
          >
            {count}
          </div>

          <div className="mt-5 flex items-center justify-between font-mono text-[11px] uppercase tracking-[0.16em] opacity-90">
            <span>
              {taskCount.toString().padStart(2, "0")} tasks
            </span>
            <span className="opacity-40">·</span>
            <span>
              {routineCount.toString().padStart(2, "0")} routines
            </span>
          </div>
        </div>
      </div>
    </BentoCard>
  );
}
