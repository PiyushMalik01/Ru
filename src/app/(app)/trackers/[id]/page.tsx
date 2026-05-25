import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { format } from "date-fns";
import { createClient } from "@/lib/supabase/server";
import {
  fetchTracker,
  fetchTrackerEntries,
  computeStats,
  primaryField,
  type TrackerField,
} from "@/lib/queries/trackers";
import { trackerColor } from "@/lib/trackers/color";
import { TrackerChart } from "@/components/trackers/tracker-chart";
import { TrackerEntryForm } from "@/components/trackers/tracker-entry-form";
import { TrackerFieldsPanel } from "@/components/trackers/tracker-fields-panel";
import { TrackerEntriesTable } from "@/components/trackers/tracker-entries-table";
import { TrackerSettings } from "@/components/trackers/tracker-settings";
import { HeroBand } from "@/components/editorial/hero-band";
import { SectionHead } from "@/components/editorial/section-head";

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
  const accent = color.bg;
  const chartType = tracker.display_config.chart_type ?? "line";

  const category = deriveCategory(tracker.name, primary);
  const entryWord = stats.entryCount === 1 ? "entry" : "entries";
  const eyebrow = `tracker · ${category} · ${stats.entryCount} ${entryWord}`;

  const latestValue =
    primary && entries[0] ? entries[0].values[primary.key] : undefined;
  const latestNum =
    typeof latestValue === "number" && Number.isFinite(latestValue)
      ? latestValue
      : null;
  const latestStr =
    latestNum !== null
      ? formatNum(latestNum)
      : typeof latestValue === "string"
        ? latestValue
        : null;

  const subtitle = buildSubtitle({
    latestStr,
    primary,
    lastEnteredAt: stats.lastEnteredAt,
    description: tracker.description,
  });

  return (
    <div className="mx-auto w-full max-w-5xl px-4 pt-8 pb-32 sm:px-6 sm:pt-10">
      <Link
        href="/routines"
        className="inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground transition-colors hover:text-foreground"
      >
        <ChevronLeft className="h-3 w-3" />
        trackers
      </Link>

      <div className="mt-5">
        <HeroBand
          eyebrow={eyebrow}
          title={tracker.name}
          subtitle={subtitle ?? undefined}
          trailing={
            latestStr ? (
              <HeroLatest value={latestStr} unit={primary?.unit} />
            ) : undefined
          }
        />
      </div>

      {stats.entryCount > 0 && (
        <section className="mt-7 grid grid-cols-3 gap-2.5 sm:gap-3">
          <Ledger label="entries" value={stats.entryCount.toString()} />
          <Ledger
            label={primary ? `avg ${primary.label.toLowerCase()}` : "avg"}
            value={stats.primaryAvg !== null ? formatNum(stats.primaryAvg) : "—"}
            unit={stats.primaryAvg !== null ? primary?.unit : undefined}
          />
          <Ledger
            label="latest"
            value={latestStr ?? "—"}
            unit={latestStr ? primary?.unit : undefined}
          />
        </section>
      )}

      <div className="mt-10">
        <TrackerSettings
          trackerId={tracker.id}
          trackerName={tracker.name}
          chartType={chartType}
        />
      </div>

      <section className="mt-10">
        <SectionHead
          eyebrow="trend"
          sublabel={
            primary
              ? `${primary.label.toLowerCase()}${primary.unit ? ` · ${primary.unit}` : ""}`
              : "over time"
          }
          count={entries.length}
          accent={accent}
        />
        <div className="mt-5">
          <TrackerChart
            entries={entries}
            primary={primary}
            chartType={chartType}
            color={color}
          />
        </div>
      </section>

      <section className="mt-10">
        <SectionHead
          eyebrow="log"
          sublabel="new entry"
          count={tracker.fields.length}
          accent={accent}
        />
        <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <TrackerEntryForm
            trackerId={tracker.id}
            fields={tracker.fields}
            accent={color}
          />
          <TrackerFieldsPanel trackerId={tracker.id} fields={tracker.fields} />
        </div>
      </section>

      <section className="mt-10">
        <SectionHead
          eyebrow="recent entries"
          sublabel={
            entries.length === 0
              ? "nothing logged yet"
              : `latest ${Math.min(entries.length, 200)}`
          }
          count={entries.length}
          accent={accent}
        />
        <div className="mt-5">
          <TrackerEntriesTable
            trackerId={tracker.id}
            entries={entries}
            fields={tracker.fields}
          />
        </div>
      </section>
    </div>
  );
}

