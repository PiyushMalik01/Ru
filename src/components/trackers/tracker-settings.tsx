"use client";

import { useState, useTransition } from "react";
import { Archive, Check, Pencil, X } from "lucide-react";
import {
  archiveTrackerAction,
  renameTrackerAction,
  setChartTypeAction,
} from "@/app/(app)/trackers/actions";
import { confirm } from "@/lib/stores/confirm-store";
import { cn } from "@/lib/utils";

interface Props {
  trackerId: string;
  trackerName: string;
  chartType: "line" | "bar" | "area";
}

const CHART_OPTIONS: Array<{ value: "line" | "bar" | "area"; label: string }> = [
  { value: "line", label: "Line" },
  { value: "area", label: "Area" },
  { value: "bar", label: "Bar" },
];

export function TrackerSettings({ trackerId, trackerName, chartType }: Props) {
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(trackerName);
  const [isPending, startTransition] = useTransition();

  function commitName() {
    if (!name.trim() || name.trim() === trackerName) {
      setRenaming(false);
      setName(trackerName);
      return;
    }
    const fd = new FormData();
    fd.set("trackerId", trackerId);
    fd.set("newName", name.trim());
    startTransition(async () => {
      await renameTrackerAction(fd);
      setRenaming(false);
    });
  }

  function changeChart(value: "line" | "bar" | "area") {
    if (value === chartType) return;
    const fd = new FormData();
    fd.set("trackerId", trackerId);
    fd.set("chartType", value);
    startTransition(async () => {
      await setChartTypeAction(fd);
    });
  }

  async function archive() {
    const ok = await confirm({
      title: `Archive ${trackerName}?`,
      description: "Entries stay in the database; the tracker just stops showing on /routines. You can recover it from settings later.",
      confirmLabel: "Archive",
    });
    if (!ok) return;
    const fd = new FormData();
    fd.set("trackerId", trackerId);
    startTransition(async () => {
      await archiveTrackerAction(fd);
    });
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--hairline)] bg-[var(--card)] px-4 py-2.5">
      <div className="flex items-center gap-2">
        {renaming ? (
          <>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  commitName();
                }
                if (e.key === "Escape") {
                  setRenaming(false);
                  setName(trackerName);
                }
              }}
              className="rounded-sm border-b border-foreground bg-transparent px-1 py-0.5 text-[14px] text-foreground focus:outline-none"
            />
            <button
              type="button"
              onClick={commitName}
              disabled={isPending}
              className="rounded-full p-1 text-foreground hover:bg-foreground/10"
              aria-label="Save name"
            >
              <Check className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => {
                setRenaming(false);
                setName(trackerName);
              }}
              className="rounded-full p-1 text-muted-foreground hover:bg-foreground/10 hover:text-foreground"
              aria-label="Cancel"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => setRenaming(true)}
            className="flex items-center gap-2 rounded-md px-1.5 py-1 text-[13px] text-muted-foreground transition-colors hover:bg-[var(--secondary)]/40 hover:text-foreground"
          >
            <Pencil className="h-3 w-3" />
            Rename
          </button>
        )}
      </div>

      <div className="flex items-center gap-1 rounded-full bg-[var(--secondary)] p-0.5">
        {CHART_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => changeChart(opt.value)}
            className={cn(
              "rounded-full px-3 py-1 font-mono text-[10px] uppercase tracking-[0.14em] transition-colors",
              opt.value === chartType
                ? "bg-foreground text-background"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <button
        type="button"
        onClick={archive}
        disabled={isPending}
        className="flex items-center gap-1.5 rounded-md px-2 py-1 text-[12px] text-muted-foreground transition-colors hover:bg-[var(--secondary)]/40 hover:text-foreground"
      >
        <Archive className="h-3 w-3" />
        Archive
      </button>
    </div>
  );
}
