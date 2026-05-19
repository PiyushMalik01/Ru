"use client";

import { useState, useTransition } from "react";
import { Bell, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { removeFromWorkspace } from "@/app/(app)/chat/workspace-actions";
import type { WorkspaceReminderItem } from "@/lib/queries/workspace";
import { useRouter } from "next/navigation";

interface Props {
  workspaceId: string;
  reminder: WorkspaceReminderItem;
}

function formatRemind(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const time = d
    .toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
    .toLowerCase()
    .replace(" ", "");
  if (sameDay) return `today ${time}`;
  const day = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return `${day} ${time}`;
}

export function EditableReminderItem({ workspaceId, reminder }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [removed, setRemoved] = useState(false);

  if (removed) return null;

  function handleRemove() {
    setRemoved(true);
    startTransition(async () => {
      await removeFromWorkspace(workspaceId, "reminder", reminder.id);
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
        <Bell className="h-3.5 w-3.5" aria-hidden />
      </span>

      <div className="min-w-0 flex-1">
        <div className="truncate text-[13.5px] leading-tight text-foreground">
          {reminder.title}
        </div>
      </div>

      <div className="shrink-0 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
        {formatRemind(reminder.remind_at)}
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
