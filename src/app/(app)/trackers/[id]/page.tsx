import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import {
  fetchTracker,
  fetchTrackerEntries,
  computeStats,
  primaryField,
} from "@/lib/queries/trackers";
import { trackerColor } from "@/lib/trackers/color";
import { TrackerChart } from "@/components/trackers/tracker-chart";
import { TrackerEntryForm } from "@/components/trackers/tracker-entry-form";
import { TrackerFieldsPanel } from "@/components/trackers/tracker-fields-panel";
import { TrackerEntriesTable } from "@/components/trackers/tracker-entries-table";
import { TrackerSettings } from "@/components/trackers/tracker-settings";

export const dynamic = "force-dynamic";

export default async function TrackerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const tracker = await fetchTracker(supabase, user.id, id);
  if (!tracker) notFound();

  const entries = await fetchTrackerEntries(supabase, user.id, id, { limit: 200 });
  const stats = computeStats(tracker, entries);
  const primary = primaryField(tracker);
  const color = trackerColor(tracker.id);
  const chartType = tracker.display_config.chart_type ?? "line";

  return (
    <div className="mx-auto w-full max-w-5xl px-4 pt-6 pb-32">
      {/* Breadcrumb */}
      <Link
        href="/routines"
        className="inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground transition-colors hover:text-foreground"
      >
        <ChevronLeft className="h-3 w-3" />
        Trackers
      </Link>

      {/* Hero */}
      <header className="mt-6 flex flex-wrap items-end justify-between gap-4 border-b border-[var(--hairline-soft)] pb-6">
        <div className="min-w-0">
          <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            tracker · {stats.entryCount} {stats.entryCount === 1 ? "entry" : "entries"}
            {stats.streakDays > 1 && (
              <span className="ml-2">· {stats.streakDays}-day streak</span>
            )}
          </div>
          <h1 className="h-page mt-3 lowercase">
            {tracker.name.toLowerCase()}
          </h1>
          {tracker.description && (
            <p className="mt-2 max-w-2xl text-[15px] text-muted-foreground" style={{ lineHeight: 1.6 }}>
              {tracker.description}
            </p>
          )}
        </div>

        {/* Stat block — only render if there's something to show */}
        {primary && stats.primaryAvg !== null && stats.primarySum !== null && (
          <div className="flex items-baseline gap-6 text-foreground">
            <div className="text-right">
              <div className="font-display text-[32px] leading-none tabular-nums">
                {formatNum(stats.primaryAvg)}
              </div>
              <div className="mt-1 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                avg {primary.label}
              </div>
            </div>
            <div className="text-right">
              <div className="font-display text-[32px] leading-none tabular-nums">
                {formatNum(stats.primarySum)}
              </div>
              <div className="mt-1 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                total {primary.unit ?? ""}
              </div>
            </div>
          </div>
        )}
      </header>

      {/* Settings strip — rename / chart type / archive */}
      <div className="mt-6">
        <TrackerSettings
          trackerId={tracker.id}
          trackerName={tracker.name}
          chartType={chartType}
        />
      </div>

      {/* Chart */}
      <div className="mt-6">
        <TrackerChart
          entries={entries}
          primary={primary}
          chartType={chartType}
          color={color}
        />
      </div>

      {/* Two-column: entry form + fields panel */}
      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <TrackerEntryForm
          trackerId={tracker.id}
          fields={tracker.fields}
          accent={color}
        />
        <TrackerFieldsPanel trackerId={tracker.id} fields={tracker.fields} />
      </div>

      {/* Entries table */}
      <div className="mt-8">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="h-section lowercase">
            recent entries
          </h2>
          {entries.length > 0 && (
            <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              latest {Math.min(entries.length, 200)}
            </span>
          )}
        </div>
        <TrackerEntriesTable
          trackerId={tracker.id}
          entries={entries}
          fields={tracker.fields}
        />
      </div>
    </div>
  );
}

function formatNum(n: number): string {
  if (Number.isInteger(n)) return n.toString();
  if (Math.abs(n) >= 100) return n.toFixed(0);
  return n.toFixed(1);
}