function HeroLatest({ value, unit }: { value: string; unit?: string }) {
  return (
    <div className="flex items-baseline gap-2 text-foreground">
      <span
        className="font-display tabular-nums leading-[0.9]"
        style={{
          fontSize: "clamp(40px, 6vw, 64px)",
          fontVariationSettings: "'wght' 580, 'opsz' 96",
          letterSpacing: "-0.03em",
        }}
      >
        {value}
      </span>
      {unit && (
        <span
          className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground"
          style={{ fontVariationSettings: "'wght' 560, 'wdth' 100" }}
        >
          {unit}
        </span>
      )}
    </div>
  );
}

function Ledger({
  label,
  value,
  unit,
}: {
  label: string;
  value: string;
  unit?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5 rounded-2xl border border-[var(--hairline)] bg-[var(--card)] px-4 py-3 sm:px-5 sm:py-4">
      <span
        className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground"
        style={{ fontVariationSettings: "'wght' 600, 'wdth' 100" }}
      >
        {label}
      </span>
      <span className="flex items-baseline gap-1.5">
        <span
          className="font-display leading-[0.9] tabular-nums"
          style={{
            fontSize: "clamp(28px, 4.4vw, 40px)",
            fontVariationSettings: "'wght' 580, 'opsz' 96",
            letterSpacing: "-0.025em",
          }}
        >
          {value}
        </span>
        {unit && (
          <span
            className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground"
            style={{ fontVariationSettings: "'wght' 560, 'wdth' 100" }}
          >
            {unit}
          </span>
        )}
      </span>
    </div>
  );
}

function deriveCategory(name: string, primary: TrackerField | null): string {
  const n = name.toLowerCase();
  if (/mood|feel|emotion/.test(n)) return "mood";
  if (/weight|kg|lb|lbs/.test(n)) return "weight";
  if (/sleep|rest/.test(n)) return "sleep";
  if (/run|walk|step|workout|gym|exercise|fitness/.test(n)) return "fitness";
  if (/water|hydrat|drink/.test(n)) return "hydration";
  if (/read|book|page/.test(n)) return "reading";
  if (/meditat|mindful|breath/.test(n)) return "practice";
  if (primary?.type === "duration") return "duration";
  if (primary?.unit) return primary.unit.toLowerCase();
  return "log";
}

function buildSubtitle({
  latestStr,
  primary,
  lastEnteredAt,
  description,
}: {
  latestStr: string | null;
  primary: TrackerField | null;
  lastEnteredAt: string | null;
  description: string | null;
}): string | null {
  const parts: string[] = [];
  if (latestStr) {
    const unit = primary?.unit ? ` ${primary.unit}` : "";
    parts.push(`latest ${latestStr}${unit}`);
  }
  if (lastEnteredAt) {
    parts.push(relativeFromNow(lastEnteredAt));
  }
  const summary = parts.join(" · ");
  if (description && summary) return `${description.toLowerCase()} — ${summary}`;
  if (description) return description.toLowerCase();
  return summary || null;
}

function relativeFromNow(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diffSec = Math.max(0, Math.floor((now - then) / 1000));
  if (diffSec < 60) return "just now";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
  return format(new Date(iso), "MMM d").toLowerCase();
}

function formatNum(n: number): string {
  if (Number.isInteger(n)) return n.toString();
  if (Math.abs(n) >= 100) return n.toFixed(0);
  return n.toFixed(1);
}
