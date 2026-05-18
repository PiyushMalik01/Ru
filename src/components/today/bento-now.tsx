// NOW tile — the hero of the bento. Lime full-bg tile, black Fraunces
// headline showing the next thing to do, with a black pill CTA in the
// bottom-right. F-pattern: occupies col-span-2 row-span-2 top-left.

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { BentoCard } from "./bento-card";
import { Sticker } from "@/components/app-shell/sticker";
import { formatWhen } from "@/components/app-shell/primitives";

interface NowItem {
  kind: "task" | "routine";
  id: string;
  title: string;
  whenIso: string | null;
  timeOfDay?: string | null;
}

interface Props {
  items: NowItem[];
  nowMs: number;
  className?: string;
}

function routineWhen(t: string | null): string {
  if (!t) return "anytime";
  const [hStr, mStr] = t.split(":");
  const h = parseInt(hStr ?? "", 10);
  if (Number.isNaN(h)) return "anytime";
  const m = parseInt(mStr ?? "0", 10) || 0;
  const ampm = h < 12 ? "am" : "pm";
  const hour12 = ((h + 11) % 12) + 1;
  return m === 0 ? `${hour12}${ampm}` : `${hour12}:${m.toString().padStart(2, "0")}${ampm}`;
}

export function BentoNow({ items, nowMs, className }: Props) {
  const headline = items[0] ?? null;

  if (!headline) {
    return (
      <BentoCard variant="routine" className={cn("min-h-[320px]", className)} staticTile>
        <div className="flex h-full flex-col">
          <div className="flex items-start justify-between">
            <Sticker tilt={-3}>Now</Sticker>
            <Sticker tilt={2} dark>Free</Sticker>
          </div>
          <div className="mt-auto">
            <div className="font-display text-[52px] leading-[0.95] sm:text-[64px]">
              Nothing on the clock.
            </div>
            <p className="mt-4 max-w-md text-[15px] leading-relaxed opacity-70">
              The next hour is yours. Take a breath — or open the sheet and pick something up.
            </p>
            <div className="mt-7">
              <Link href="/sheet" className="ru-pill-dark">
                Open sheet <ArrowUpRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </div>
        </div>
      </BentoCard>
    );
  }

  const variant = headline.kind === "routine" ? "routine" : "task";
  const whenLabel =
    headline.kind === "task"
      ? formatWhen(headline.whenIso, nowMs) ?? "soon"
      : routineWhen(headline.timeOfDay ?? null);

  return (
    <BentoCard variant={variant} className={cn("min-h-[320px]", className)} href="/sheet">
      <div className="flex h-full flex-col">
        <div className="flex items-start justify-between gap-3">
          <Sticker tilt={-3}>Now · {whenLabel}</Sticker>
          {items.length > 1 && (
            <Sticker tilt={2} dark>
              +{items.length - 1} after
            </Sticker>
          )}
        </div>

        <h2 className="mt-auto font-display text-[44px] leading-[0.98] sm:text-[60px]">
          {headline.title}
        </h2>

        <div className="mt-6 flex items-center justify-between">
          <span className="font-mono text-[11px] uppercase tracking-[0.18em] opacity-65">
            {headline.kind === "task" ? "task · open" : "routine · today"}
          </span>
          {variant === "task" ? (
            <span className="ru-pill-light">
              View <ArrowUpRight className="h-3.5 w-3.5" />
            </span>
          ) : (
            <span className="ru-pill-dark">
              Start <ArrowUpRight className="h-3.5 w-3.5" />
            </span>
          )}
        </div>
      </div>
    </BentoCard>
  );
}
