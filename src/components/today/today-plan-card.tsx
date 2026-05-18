import Link from "next/link";
import { HairlineProgress, formatAgo } from "@/components/app-shell/primitives";

interface Props {
  id: string;
  title: string;
  description: string | null;
  itemCount: number;
  /** Items already marked done. */
  doneCount: number;
  /** ISO of the most recent activity in the plan, if any. */
  lastActivityIso: string | null;
  /** Free-form one-line "next action" if known. */
  nextAction: string | null;
  /** A stable rendered timestamp. */
  nowMs: number;
}

export function TodayPlanCard({
  id,
  title,
  description,
  itemCount,
  doneCount,
  lastActivityIso,
  nextAction,
  nowMs,
}: Props) {
  const pct = itemCount > 0 ? Math.round((doneCount / itemCount) * 100) : 0;

  return (
    <Link
      href={`/plans/${id}`}
      className="group block border-b border-[rgba(255,255,255,0.05)] py-4 last:border-b-0"
    >
      <div className="flex items-baseline justify-between gap-4">
        <h3 className="truncate text-[15px] font-medium leading-tight">
          <span className="ru-link">{title}</span>
        </h3>
        <span className="shrink-0 font-mono text-[10.5px] tabular-nums text-muted-foreground">
          {doneCount.toString().padStart(2, "0")}
          <span className="opacity-50"> / </span>
          {itemCount.toString().padStart(2, "0")}
        </span>
      </div>

      {description ? (
        <p className="mt-1 line-clamp-1 text-[13px] text-muted-foreground">{description}</p>
      ) : null}

      <div className="mt-3">
        <HairlineProgress value={pct} />
      </div>

      <div className="mt-2 flex items-baseline justify-between gap-4 font-mono text-[10.5px] uppercase tracking-[0.14em] text-muted-foreground">
        <span>
          {nextAction ? (
            <>
              <span className="text-muted-foreground/60">next · </span>
              <span className="text-foreground/80 normal-case tracking-normal">{nextAction}</span>
            </>
          ) : (
            <span className="text-muted-foreground/60">{pct}% complete</span>
          )}
        </span>
        {lastActivityIso ? (
          <span className="text-muted-foreground/60 normal-case tracking-normal">
            {formatAgo(lastActivityIso, nowMs)}
          </span>
        ) : null}
      </div>
    </Link>
  );
}
