"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { RotateCcw, ArrowUpRight } from "lucide-react";
import { useRelativeTime } from "@/lib/hooks/use-relative-time";
import { deleteActivityInline } from "@/app/(app)/chat/card-actions";
import {
  CardActions,
  CardLabel,
  SecondaryAction,
  ActionError,
} from "./task-card";

export interface ActivityCardData {
  id: string;
  activity: string;
  category?: string;
  duration_minutes?: number;
  timestamp?: string;
}

function formatDuration(min?: number): string {
  if (!min) return "";
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  const rem = min % 60;
  return rem === 0 ? `${h}h` : `${h}h ${rem}m`;
}

// Full magenta tile, white type.
export function ActivityCard({ data }: { data: ActivityCardData }) {
  const [deleted, setDeleted] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const dur = formatDuration(data.duration_minutes);
  const rel = useRelativeTime(data.timestamp ?? null);

  function doDelete() {
    setError(null);
    startTransition(async () => {
      const res = await deleteActivityInline(data.id);
      if (res.ok) {
        setDeleted(true);
        router.refresh();
      } else setError(res.error ?? "Couldn't undo.");
    });
  }

  return (
    <div
      className="block w-full overflow-hidden rounded-2xl transition-transform hover:-translate-y-0.5"
      style={{
        background: "var(--entity-activity)",
        color: "var(--entity-activity-fg)",
      }}
    >
      <div className="flex items-center gap-3 px-5 py-4">
        <CardLabel>logged</CardLabel>
        <div
          className={
            deleted
              ? "min-w-0 flex-1 truncate text-[14.5px] leading-tight line-through opacity-60"
              : "min-w-0 flex-1 truncate text-[14.5px] leading-tight"
          }
          style={{ fontVariationSettings: "'wght' 580, 'wdth' 96" }}
        >
          {data.activity}
        </div>
        {data.category && (
          <span
            className="shrink-0 rounded-full bg-white/15 px-2 py-0.5 text-[10px] lowercase tracking-wide"
            style={{ fontVariationSettings: "'wght' 580, 'wdth' 100" }}
          >
            {data.category}
          </span>
        )}
        {dur && (
          <span
            className="shrink-0 text-[11px] tabular-nums opacity-90"
            style={{ fontVariationSettings: "'wght' 580, 'wdth' 100" }}
          >
            {dur}
          </span>
        )}
        {rel && (
          <span
            className="shrink-0 text-[11px] opacity-85"
            style={{ fontVariationSettings: "'wght' 540, 'wdth' 100" }}
          >
            {rel}
          </span>
        )}
      </div>

      <CardActions>
        {!deleted ? (
          <>
            <SecondaryAction onClick={doDelete} pending={pending}>
              <RotateCcw className="h-3 w-3" strokeWidth={2.5} />
              undo
            </SecondaryAction>
            <Link
              href="/sheet"
              className="inline-flex items-center gap-1.5 rounded-full bg-transparent px-3 py-1.5 text-[11.5px] opacity-65 transition-opacity hover:bg-black/8 hover:opacity-100"
              style={{ fontVariationSettings: "'wght' 580, 'wdth' 96" }}
            >
              open log
              <ArrowUpRight className="h-3 w-3" strokeWidth={2.25} />
            </Link>
          </>
        ) : (
          <span
            className="inline-flex items-center gap-1.5 rounded-full bg-black/85 px-3 py-1.5 text-[11.5px] text-white"
            style={{ fontVariationSettings: "'wght' 580, 'wdth' 96" }}
          >
            <RotateCcw className="h-3 w-3" strokeWidth={3} />
            removed
          </span>
        )}
      </CardActions>
      {error && <ActionError>{error}</ActionError>}
    </div>
  );
}
