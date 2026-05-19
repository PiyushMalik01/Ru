// Bento plan card — full ochre saturated tile. The visual unit of the
// /plans index. Sits in a 2-column grid on md+. Hero number is the item
// count; progress bar is the plan-fg tint. The kicker is the relative
// "last touched" stamp.

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatAgo } from "@/components/app-shell/primitives";

interface Props {
  id: string;
  title: string;
  description: string | null;
  itemCount: number;
  doneCount: number;
  lastActivityIso: string | null;
  nowMs: number;
  index: number;
  className?: string;
}

export function PlanCard({
  id,
  title,
  description,
  itemCount,
  doneCount,
  lastActivityIso,
  nowMs,
  index,
  className,
}: Props) {
  const pct = itemCount > 0 ? Math.round((doneCount / itemCount) * 100) : 0;

  return (
    <Link
      href={`/plans/${id}`}
      className={cn("ru-bento group block min-h-[260px]", className)}
      style={{
        ["--bento-bg" as string]: "var(--entity-plan)",
        ["--bento-fg" as string]: "var(--entity-plan-fg)",
      }}
    >
      <div className="flex h-full flex-col p-6">
        {/* Top row — index + open chevron */}
        <div className="flex items-baseline justify-between">
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] opacity-65 tabular-nums">
            plan · {(index + 1).toString().padStart(2, "0")}
          </span>
          <span className="opacity-50 transition-opacity group-hover:opacity-100">
            <ArrowUpRight className="h-4 w-4" />
          </span>
        </div>

        {/* Title — Fraunces, 26px */}
        <h2 className="mt-5 line-clamp-2 font-display text-[26px] leading-[1.04] tracking-[-0.015em] sm:text-[28px]">
          {title}
        </h2>

        {/* One-line description */}
        {description ? (
          <p className="mt-2 line-clamp-1 text-[13.5px] leading-snug opacity-75">
            {description}
          </p>
        ) : (
          <p className="mt-2 line-clamp-1 text-[13.5px] italic leading-snug opacity-40">
            no description yet
          </p>
        )}

        {/* Hero number + progress bar */}
        <div className="mt-auto pt-8">
          <div className="flex items-end justify-between gap-4">
            <div className="leading-none">
              <div
                className="font-display tabular-nums leading-[0.85]"
                style={{ fontSize: "clamp(54px, 6.4vw, 72px)" }}
              >
                {itemCount.toString().padStart(2, "0")}
              </div>
              <div className="mt-2 font-mono text-[10px] uppercase tracking-[0.18em] opacity-65">
                items · {doneCount}/{itemCount} settled
              </div>
            </div>
            <div className="pb-1 text-right font-mono text-[11px] tabular-nums opacity-70">
              {pct}
              <span className="text-[9px] opacity-60">%</span>
            </div>
          </div>

          {/* Progress hairline in plan-fg color */}
          <div
            className="mt-3 h-[3px] w-full overflow-hidden rounded-full"
            style={{ background: "rgba(0,0,0,0.12)" }}
            aria-hidden
          >
            <div
              className="h-full rounded-full transition-[width] duration-500"
              style={{
                width: `${pct}%`,
                background: "var(--entity-plan-fg)",
                opacity: 0.85,
              }}
            />
          </div>

          {/* Last touched */}
          <div className="mt-4 flex items-baseline justify-between font-mono text-[10px] uppercase tracking-[0.16em] opacity-60">
            <span>last touched</span>
            <span className="tabular-nums">
              {lastActivityIso ? formatAgo(lastActivityIso, nowMs) : "—"}
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}
