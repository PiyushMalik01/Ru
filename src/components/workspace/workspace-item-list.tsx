"use client";

import type { WorkspaceItem } from "@/lib/queries/workspace";
import { EditableTaskItem } from "./editable-task-item";
import { EditableRoutineItem } from "./editable-routine-item";
import { EditableReminderItem } from "./editable-reminder-item";
import { EditableActivityItem } from "./editable-activity-item";

interface Props {
  workspaceId: string;
  items: WorkspaceItem[];
}

export function WorkspaceItemList({ workspaceId, items }: Props) {
  if (items.length === 0) {
    return (
      <div className="border-t border-border/60 pt-6 text-center">
        <div className="mx-auto max-w-[28ch]">
          <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            empty workspace
          </div>
          <p className="mt-3 text-[13px] leading-relaxed text-muted-foreground">
            Tell Ru what you&rsquo;re working on and it will start collecting
            items here.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="border-t border-border/60">
      {items.map((item) => {
        if (item.kind === "task") {
          return (
            <EditableTaskItem
              key={`task-${item.id}`}
              workspaceId={workspaceId}
              task={item}
            />
          );
        }
        if (item.kind === "routine") {
          return (
            <EditableRoutineItem
              key={`routine-${item.id}`}
              workspaceId={workspaceId}
              routine={item}
            />
          );
        }
        if (item.kind === "reminder") {
          return (
            <EditableReminderItem
              key={`reminder-${item.id}`}
              workspaceId={workspaceId}
              reminder={item}
            />
          );
        }
        if (item.kind === "activity") {
          return (
            <EditableActivityItem
              key={`activity-${item.id}`}
              workspaceId={workspaceId}
              activity={item}
            />
          );
        }
        return null;
      })}
    </div>
  );
}
