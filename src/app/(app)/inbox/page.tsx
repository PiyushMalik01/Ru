import { redirect } from "next/navigation";
import { format } from "date-fns";
import { createClient } from "@/lib/supabase/server";
import { HeroBand } from "@/components/editorial/hero-band";
import { SectionHead } from "@/components/editorial/section-head";
import {
  NotificationRow,
  KIND_ACCENT,
  type NotificationKind,
  type NotificationRowData,
} from "@/components/inbox/notification-row";

export const dynamic = "force-dynamic";

export default async function InboxPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: rows } = await supabase
    .from("notifications")
    .select(
      "id, kind, title, body, url, channels, read_at, archived_at, created_at, entity_kind",
    )
    .eq("user_id", user.id)
    .is("archived_at", null)
    .order("created_at", { ascending: false })
    .limit(200);

  const nowMs = Date.now();
  const startOfToday = (() => {
    const d = new Date(nowMs);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  })();
  const weekAgo = startOfToday - 6 * 86400_000;

  const all: NotificationRowData[] = (rows ?? []).map((r) => ({
    id: r.id,
    kind: r.kind as NotificationKind,
    title: r.title,
    body: r.body,
    url: r.url,
    channels: parseChannels(r.channels),
    unread: r.read_at === null,
    archived: r.archived_at !== null,
    createdAtIso: r.created_at,
  }));

  const unreadCount = all.filter((r) => r.unread).length;
  const todayCount = all.filter(
    (r) => new Date(r.createdAtIso).getTime() >= startOfToday,
  ).length;
  const weekCount = all.filter(
    (r) => new Date(r.createdAtIso).getTime() >= weekAgo,
  ).length;

  const today: NotificationRowData[] = [];
  const earlierWeek: NotificationRowData[] = [];
  const older: NotificationRowData[] = [];
  for (const r of all) {
    const t = new Date(r.createdAtIso).getTime();
    if (t >= startOfToday) today.push(r);
    else if (t >= weekAgo) earlierWeek.push(r);
    else older.push(r);
  }

  const todayLabel = format(new Date(nowMs), "EEE MMM d").toLowerCase();
  const heroTitle = unreadCount === 0 ? "all caught up." : "the inbox.";

  return (
    <div className="mx-auto w-full max-w-5xl px-4 pt-8 pb-32 sm:px-6 sm:pt-10">
      <HeroBand
        eyebrow={`inbox · ${todayLabel} · ${unreadCount} unread`}
        title={heroTitle}
        subtitle="everything ru caught for you — gmail extracts, due reminders, daily digests. tap any to open."
      />

      {all.length === 0 ? (
        <div className="mt-12">
          <p
            className="text-[16px] italic leading-[1.5] text-muted-foreground"
            style={{ fontVariationSettings: "'wght' 460, 'wdth' 96" }}
          >
            ru will catch things here as they happen.
          </p>
        </div>
      ) : (
        <>
          <section className="mt-7 grid grid-cols-3 gap-2.5 sm:gap-3">
            <Ledger label="unread" value={unreadCount} />
            <Ledger label="today" value={todayCount} />
            <Ledger label="this week" value={weekCount} />
          </section>

          <div className="mt-12 flex flex-col gap-10">
            <Section
              eyebrow="today"
              sublabel={todayLabel}
              rows={today}
              nowMs={nowMs}
            />
            <Section
              eyebrow="earlier this week"
              sublabel="last 7 days"
              rows={earlierWeek}
              nowMs={nowMs}
            />
            <Section
              eyebrow="older"
              sublabel="beyond 7 days"
              rows={older}
              nowMs={nowMs}
            />
          </div>
        </>
      )}
    </div>
  );
}

function Section({
  eyebrow,
  sublabel,
  rows,
  nowMs,
}: {
  eyebrow: string;
  sublabel: string;
  rows: NotificationRowData[];
  nowMs: number;
}) {
  if (rows.length === 0) return null;
  const accent = dominantAccent(rows);
  return (
    <section>
      <SectionHead
        eyebrow={eyebrow}
        sublabel={sublabel}
        count={rows.length}
        accent={accent}
      />
      <div className="mt-1">
        {rows.map((r) => (
          <NotificationRow key={r.id} row={r} nowMs={nowMs} />
        ))}
      </div>
    </section>
  );
}

function Ledger({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-col gap-1.5 rounded-2xl border border-[var(--hairline)] bg-[var(--card)] px-4 py-3 sm:px-5 sm:py-4">
      <span
        className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground"
        style={{ fontVariationSettings: "'wght' 600, 'wdth' 100" }}
      >
        {label}
      </span>
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
    </div>
  );
}

// Pick the most common kind in a bucket and return its accent. Falls back to
// muted if the bucket spans many kinds evenly.
function dominantAccent(rows: NotificationRowData[]): string {
  if (rows.length === 0) return "var(--muted-foreground)";
  const counts = new Map<NotificationKind, number>();
  for (const r of rows) {
    counts.set(r.kind, (counts.get(r.kind) ?? 0) + 1);
  }
  let bestKind: NotificationKind | null = null;
  let bestCount = 0;
  for (const [k, c] of counts) {
    if (c > bestCount) {
      bestCount = c;
      bestKind = k;
    }
  }
  if (!bestKind) return "var(--muted-foreground)";
  return KIND_ACCENT[bestKind] ?? "var(--muted-foreground)";
}

// `channels` is jsonb — we expect an array of strings, but be defensive.
function parseChannels(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const v of value) {
    if (typeof v === "string") out.push(v);
  }
  return out;
}
