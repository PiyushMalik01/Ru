"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { ArrowUpRight, Plus, RotateCcw } from "lucide-react";
import { trackerColor } from "@/lib/trackers/color";
import { cn } from "@/lib/utils";
import { deleteTrackerEntryInline } from "@/app/(app)/chat/card-actions";
import {
  CardActions,
  CardLabel,
  CardMeta,
  SecondaryAction,
  ActionError,
} from "./task-card";

export type TrackerCardData =
  | TrackerCreatedCard
  | TrackerEntryCard
  | TrackerUpdatedCard
  | TrackerArchivedCard;

interface TrackerCreatedCard {
  kind: "created";
  id: string;
  name: string;
  description?: string | null;
  fields: Array<{ key: string; label: string; type: string; unit?: string }>;
  primary_field?: string | null;
}

interface TrackerEntryCard {
  kind: "entry";
  /** ID of the tracker_entries row — needed to support inline undo. */
  entry_id?: string;
  tracker_id: string;
  tracker_name: string;
  values: Record<string, number | string>;
  missing: string[];
  entered_at: string;
  fields: Array<{ key: string; label: string; type: string; unit?: string }>;
}

interface TrackerUpdatedCard {
  kind: "updated";
  id: string;
  name: string;
  fields: Array<{ key: string; label: string; type: string; unit?: string }>;
}

interface TrackerArchivedCard {
  kind: "archived";
  id: string;
  name: string;
}

export function TrackerCard({ data }: { data: TrackerCardData }) {
  if (data.kind === "archived") return <ArchivedView data={data} />;
  if (data.kind === "entry") return <EntryView data={data} />;
  return <DefinitionView data={data} />;
}

