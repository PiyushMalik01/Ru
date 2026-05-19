"use client";

import { useState, useTransition } from "react";
import { Trash2 } from "lucide-react";
import { deleteEntryAction } from "@/app/(app)/trackers/actions";
import type { TrackerEntry, TrackerField } from "@/lib/queries/trackers";
import { confirm } from "@/lib/stores/confirm-store";

interface Props {
  trackerId: string;
  entries: TrackerEntry[];
  fields: TrackerField[];
}

export function TrackerEntriesTable({ trackerId, entries, fields }: Props) {
  if (entries.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-[var(--hairline)] bg-[var(--secondary)]/20 px-5 py-7 text-[14px] text-muted-foreground">
        No entries yet. Log your first one above — or just tell Ru.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-[var(--hairline)]">
      <table className="w-full text-[13px]">
        <thead>
          <tr className="bg-[var(--secondary)]/40 text-left font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
            <th className="px-4 py-2 font-normal">when</th>
            {fields.map((f) => (
              <th key={f.key} className="px-4 py-2 font-normal">
                {f.label}
                {f.unit && <span className="ml-1 opacity-60">{f.unit}</span>}
              </th>
            ))}
            <th className="px-4 py-2 font-normal">notes</th>
            <th className="w-8" />
          </tr>
        </thead>
        <tbody>
          {entries.map((e) => (
            <EntryRow key={e.id} trackerId={trackerId} entry={e} fields={fields} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function EntryRow({
  trackerId,
  entry,
  fields,
}: {
  trackerId: string;
  entry: TrackerEntry;
  fields: TrackerField[];
}) {
  const [hidden, setHidden] = useState(false);
  const [isPending, startTransition] = useTransition();

  async function remove() {
    const ok = await confirm({
      title: "Delete this entry?",
      description: "Removing this entry won't affect the rest of the tracker — just this single log.",
      confirmLabel: "Delete entry",
      destructive: true,
    });
    if (!ok) return;
    setHidden(true);
    const fd = new FormData();
    fd.set("trackerId", trackerId);
    fd.set("entryId", entry.id);
    startTransition(async () => {
      await deleteEntryAction(fd);
    });
  }

  if (hidden) return null;

  const when = new Date(entry.entered_at).toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

  return (
    <tr className="group border-t border-[var(--hairline-soft)] text-foreground">
      <td className="px-4 py-2 align-top font-mono text-[11px] text-muted-foreground tabular-nums">
        {when}
      </td>
      {fields.map((f) => {
        const v = entry.values?.[f.key];
        return (
          <td key={f.key} className="px-4 py-2 align-top tabular-nums">
            {v === undefined || v === null || v === "" ? (
              <span className="text-muted-foreground/40">—</span>
            ) : typeof v === "number" ? (
              formatNum(v)
            ) : (
              String(v)
            )}
          </td>
        );
      })}
      <td className="px-4 py-2 align-top text-muted-foreground">
        {entry.notes || <span className="opacity-40">—</span>}
      </td>
      <td className="w-8 px-2 align-top">
        <button
          type="button"
          onClick={remove}
          disabled={isPending}
          className="invisible rounded-full p-1 text-muted-foreground transition-colors hover:text-destructive group-hover:visible"
          aria-label="Delete entry"
        >
          <Trash2 className="h-3 w-3" />
        </button>
      </td>
    </tr>
  );
}

function formatNum(n: number): string {
  if (Number.isInteger(n)) return n.toString();
  if (Math.abs(n) >= 100) return n.toFixed(0);
  return n.toFixed(1);
}
