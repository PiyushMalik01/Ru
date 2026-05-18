// LOG tile — magenta activity identity. Recent activities, oldest at the
// bottom. Lives at the right edge of the bottom bento row.

import { BentoCard } from "./bento-card";
import { formatAgo } from "@/components/app-shell/primitives";
import { cn } from "@/lib/utils";

interface LogItem {
  id: string;
  activity: string;
  category: string;
  timestamp: string;
}

interface Props {
  items: LogItem[];
  nowMs: number;
  className?: string;
}

export function BentoLog({ items, nowMs, className }: Props) {
  const shown = items.slice(0, 3);

  return (
    <BentoCard
      tint="activity"
      eyebrow="log"
      caption={items.length.toString().padStart(2, "0")}
      className={cn("min-h-[180px]", className)}
      href="/sheet"
    >
      {shown.length === 0 ? (
        <p className="py-8 text-center font-mono text-[12px] lowercase tracking-wide text-muted-foreground/70">
          no activity logged today.
        </p>
      ) : (
        <ul className="flex flex-col">
          {shown.map((a, i) => (
            <li
              key={a.id}
              className={cn(
                "py-2.5",
                i !== 0 && "border-t border-[var(--hairline-soft)]",
              )}
            >
              <div className="flex items-baseline gap-2">
                <span className="min-w-0 flex-1 truncate text-[13.5px] leading-tight">
                  {a.activity}
                </span>
                <span className="shrink-0 font-mono text-[10px] tabular-nums text-muted-foreground/70">
                  {formatAgo(a.timestamp, nowMs)}
                </span>
              </div>
              {a.category && (
                <div className="mt-0.5 font-mono text-[9.5px] uppercase tracking-[0.18em] text-muted-foreground/60">
                  {a.category}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </BentoCard>
  );
}