function DefinitionView({
  data,
}: {
  data: TrackerCreatedCard | TrackerUpdatedCard;
}) {
  const color = trackerColor(data.id);
  const label = data.kind === "created" ? "tracker · new" : "tracker · updated";

  return (
    <div
      className="block w-full overflow-hidden rounded-2xl transition-transform hover:-translate-y-0.5"
      style={{ background: color.bg, color: color.fg }}
    >
      <div className="flex items-center gap-2 px-5 pt-4">
        <CardLabel>{label}</CardLabel>
      </div>

      <div className="px-5 pb-2 pt-1">
        <div
          className="text-[28px] leading-[1.04]"
          style={{
            fontVariationSettings: "'wght' 680, 'wdth' 96, 'opsz' 32",
            letterSpacing: "-0.025em",
          }}
        >
          {data.name}
        </div>
        {data.kind === "created" && data.description ? (
          <div
            className="mt-1 text-[13px] opacity-85"
            style={{ lineHeight: 1.45 }}
          >
            {data.description}
          </div>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-1.5 px-5 pb-3 pt-2">
        {data.fields.map((f) => (
          <span
            key={f.key}
            className="rounded-full border border-black/20 bg-black/10 px-2.5 py-0.5 text-[10px] uppercase tracking-[0.14em]"
            style={{ fontVariationSettings: "'wght' 580, 'wdth' 100" }}
          >
            {f.label}
            {f.unit ? ` · ${f.unit}` : ""}
          </span>
        ))}
      </div>

      <CardActions>
        <Link
          href={`/trackers/${data.id}`}
          className="inline-flex items-center gap-1.5 rounded-full bg-black/85 px-3 py-1.5 text-[11.5px] text-white transition-colors hover:bg-black"
          style={{ fontVariationSettings: "'wght' 580, 'wdth' 96" }}
        >
          <Plus className="h-3 w-3" strokeWidth={3} />
          log entry
        </Link>
        <Link
          href={`/trackers/${data.id}`}
          className="inline-flex items-center gap-1.5 rounded-full bg-transparent px-3 py-1.5 text-[11.5px] opacity-65 transition-opacity hover:bg-black/8 hover:opacity-100"
          style={{ fontVariationSettings: "'wght' 580, 'wdth' 96" }}
        >
          open tracker
          <ArrowUpRight className="h-3 w-3" strokeWidth={2.25} />
        </Link>
      </CardActions>
    </div>
  );
}

function EntryView({ data }: { data: TrackerEntryCard }) {
  const color = trackerColor(data.tracker_id);
  const [deleted, setDeleted] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const valueRows = data.fields
    .filter((f) => data.values[f.key] !== undefined)
    .map((f) => ({
      label: f.label,
      unit: f.unit,
      value: data.values[f.key],
    }));

  const when = new Date(data.entered_at).toLocaleString("en-US", {
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
  });

  function doDelete() {
    if (!data.entry_id) {
      setError("Can't undo — entry id missing.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await deleteTrackerEntryInline(data.entry_id!);
      if (res.ok) setDeleted(true);
      else setError(res.error ?? "Couldn't undo.");
    });
  }

  return (
    <div
      className="block w-full overflow-hidden rounded-2xl transition-transform hover:-translate-y-0.5"
      style={{ background: color.bg, color: color.fg }}
    >
      <div className="flex items-center gap-2 px-5 pt-4">
        <CardLabel>tracker · entry</CardLabel>
        <span className="opacity-40">·</span>
        <CardMeta>{when}</CardMeta>
      </div>

      <div className="px-5 pt-1">
        <div
          className={cn(
            "text-[15px] opacity-90",
            deleted && "line-through opacity-50",
          )}
          style={{ fontVariationSettings: "'wght' 560, 'wdth' 96" }}
        >
          {data.tracker_name}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 px-5 pt-3 sm:grid-cols-3">
        {valueRows.map((r, i) => (
          <div key={i} className="min-w-0">
            <div
              className={cn(
                "font-display text-[26px] leading-none tabular-nums",
                deleted && "opacity-50",
              )}
              style={{ fontVariationSettings: "'wght' 620, 'opsz' 72" }}
            >
              {typeof r.value === "number" ? formatNum(r.value) : String(r.value)}
              {r.unit && (
                <span className="ml-1 text-[12px] opacity-65">{r.unit}</span>
              )}
            </div>
            <div
              className="mt-1 truncate text-[10px] uppercase tracking-[0.14em] opacity-70"
              style={{ fontVariationSettings: "'wght' 580, 'wdth' 100" }}
            >
              {r.label}
            </div>
          </div>
        ))}
      </div>

      {data.missing.length > 0 && !deleted && (
        <div
          className="mt-3 border-t border-black/15 px-5 py-2 text-[10px] uppercase tracking-[0.14em] opacity-70"
          style={{ fontVariationSettings: "'wght' 580, 'wdth' 100" }}
        >
          missing: {data.missing.join(", ")}
        </div>
      )}

      <CardActions>
        {!deleted ? (
          <>
            {data.entry_id && (
              <SecondaryAction onClick={doDelete} pending={pending}>
                <RotateCcw className="h-3 w-3" strokeWidth={2.5} />
                undo
              </SecondaryAction>
            )}
            <Link
              href={`/trackers/${data.tracker_id}`}
              className="inline-flex items-center gap-1.5 rounded-full bg-black/85 px-3 py-1.5 text-[11.5px] text-white transition-colors hover:bg-black"
              style={{ fontVariationSettings: "'wght' 580, 'wdth' 96" }}
            >
              <Plus className="h-3 w-3" strokeWidth={3} />
              log another
            </Link>
            <Link
              href={`/trackers/${data.tracker_id}`}
              className="inline-flex items-center gap-1.5 rounded-full bg-transparent px-3 py-1.5 text-[11.5px] opacity-65 transition-opacity hover:bg-black/8 hover:opacity-100"
              style={{ fontVariationSettings: "'wght' 580, 'wdth' 96" }}
            >
              open tracker
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

function ArchivedView({ data }: { data: TrackerArchivedCard }) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-2xl border border-border bg-card px-5 py-3 text-foreground",
      )}
    >
      <Plus className="h-3.5 w-3.5 -rotate-45 opacity-50" aria-hidden />
      <span
        className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground"
        style={{ fontVariationSettings: "'wght' 600, 'wdth' 100" }}
      >
        tracker archived
      </span>
      <span className="opacity-40">·</span>
      <span className="text-[14px]">{data.name}</span>
    </div>
  );
}

function formatNum(n: number): string {
  if (Number.isInteger(n)) return n.toString();
  return n.toFixed(n < 10 ? 1 : 0);
}
