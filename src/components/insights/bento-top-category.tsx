// TOP CATEGORY tile — ochre full bg. Fraunces category name + share %.

import { BentoCard } from "@/components/today/bento-card";
import { Sticker } from "@/components/app-shell/sticker";
import { cn } from "@/lib/utils";

interface Props {
  category: string | null;
  count: number;
  total: number;
  className?: string;
}

export function BentoTopCategory({ category, count, total, className }: Props) {
  const empty = !category || total === 0;
  const share = empty ? 0 : Math.round((count / total) * 100);

  return (
    <BentoCard variant="plan" className={cn("min-h-[200px]", className)} href="/sheet">
      <div className="flex h-full flex-col">
        <div className="flex items-start justify-between">
          <Sticker tilt={-2}>Top category</Sticker>
          <Sticker tilt={2} dark>
            30 days
          </Sticker>
        </div>

        <div className="mt-auto">
          <div
            className="font-display leading-[0.92] tracking-[-0.03em]"
            style={{ fontSize: "clamp(40px, 5.4vw, 64px)" }}
          >
            {empty ? "Nothing yet." : category}
          </div>

          <div className="mt-5 flex items-baseline gap-4">
            <span
              className="font-display tabular-nums leading-none"
              style={{ fontSize: "clamp(36px, 5vw, 56px)" }}
            >
              {empty ? "—" : `${share}%`}
            </span>
            <span className="font-mono text-[11px] uppercase tracking-[0.16em] opacity-80">
              {empty
                ? "log something via chat"
                : `${count} of ${total} entries`}
            </span>
          </div>

          <div className="mt-4 h-[3px] w-full overflow-hidden rounded-full bg-black/15">
            <div
              className="h-full bg-black/75"
              style={{ width: `${empty ? 0 : share}%` }}
            />
          </div>
        </div>
      </div>
    </BentoCard>
  );
}
