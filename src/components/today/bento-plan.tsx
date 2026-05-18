// ACTIVE PLAN tile — ochre identity. Highlights the most recent workspace.

import { BentoCard } from "./bento-card";
import { BentoProgress } from "@/components/app-shell/primitives";
import { cn } from "@/lib/utils";

interface Props {
  id: string;
  title: string;
  description: string | null;
  itemCount: number;
  doneCount: number;
  className?: string;
}

export function BentoPlan({
  id,
  title,
  description,
  itemCount,
  doneCount,
  className,
}: Props) {
  const pct = itemCount > 0 ? Math.round((doneCount / itemCount) * 100) : 0;

  return (
    <BentoCard
      tint="plan"
      eyebrow="active plan"
      caption={`${doneCount.toString().padStart(2, "0")} / ${itemCount.toString().padStart(2, "0")}`}
      className={cn("min-h-[180px]", className)}
      href={`/plans/${id}`}
    >
      <div className="flex h-full flex-col gap-3">
        <div>
          <h3 className="line-clamp-2 text-[17px] font-medium leading-tight text-foreground">
            {title}
          </h3>
          {description ? (
            <p className="mt-1.5 line-clamp-2 text-[12.5px] leading-relaxed text-muted-foreground">
              {description}
            </p>
          ) : null}
        </div>

        <div className="mt-auto">
          <div className="flex items-baseline justify-between">
            <span className="font-display text-[44px] leading-none tabular-nums text-foreground">
              {pct}
              <span className="ml-0.5 text-[20px] text-muted-foreground">%</span>
            </span>
            <span className="font-mono text-[9.5px] uppercase tracking-[0.2em] text-muted-foreground">
              complete
            </span>
          </div>
          <div className="mt-3">
            <BentoProgress value={pct} tint="plan" />
          </div>
        </div>
      </div>
    </BentoCard>
  );
}

export function BentoPlanEmpty({ className }: { className?: string }) {
  return (
    <BentoCard
      tint="plan"
      eyebrow="active plan"
      className={cn("min-h-[180px]", className)}
      href="/plans"
    >
      <div className="flex h-full flex-col justify-between gap-3">
        <p className="text-[13.5px] leading-relaxed text-muted-foreground">
          You haven&apos;t started a plan yet. Plans hold the items that belong to
          a bigger arc — a project, a trip, a goal.
        </p>
        <span className="self-start font-mono text-[10px] uppercase tracking-[0.18em] text-foreground">
          <span className="ru-link">start one →</span>
        </span>
      </div>
    </BentoCard>
  );
}
