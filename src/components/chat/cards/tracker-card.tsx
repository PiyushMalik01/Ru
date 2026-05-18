"use client";

import Link from "next/link";
import { ArrowUpRight, Plus } from "lucide-react";
import { trackerColor } from "@/lib/trackers/color";
import { cn } from "@/lib/utils";

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
  // created and updated share the same look — a tracker definition card.
  return <DefinitionView data={data} />;
}

function DefinitionView({ data }: { data: TrackerCreatedCard | TrackerUpdatedCard }) {
  const color = trackerColor(data.id);
  const label = data.kind === "created" ? "tracker · new" : "tracker · updated";

  return (
    <Link
      href={`/trackers/${data.id}`}
      className="group block w-full overflow-hidden rounded-2xl transition-transform hover:-translate-y-0.5"
      style={{ background: color.bg, color: color.fg }}
    >
      <div className="flex items-center gap-2 px-5 pt-4">
        <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] opacity-75">
          {label}
        </span>
        <ArrowUpRight
          className="ml-auto h-3.5 w-3.5 opacity-60 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
          aria-hidden
        />
      </div>

      <div className="px-5 pb-2 pt-1">
        <div className="font-display text-[28px] leading-[1.04] tracking-tight">
          {data.name}
        </div>
        {data.kind === "created" && data.description ? (
          <div className="mt-1 text-[13px] opacity-85" style={{ lineHeight: 1.45 }}>
            {data.description}
          </div>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-1.5 px-5 pb-4 pt-2">
        {data.fields.map((f) => (
          <span
            key={f.key}
            className="rounded-full border border-black/20 bg-black/10 px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.14em]"
          >
            {f.label}
            {f.unit ? ` · ${f.unit}` : ""}
          </span>
        ))}
      </div>
    </Link>
  );
}

function EntryView({ data }: { data: TrackerEntryCard }) {
  const color = trackerColor(data.tracker_id);
  const valueRows = data.fields
    .filter((f) => data.values[f.key] !== undefined)
    .map((f) => ({
      label: f.label,
      unit: f.unit,
      value: data.values[f.key],
    }));

  const when = new Date(data.entered_at).toLocaleString([], {
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
  });

  return (
    <Link
      href={`/trackers/${data.tracker_id}`}
      className="group block w-full overflow-hidden rounded-2xl transition-transform hover:-translate-y-0.5"
      style={{ background: color.bg, color: color.fg }}
    >
      <div className="flex items-center gap-2 px-5 pt-4">
        <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] opacity-75">
          tracker · entry
        </span>
        <span className="opacity-40">·</span>
        <span className="font-mono text-[10px] uppercase tracking-[0.16em] opacity-80">
          {when}
        </span>
        <ArrowUpRight
          className="ml-auto h-3.5 w-3.5 opacity-60 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
          aria-hidden
        />
      </div>

      <div className="px-5 pt-1">
        <div className="text-[15px] font-medium opacity-90">{data.tracker_name}</div>
      </div>

      <div className="grid grid-cols-2 gap-3 px-5 pb-4 pt-3 sm:grid-cols-3">
        {valueRows.map((r, i) => (
          <div key={i} className="min-w-0">
            <div className="font-display text-[26px] leading-none tabular-nums">
              {typeof r.value === "number" ? formatNum(r.value) : String(r.value)}
              {r.unit && (
                <span className="ml-1 text-[12px] opacity-65">{r.unit}</span>
              )}
            </div>
            <div className="mt-1 truncate font-mono text-[10px] uppercase tracking-[0.14em] opacity-70">
              {r.label}
            </div>
          </div>
        ))}
      </div>

      {data.missing.length > 0 && (
        <div className="border-t border-black/15 px-5 py-2 font-mono text-[10px] uppercase tracking-[0.14em] opacity-70">
          missing: {data.missing.join(", ")}
        </div>
      )}
    </Link>
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
      <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
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
