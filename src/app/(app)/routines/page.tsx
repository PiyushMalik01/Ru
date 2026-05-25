import { format } from "date-fns";
import { createClient } from "@/lib/supabase/server";
import { fetchRoutinesWithToday, type RoutineWithToday } from "@/lib/queries/dashboard";
import {
  listTrackers,
  fetchTrackerEntries,
  computeStats,
  primaryField,
  type Tracker,
} from "@/lib/queries/trackers";
import { HeroBand } from "@/components/editorial/hero-band";
import { SectionHead } from "@/components/editorial/section-head";
import { RoutineStripRow } from "@/components/routines/routine-strip-row";
import { TrackerRow } from "@/components/trackers/tracker-row";

export const dynamic = "force-dynamic";

type BucketKey = "morning" | "midday" | "afternoon" | "evening" | "anytime";

const BUCKET_ORDER: BucketKey[] = [
  "morning",
  "midday",
  "afternoon",
  "evening",
  "anytime",
];

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

function weekProgress(routines: RoutineWithToday[]): number {
  if (routines.length === 0) return 0;
  let hits = 0;
  let slots = 0;
  for (const r of routines) {
    for (const d of r.lastSevenDays) {
      slots += 1;
      if (d.completed) hits += 1;
    }
  }
  if (slots === 0) return 0;
  return Math.round((hits / slots) * 100);
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

  const trackerData = user
    ? await Promise.all(
        trackers.map(async (t) => {
          const recent = await fetchTrackerEntries(supabase, user.id, t.id, {
            limit: 60,
          });
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
  const bestStreak = routines.reduce(
    (m, r) => (r.streak > m ? r.streak : m),
    0,
  );
  const weekPct = weekProgress(routines);

  const nowMs = Date.now();
  const todayLabel = format(new Date(nowMs), "EEE MMM d").toLowerCase();

  const heroTitle =
    totalActive === 0
      ? "no rhythm yet."
      : doneToday === totalActive
        ? "all on the page."
        : "everyday practice.";

  const heroSubtitle =
    totalActive === 0
      ? `tell ru about something you want to do regularly — "i want to meditate every morning at 7" — and it'll show up here.`
      : `${doneToday} of ${totalActive} done today. mark them as you go, or just tell ru.`;

  return (
    <div className="mx-auto w-full max-w-5xl px-4 pt-8 pb-32 sm:px-6 sm:pt-10">
      <HeroBand
        eyebrow={`routines · ${todayLabel} · ${totalActive} active`}
        title={heroTitle}
        subtitle={heroSubtitle}
      />

      {totalActive > 0 && (
        <section className="mt-7 grid grid-cols-2 gap-2.5 sm:grid-cols-4 sm:gap-3">
          <Ledger
            label="active"
            value={totalActive.toString().padStart(2, "0")}
            accent="var(--entity-routine)"
          />
          <Ledger
            label="done today"
            value={`${doneToday.toString().padStart(2, "0")} / ${totalActive
              .toString()
              .padStart(2, "0")}`}
            accent={
              doneToday === totalActive
                ? "var(--entity-routine)"
                : "var(--entity-task)"
            }
            filled={doneToday === totalActive && totalActive > 0}
          />
          <Ledger
            label="best streak"
            value={bestStreak.toString().padStart(2, "0")}
            accent="var(--entity-insight)"
          />
          <Ledger
            label="this week"
            value={`${weekPct}%`}
            accent="var(--entity-plan)"
          />
        </section>
      )}

      {totalActive > 0 && (
        <div className="mt-12 flex flex-col gap-9">
          {BUCKET_ORDER.map((key) => {
            const items = grouped[key];
            if (items.length === 0) return null;
            return (
              <section key={key}>
                <SectionHead
                  eyebrow={BUCKET_LABEL[key]}
                  sublabel={BUCKET_SUBLABEL[key]}
                  count={items.length}
                  accent="var(--entity-routine)"
                />
                <div className="mt-2">
                  {items.map((r, i) => (
                    <RoutineStripRow
                      key={r.id}
                      id={r.id}
                      title={r.title}
                      frequency={r.frequency}
                      timeOfDay={r.time_of_day}
                      streak={r.streak}
                      todayCompleted={r.todayCompleted}
                      lastSevenDays={r.lastSevenDays}
                      origin={r.origin}
                      isLast={i === items.length - 1}
                    />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}

      {totalActive === 0 && (
        <div className="mt-10">
          <div
            className="rounded-2xl px-6 py-14 text-center"
            style={{
              background: "var(--entity-routine)",
              color: "var(--entity-routine-fg)",
            }}
          >
            <span
              className="font-mono text-[10px] uppercase tracking-[0.22em]"
              style={{ fontVariationSettings: "'wght' 640, 'wdth' 100" }}
            >
              no rhythm
            </span>
            <p
              className="mx-auto mt-3 max-w-md font-display lowercase leading-[1.05]"
              style={{
                fontSize: "clamp(26px, 3.4vw, 34px)",
                fontVariationSettings: "'wght' 580, 'opsz' 96",
                letterSpacing: "-0.03em",
              }}
            >
              every practice begins with one quiet promise.
            </p>
            <p
              className="mx-auto mt-3 max-w-[44ch] text-[14px] leading-[1.55]"
              style={{ fontVariationSettings: "'wght' 460, 'wdth' 96" }}
            >
              tell ru —{" "}
              <span className="italic">
                &ldquo;i do a morning walk every weekday at 7&rdquo;
              </span>{" "}
              — and a routine appears.
            </p>
          </div>
        </div>
      )}

      <section className="mt-14">
        <SectionHead
          eyebrow="trackers"
          sublabel="quantitative logs"
          count={trackerData.length}
          accent="var(--entity-activity)"
        />
        {trackerData.length === 0 ? (
          <div
            className="mt-3 rounded-2xl border border-dashed px-6 py-7 text-[14px] text-muted-foreground"
            style={{
              borderColor: "var(--hairline)",
              fontVariationSettings: "'wght' 460, 'wdth' 96",
            }}
          >
            none yet. tell ru what you want to track —{" "}
            <span className="italic text-foreground">
              &ldquo;track my runs with distance, time, and pace&rdquo;
            </span>{" "}
            — and a tracker will appear here.
          </div>
        ) : (
          <div className="mt-2">
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

function Ledger({
  label,
  value,
  accent,
  filled = false,
}: {
  label: string;
  value: string;
  accent: string;
  filled?: boolean;
}) {
  return (
    <div
      className="flex flex-col gap-1.5 rounded-2xl px-4 py-3 sm:px-5 sm:py-4"
      style={{
        background: filled ? accent : "var(--card)",
        color: filled ? "var(--entity-routine-fg)" : "var(--foreground)",
        boxShadow: filled
          ? "0 4px 18px -8px rgba(0,0,0,0.18)"
          : "inset 0 0 0 1px var(--hairline)",
      }}
    >
      <div className="flex items-center gap-2">
        <span
          aria-hidden
          className="inline-block h-2 w-2 rounded-[2px]"
          style={{ background: filled ? "currentColor" : accent }}
        />
        <span
          className={
            filled
              ? "font-mono text-[10px] uppercase tracking-[0.22em] opacity-85"
              : "font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground"
          }
          style={{ fontVariationSettings: "'wght' 640, 'wdth' 100" }}
        >
          {label}
        </span>
      </div>
      <span
        className="font-display leading-[0.9] tabular-nums"
        style={{
          fontSize: "clamp(28px, 4.2vw, 40px)",
          fontVariationSettings: "'wght' 580, 'opsz' 96",
          letterSpacing: "-0.025em",
        }}
      >
        {value}
      </span>
    </div>
  );
}
