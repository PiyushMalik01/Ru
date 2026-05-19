import { createClient } from "@/lib/supabase/server";
import { fetchRoutinesWithToday, type RoutineWithToday } from "@/lib/queries/dashboard";
import {
  listTrackers,
  fetchTrackerEntries,
  computeStats,
  primaryField,
  type Tracker,
} from "@/lib/queries/trackers";
import { RoutineRow } from "@/components/dashboard/routine-row";
import { TrackerRow } from "@/components/trackers/tracker-row";

export const dynamic = "force-dynamic";

type BucketKey = "morning" | "midday" | "afternoon" | "evening" | "anytime";

const BUCKET_ORDER: BucketKey[] = ["morning", "midday", "afternoon", "evening", "anytime"];

const BUCKET_LABEL: Record<BucketKey, string> = {
  morning: "morning",
  midday: "midday",
  afternoon: "afternoon",
  evening: "evening",
  anytime: "anytime",
};

const BUCKET_SUBLABEL: Record<BucketKey, string> = {
  morning: "before 11",
  midday: "11 – 15",
  afternoon: "15 – 18",
  evening: "after 18",
  anytime: "no fixed hour",
};

function bucketFor(timeOfDay: string | null): BucketKey {
  if (!timeOfDay) return "anytime";
  const h = parseInt(timeOfDay.slice(0, 2), 10);
  if (Number.isNaN(h)) return "anytime";
  if (h < 11) return "morning";
  if (h < 15) return "midday";
  if (h < 18) return "afternoon";
  return "evening";
}

export default async function RoutinesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [routines, trackers]: [RoutineWithToday[], Tracker[]] = user
    ? await Promise.all([
        fetchRoutinesWithToday(supabase, user.id),
        listTrackers(supabase, user.id),
      ])
    : [[], []];

  // For each tracker, fetch a small recent window for the sparkline + stats.
  const trackerData = user
    ? await Promise.all(
        trackers.map(async (t) => {
          const recent = await fetchTrackerEntries(supabase, user.id, t.id, { limit: 60 });
          return {
            tracker: t,
            stats: computeStats(t, recent),
            recent,
            primary: primaryField(t),
          };
        }),
      )
    : [];

  const grouped: Record<BucketKey, RoutineWithToday[]> = {
    morning: [],
    midday: [],
    afternoon: [],
    evening: [],
    anytime: [],
  };
  for (const r of routines) grouped[bucketFor(r.time_of_day)].push(r);

  const totalActive = routines.length;
  const doneToday = routines.filter((r) => r.todayCompleted).length;

  const today = new Date();
  const dayName = today.toLocaleDateString("en-US", { weekday: "long" }).toLowerCase();
  const dateStr = today
    .toLocaleDateString("en-US", { month: "short", day: "numeric" })
    .toLowerCase();

  return (
    <div className="mx-auto w-full max-w-5xl space-y-12 px-4 pt-6 pb-24">
      {/* Header */}
      <header className="max-w-2xl">
        <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          routines · {dayName} {dateStr}
        </div>
        <h1 className="mt-4 font-display text-[36px] leading-[1.02] tracking-tight sm:text-[42px]">
          The rhythm.
        </h1>
        {totalActive > 0 ? (
          <p
            className="mt-4 text-[15px] text-muted-foreground"
            style={{ lineHeight: 1.65 }}
          >
            <span className="font-mono tabular-nums text-foreground">
              {doneToday}
            </span>
            <span className="font-mono"> of </span>
            <span className="font-mono tabular-nums text-foreground">
              {totalActive}
            </span>
            <span className="font-mono"> done today.</span>{" "}
            Mark them off as you go, or just tell Ru.
          </p>
        ) : (
          <p
            className="mt-4 text-[15px] text-muted-foreground"
            style={{ lineHeight: 1.65 }}
          >
            Nothing here yet. Tell Ru about something you want to do regularly —{" "}
            <span className="italic">
              &ldquo;I want to meditate every morning at 7&rdquo;
            </span>{" "}
            — and it&rsquo;ll show up.
          </p>
        )}
      </header>

      {/* Routine buckets */}
      {totalActive > 0 && (
        <div className="space-y-10">
          {BUCKET_ORDER.map((key) => {
            const items = grouped[key];
            if (items.length === 0) return null;
            return (
              <section key={key}>
                <div className="mb-1 flex items-baseline gap-3 border-b border-[rgba(255,255,255,0.08)] pb-3">
                  <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-foreground">
                    {BUCKET_LABEL[key]}
                  </span>
                  <span className="font-mono text-[10px] tracking-[0.12em] text-muted-foreground/60">
                    {BUCKET_SUBLABEL[key]}
                  </span>
                  <span className="ml-auto font-mono text-[10px] tabular-nums text-muted-foreground/60">
                    {items.length.toString().padStart(2, "0")}
                  </span>
                </div>
                <div>
                  {items.map((r) => (
                    <RoutineRow
                      key={r.id}
                      id={r.id}
                      title={r.title}
                      frequency={r.frequency}
                      timeOfDay={r.time_of_day}
                      streak={r.streak}
                      todayCompleted={r.todayCompleted}
                      lastSevenDays={r.lastSevenDays}
                      origin={r.origin}
                    />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}

      {/* Trackers — quantitative logs over time, lives next to routines because
          they're both "things I do regularly". A separate section so they
          don't visually mix with the time-of-day routine grouping above. */}
      <section className="space-y-5">
        <div className="flex items-baseline justify-between gap-4 border-b border-[var(--hairline-soft)] pb-3">
          <div>
            <h2 className="font-display text-[28px] leading-[1.02] tracking-tight">
              Trackers
            </h2>
            <p className="mt-1 text-[13px] text-muted-foreground">
              Quantitative logs — runs, workouts, anything you want to follow
              over time.
            </p>
          </div>
          {trackerData.length > 0 && (
            <span className="font-mono text-[10px] tabular-nums text-muted-foreground/70">
              {trackerData.length.toString().padStart(2, "0")}
            </span>
          )}
        </div>

        {trackerData.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[var(--hairline)] bg-[var(--secondary)]/30 px-6 py-7 text-[14px] text-muted-foreground">
            None yet. Tell Ru what you want to track —{" "}
            <span className="italic text-foreground">
              &ldquo;track my runs with distance, time, and pace&rdquo;
            </span>{" "}
            — and a tracker will appear here.
          </div>
        ) : (
          <div>
            {trackerData.map((t) => (
              <TrackerRow
                key={t.tracker.id}
                tracker={t.tracker}
                stats={t.stats}
                recent={t.recent}
                primary={t.primary}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
