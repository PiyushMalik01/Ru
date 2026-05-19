// COMPLETION tile — cobalt full bg. Fraunces hero % + thin progress bar.
// Used on the Insights page bento spread.

import { BentoCard } from "@/components/today/bento-card";
import { Sticker } from "@/components/app-shell/sticker";
import { cn } from "@/lib/utils";

interface Props {
  rate: number;
  completed: number;
  total: number;
  className?: string;
}

export function BentoCompletion({ rate, completed, total, className }: Props) {
  const safeRate = Math.max(0, Math.min(100, Math.round(rate)));
  const empty = total === 0;

  return (
    <BentoCard variant="task" className={cn("min-h-[200px]", className)} href="/sheet">
      <div className="flex h-full flex-col">
        <div className="flex items-start justify-between">
          <Sticker tilt={-2}>Tasks</Sticker>
          <Sticker tilt={2} dark>
            30 days
          </Sticker>
        </div>

        <div className="mt-auto">
          <div
            className="font-display leading-[0.82] tracking-[-0.04em]"
            style={{ fontSize: "clamp(82px, 11vw, 120px)" }}
          >
            {empty ? "—" : `${safeRate}%`}
          </div>

          <div className="mt-5 h-[3px] w-full overflow-hidden rounded-full bg-white/20">
            <div
              className="h-full bg-white"
              style={{ width: `${empty ? 0 : safeRate}%` }}
            />
          </div>

          <div className="mt-4 flex items-center justify-between font-mono text-[11px] uppercase tracking-[0.16em] opacity-90">
            <span>completion</span>
            <span className="tabular-nums">
              {completed.toString().padStart(2, "0")} / {total.toString().padStart(2, "0")}
            </span>
          </div>
        </div>
      </div>
    </BentoCard>
  );
}
