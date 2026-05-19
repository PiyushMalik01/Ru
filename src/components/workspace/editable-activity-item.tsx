"use client";

import { useState, useTransition } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { removeFromWorkspace } from "@/app/(app)/chat/workspace-actions";
import type { WorkspaceActivityItem } from "@/lib/queries/workspace";
import { useRouter } from "next/navigation";
import { useRelativeTime } from "@/lib/hooks/use-relative-time";

interface Props {
  workspaceId: string;
  activity: WorkspaceActivityItem;
}

export function EditableActivityItem({ workspaceId, activity }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [removed, setRemoved] = useState(false);
  const when = useRelativeTime(activity.timestamp);

  if (removed) return null;

  function handleRemove() {
    setRemoved(true);
    startTransition(async () => {
      await removeFromWorkspace(workspaceId, "activity", activity.id);
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
      <span
        className="h-1 w-1 shrink-0 rounded-full bg-muted-foreground/40"
        aria-hidden
      />

      <div className="min-w-0 flex-1">
        <div className="truncate text-[13.5px] leading-tight text-foreground">
          {activity.activity}
        </div>
      </div>

      <div className="shrink-0 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
        {activity.category} · {when}
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
