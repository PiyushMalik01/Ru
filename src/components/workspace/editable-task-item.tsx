"use client";

import { useState, useRef, useEffect, useTransition } from "react";
import { CheckCircle2, Circle, X, Calendar } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  renameTaskInWorkspace,
  rescheduleTask,
  toggleTaskCompleteInWorkspace,
  removeFromWorkspace,
} from "@/app/(app)/chat/workspace-actions";
import type { WorkspaceTaskItem } from "@/lib/queries/workspace";
import { useRouter } from "next/navigation";

interface Props {
  workspaceId: string;
  task: WorkspaceTaskItem;
}

const priorityDot: Record<string, string> = {
  low: "bg-success",
  medium: "bg-warning",
  high: "bg-error",
};

function formatDue(due: string | null): string {
  if (!due) return "no date";
  const d = new Date(due);
  if (Number.isNaN(d.getTime())) return "no date";
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  const isTomorrow = d.toDateString() === tomorrow.toDateString();
  if (sameDay) return "today";
  if (isTomorrow) return "tomorrow";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function toInputDate(d: string | null): string {
  if (!d) return "";
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return "";
  return dt.toISOString().slice(0, 10);
}

export function EditableTaskItem({ workspaceId, task }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(task.title);
  const [dateOpen, setDateOpen] = useState(false);
  const [optimisticComplete, setOptimisticComplete] = useState(
    task.status === "completed"
  );
  const [removed, setRemoved] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setTitle(task.title);
    setOptimisticComplete(task.status === "completed");
  }, [task.title, task.status]);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  if (removed) return null;

  const completed = optimisticComplete;
  const dot = priorityDot[task.priority] ?? "bg-muted-foreground/50";

  function commitTitle() {
    const trimmed = title.trim();
    setEditing(false);
    if (!trimmed || trimmed === task.title) {
      setTitle(task.title);
      return;
    }
    startTransition(async () => {
      await renameTaskInWorkspace(task.id, trimmed);
      router.refresh();
    });
  }

  function handleToggle() {
    setOptimisticComplete((v) => !v);
    startTransition(async () => {
      await toggleTaskCompleteInWorkspace(task.id);
      router.refresh();
    });
  }

  function handleReschedule(value: string) {
    setDateOpen(false);
    const iso = value ? new Date(value + "T09:00:00").toISOString() : null;
    startTransition(async () => {
      await rescheduleTask(task.id, iso);
      router.refresh();
    });
  }

  function handleRemove() {
    setRemoved(true);
    startTransition(async () => {
      await removeFromWorkspace(workspaceId, "task", task.id);
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
      <button
        type="button"
        onClick={handleToggle}
        aria-label={completed ? "Mark incomplete" : "Mark complete"}
        className="flex h-4 w-4 shrink-0 items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
      >
        {completed ? (
          <CheckCircle2 className="h-4 w-4 text-success" />
        ) : (
          <Circle className="h-4 w-4" />
        )}
      </button>

      <span
        className={cn(
          "h-1 w-1 shrink-0 rounded-full",
          completed ? "bg-muted-foreground/30" : dot
        )}
        aria-hidden
      />

      <div className="min-w-0 flex-1">
        {editing ? (
          <input
            ref={inputRef}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={commitTitle}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitTitle();
              if (e.key === "Escape") {
                setTitle(task.title);
                setEditing(false);
              }
            }}
            className="w-full bg-transparent text-[13.5px] leading-tight text-foreground focus:outline-none"
          />
        ) : (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className={cn(
              "block w-full truncate text-left text-[13.5px] leading-tight transition-colors",
              completed
                ? "text-muted-foreground line-through"
                : "text-foreground"
            )}
          >
            {task.title}
          </button>
        )}
      </div>

      <div className="relative shrink-0">
        <button
          type="button"
          onClick={() => setDateOpen((v) => !v)}
          className={cn(
            "flex items-center gap-1 rounded-sm font-mono text-[10px] uppercase tracking-[0.12em] transition-colors",
            task.due_at
              ? "text-muted-foreground hover:text-foreground"
              : "text-muted-foreground/50 hover:text-muted-foreground"
          )}
        >
          <Calendar className="h-3 w-3" aria-hidden />
          {formatDue(task.due_at)}
        </button>
        {dateOpen && (
          <div
            className="absolute right-0 top-full z-30 mt-1 rounded-md border border-border bg-popover p-2 shadow-lg"
            onMouseLeave={() => setDateOpen(false)}
          >
            <input
              type="date"
              defaultValue={toInputDate(task.due_at)}
              onChange={(e) => handleReschedule(e.target.value)}
              className="bg-transparent font-mono text-[11px] text-foreground focus:outline-none"
              autoFocus
            />
            {task.due_at && (
              <button
                type="button"
                onClick={() => handleReschedule("")}
                className="ml-2 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground hover:text-foreground"
              >
                clear
              </button>
            )}
          </div>
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
