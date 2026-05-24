// LOG tile — full magenta tile with cream type. Most recent activity is hero,
// with smaller follow-ups underneath.

import { BentoCard } from "./bento-card";
import { Sticker } from "@/components/app-shell/sticker";
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
  const hero = items[0] ?? null;
  const rest = items.slice(1, 3);

  return (
    <BentoCard variant="activity" className={cn("min-h-[200px]", className)} href="/sheet">
      <div className="flex h-full flex-col">
        <div className="flex items-start justify-between">
          <Sticker tilt={-2}>Log</Sticker>
          <Sticker tilt={2} dark>
            {items.length.toString().padStart(2, "0")} today
          </Sticker>
        </div>

        {!hero ? (
          <p className="my-auto text-center font-mono text-[12px] lowercase tracking-wide opacity-75">
            nothing logged today.
          </p>
        ) : (
          <div className="mt-auto">
            <div
              className="text-[26px] leading-[1.1] sm:text-[30px]"
              style={{
                fontVariationSettings: "'wght' 680, 'wdth' 96, 'opsz' 30",
                letterSpacing: "-0.025em",
              }}
            >
              {hero.activity}
            </div>
            <div className="mt-2 flex items-center gap-3 font-mono text-[10.5px] uppercase tracking-[0.16em] opacity-80">
              <span>{hero.category || "—"}</span>
              <span className="opacity-50">·</span>
              <span>{formatAgo(hero.timestamp, nowMs)}</span>
            </div>

            {rest.length > 0 && (
              <ul className="mt-4 space-y-1.5">
                {rest.map((a) => (
                  <li
                    key={a.id}
                    className="flex items-baseline justify-between text-[13px] opacity-85"
                  >
                    <span className="min-w-0 flex-1 truncate">{a.activity}</span>
                    <span className="ml-3 shrink-0 font-mono text-[10px] tabular-nums opacity-70">
                      {formatAgo(a.timestamp, nowMs)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </BentoCard>
  );
}
