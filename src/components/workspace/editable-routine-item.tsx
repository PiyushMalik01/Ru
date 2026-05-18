"use client";

import { useState, useTransition } from "react";
import { Repeat, Clock, Flame, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { removeFromWorkspace } from "@/app/(app)/chat/workspace-actions";
import type { WorkspaceRoutineItem } from "@/lib/queries/workspace";
import { useRouter } from "next/navigation";

interface Props {
  workspaceId: string;
  routine: WorkspaceRoutineItem & { streak?: number };
}

function frequencyLabel(f: string): string {
  if (f === "daily") return "daily";
  if (f === "weekdays") return "wkdays";
  if (f === "weekly") return "weekly";
  return "custom";
}

function formatTime(t: string | null): string | null {
  if (!t) return null;
  // t is "HH:MM:SS" or "HH:MM"
  const [h, m] = t.split(":").map((x) => Number.parseInt(x, 10));
  if (Number.isNaN(h)) return null;
  const period = h >= 12 ? "pm" : "am";
  const hour12 = h % 12 || 12;
  return `${hour12}:${String(m ?? 0).padStart(2, "0")}${period}`;
}

export function EditableRoutineItem({ workspaceId, routine }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [removed, setRemoved] = useState(false);

  if (removed) return null;

  const time = formatTime(routine.time_of_day);
  const streak = routine.streak ?? 0;

  function handleRemove() {
    setRemoved(true);
    startTransition(async () => {
      await removeFromWorkspace(workspaceId, "routine", routine.id);
      router.refresh();
    });
  }

  return (
    <div
      className={cn(
        "group/row relative flex items-center gap-3 border-b border-border/60 py-2.5 pl-1 pr-2 transition-colors",
        "hover:bg-[rgba(255,255,255,0.02)]",
        isPending && "opacity-70"
      )}
    >
      <span className="flex h-4 w-4 shrink-0 items-center justify-center text-muted-foreground">
        <Repeat className="h-3.5 w-3.5" aria-hidden />
      </span>

      <div className="min-w-0 flex-1">
        <div className="truncate text-[13.5px] leading-tight text-foreground">
          {routine.title}
        </div>
      </div>

      {streak > 0 && (
        <div className="flex shrink-0 items-center gap-0.5 font-mono text-[10px] uppercase tracking-[0.12em] text-warning">
          <Flame className="h-3 w-3" aria-hidden />
          {streak}
        </div>
      )}

      <div className="flex shrink-0 items-center gap-2 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
        <span>{frequencyLabel(routine.frequency)}</span>
        {time && (
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" aria-hidden />
            {time}
          </span>
        )}
      </div>

      <button
        type="button"
        onClick={handleRemove}
        aria-label="Remove from workspace"
        className="ml-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-sm text-muted-foreground/40 opacity-0 transition-all hover:bg-secondary hover:text-foreground group-hover/row:opacity-100"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}
