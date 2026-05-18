// THIS WEEK tile — teal insight identity. A big mono "12" of work items.

import { BentoCard } from "./bento-card";
import { cn } from "@/lib/utils";

interface Props {
  count: number;
  taskCount: number;
  routineCount: number;
  className?: string;
}

export function BentoWeek({ count, taskCount, routineCount, className }: Props) {
  return (
    <BentoCard
      tint="insight"
      eyebrow="this week"
      caption="open"
      className={cn("min-h-[180px]", className)}
      href="/sheet"
    >
      <div className="flex h-full flex-col justify-between gap-3">
        <div className="font-display text-[88px] leading-[0.85] tracking-[-0.04em] text-foreground sm:text-[104px]">
          {count}
        </div>
        <div className="flex flex-col gap-2 font-mono text-[11px] uppercase tracking-[0.14em]">
          <div className="flex items-center gap-2">
            <span
              className="h-2 w-2 rounded-[1px]"
              style={{ background: "var(--entity-task)" }}
              aria-hidden
            />
            <span className="text-muted-foreground">tasks</span>
            <span className="ml-auto tabular-nums text-foreground">
              {taskCount.toString().padStart(2, "0")}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span
              className="h-2 w-2 rounded-[1px]"
              style={{ background: "var(--entity-routine)" }}
              aria-hidden
            />
            <span className="text-muted-foreground">routines</span>
            <span className="ml-auto tabular-nums text-foreground">
              {routineCount.toString().padStart(2, "0")}
            </span>
          </div>
        </div>
      </div>
    </BentoCard>
  );
}
