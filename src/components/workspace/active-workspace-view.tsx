"use client";

import type { WorkspaceDetail } from "@/lib/queries/workspace";
import { WorkspaceItemList } from "./workspace-item-list";

interface Props {
  detail: WorkspaceDetail;
}

export function ActiveWorkspaceView({ detail }: Props) {
  const tasks = detail.items.filter((i) => i.kind === "task");
  const completed = tasks.filter(
    (t) => t.kind === "task" && t.status === "completed"
  ).length;
  const totalTasks = tasks.length;
  const pct = totalTasks > 0 ? Math.round((completed / totalTasks) * 100) : 0;

  return (
    <div className="flex flex-col">
      {detail.workspace.description && (
        <p className="mb-5 max-w-[44ch] text-[13px] leading-relaxed text-muted-foreground">
          {detail.workspace.description}
        </p>
      )}

      {totalTasks > 0 && (
        <div className="mb-5">
          <div className="flex items-baseline justify-between font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            <span>progress</span>
            <span>
              <span className="text-foreground">{completed}</span>
              <span className="opacity-60"> / {totalTasks}</span>
            </span>
          </div>
          <div className="mt-2 h-px w-full bg-border">
            <div
              className="h-px bg-foreground transition-all duration-500"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      )}

      <div className="mb-2 flex items-baseline justify-between">
        <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          items
        </div>
        <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground/60">
          {detail.items.length}
        </div>
      </div>

      <WorkspaceItemList
        workspaceId={detail.workspace.id}
        items={detail.items}
      />
    </div>
  );
}
