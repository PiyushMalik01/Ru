// ACTIVE PLAN tile — full ochre tile, plan title in chunky Fraunces,
// massive progress percent number.

import { ArrowUpRight } from "lucide-react";
import { BentoCard } from "./bento-card";
import { Sticker } from "@/components/app-shell/sticker";
import { Squiggle } from "@/components/app-shell/squiggle";
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
    <BentoCard variant="plan" className={cn("min-h-[200px]", className)} href={`/plans/${id}`}>
      <div className="flex h-full flex-col">
        <div className="flex items-start justify-between gap-3">
          <Sticker tilt={-2}>Active plan</Sticker>
          <Sticker tilt={2} dark>
            {doneCount}/{itemCount}
          </Sticker>
        </div>

        <h3
          className="mt-4 line-clamp-2 text-[28px] leading-[1.05] sm:text-[34px]"
          style={{
            fontVariationSettings: "'wght' 680, 'wdth' 96, 'opsz' 32",
            letterSpacing: "-0.025em",
          }}
        >
          {title}
        </h3>

        {description ? (
          <p className="mt-2 line-clamp-2 text-[13px] leading-relaxed opacity-75">
            {description}
          </p>
        ) : null}

        <div className="mt-auto pt-4">
          <Squiggle className="mb-2 text-current/40" width={280} />
          <div className="flex items-end justify-between">
            <span className="font-display leading-[0.85] tabular-nums" style={{ fontSize: "clamp(48px, 6vw, 64px)" }}>
              {pct}
              <span className="ml-0.5 text-[24px] opacity-60">%</span>
            </span>
            <span className="ru-pill-dark">
              Open <ArrowUpRight className="h-3.5 w-3.5" />
            </span>
          </div>
        </div>
      </div>
    </BentoCard>
  );
}

export function BentoPlanEmpty({ className }: { className?: string }) {
  return (
    <BentoCard variant="plan" className={cn("min-h-[200px]", className)} href="/plans">
      <div className="flex h-full flex-col justify-between">
        <Sticker tilt={-2}>Active plan</Sticker>
        <div>
          <h3 className="h-section lowercase">
            nothing in flight
          </h3>
          <p className="mt-2 text-[13px] leading-relaxed opacity-75">
            Plans hold items that belong to a bigger arc. Tell Ru what you&rsquo;re building.
          </p>
        </div>
        <span className="ru-pill-dark self-start">
          Start a plan <ArrowUpRight className="h-3.5 w-3.5" />
        </span>
      </div>
    </BentoCard>
  );
}
