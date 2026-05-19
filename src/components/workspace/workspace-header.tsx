"use client";

import { useState, useRef, useEffect, useTransition } from "react";
import {
  ChevronDown,
  Archive,
  Edit3,
  PanelRightClose,
  Check,
} from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import type { WorkspaceSummary } from "@/lib/queries/workspace";
import {
  setActiveWorkspace,
  renameWorkspace,
  archiveWorkspace,
} from "@/app/(app)/chat/workspace-actions";
import { confirm } from "@/lib/stores/confirm-store";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useRouter } from "next/navigation";

interface Props {
  workspaces: WorkspaceSummary[];
  currentWorkspaceId: string | null;
  currentWorkspace: WorkspaceSummary | null;
  itemCount: number;
  onCollapse: () => void;
}

function weekdayLabel(): string {
  return new Date().toLocaleDateString([], { weekday: "long" });
}

function ageLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const diff = Date.now() - d.getTime();
  const mins = Math.round(diff / 60_000);
  if (mins < 60) return mins < 1 ? "just now" : `${mins}m old`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h old`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d old`;
  const weeks = Math.round(days / 7);
  return `${weeks}w old`;
}

export function WorkspaceHeader({
  workspaces,
  currentWorkspaceId,
  currentWorkspace,
  itemCount,
  onCollapse,
}: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(currentWorkspace?.title ?? "");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setTitle(currentWorkspace?.title ?? "");
  }, [currentWorkspace?.title]);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  function commitTitle() {
    setEditing(false);
    const trimmed = title.trim();
    if (!currentWorkspace || !trimmed || trimmed === currentWorkspace.title) {
      setTitle(currentWorkspace?.title ?? "");
      return;
    }
    startTransition(async () => {
      await renameWorkspace(currentWorkspace.id, trimmed);
      router.refresh();
    });
  }

  function handleSwitch(id: string | null) {
    startTransition(async () => {
      await setActiveWorkspace(id);
      router.refresh();
    });
  }

  async function handleArchive() {
    if (!currentWorkspace) return;
    const ok = await confirm({
      title: `Archive "${currentWorkspace.title}"?`,
      description: "Items inside the workspace stay where they are — the workspace itself is just hidden from the list.",
      confirmLabel: "Archive",
    });
    if (!ok) return;
    startTransition(async () => {
      await archiveWorkspace(currentWorkspace.id);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-1 pb-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="mb-1 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            workspace
          </div>
          {currentWorkspace ? (
            editing ? (
              <input
                ref={inputRef}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onBlur={commitTitle}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitTitle();
                  if (e.key === "Escape") {
                    setTitle(currentWorkspace.title);
                    setEditing(false);
                  }
                }}
                maxLength={120}
                className="w-full bg-transparent text-[19px] font-medium tracking-tight text-foreground focus:outline-none"
              />
            ) : (
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="group/title flex w-full items-center gap-2 text-left text-[19px] font-medium tracking-tight text-foreground"
              >
                <span className="truncate">{currentWorkspace.title}</span>
                <Edit3 className="h-3 w-3 shrink-0 text-muted-foreground/40 opacity-0 transition-opacity group-hover/title:opacity-100" />
              </button>
            )
          ) : (
            <h2 className="text-[19px] font-medium tracking-tight text-foreground">
              Today
            </h2>
          )}
          <p className="mt-1 font-mono text-[11px] tracking-tight text-muted-foreground">
            {currentWorkspace ? (
              <>
                <span className="text-foreground/80">{itemCount}</span>{" "}
                {itemCount === 1 ? "item" : "items"}
                <span className="mx-1.5 opacity-40">·</span>
                {ageLabel(currentWorkspace.created_at)}
              </>
            ) : (
              <>What&rsquo;s on for {weekdayLabel().toLowerCase()}.</>
            )}
          </p>
          {currentWorkspace && (
            <Link
              href={`/plans/${currentWorkspace.id}`}
              className="ru-link mt-2 inline-block font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground/70 hover:text-foreground"
            >
              open as page ↗
            </Link>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-0.5">
          {currentWorkspace && (
            <button
              type="button"
              onClick={handleArchive}
              aria-label="Archive workspace"
              className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            >
              <Archive className="h-3.5 w-3.5" />
            </button>
          )}
          <button
            type="button"
            onClick={onCollapse}
            aria-label="Collapse panel"
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            <PanelRightClose className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className="mt-3">
        <DropdownMenu>
          <DropdownMenuTrigger className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground transition-colors hover:text-foreground">
            <span>switch workspace</span>
            <ChevronDown className="h-3 w-3" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-[260px]">
            {workspaces.length === 0 ? (
              <div className="px-2 py-2 text-[12px] text-muted-foreground">
                No workspaces yet.
              </div>
            ) : (
              <>
                <DropdownMenuItem
                  onClick={() => handleSwitch(null)}
                  className={cn(
                    "flex items-center justify-between gap-2",
                    currentWorkspaceId === null && "bg-accent/40"
                  )}
                >
                  <span className="flex items-center gap-2">
                    <span className="text-[13px]">Today</span>
                  </span>
                  {currentWorkspaceId === null && (
                    <Check className="h-3 w-3 text-muted-foreground" />
                  )}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                {workspaces.map((w) => (
                  <DropdownMenuItem
                    key={w.id}
                    onClick={() => handleSwitch(w.id)}
                    className={cn(
                      "flex items-center justify-between gap-2",
                      currentWorkspaceId === w.id && "bg-accent/40"
                    )}
                  >
                    <span className="min-w-0 flex-1 truncate text-[13px]">
                      {w.title}
                    </span>
                    <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                      {w.itemCount}
                    </span>
                  </DropdownMenuItem>
                ))}
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
