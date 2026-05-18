import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { fetchTodayBundle, listWorkspaces } from "@/lib/queries/workspace";
import { fetchRoutinesWithToday } from "@/lib/queries/dashboard";
import { composeStandfirst, firstNameFrom } from "@/lib/today-standfirst";
import { NowMarker } from "@/components/app-shell/now-marker";
import {
  Eyebrow,
  SectionMark,
} from "@/components/app-shell/primitives";
import { TodayTaskLine } from "@/components/today/today-task-line";
import { TodayRoutineLine } from "@/components/today/today-routine-line";
import { TodayPlanCard } from "@/components/today/today-plan-card";

export const dynamic = "force-dynamic";

function masthead(): { weekday: string; date: string; iso: string } {
  const d = new Date();
  const weekday = d.toLocaleDateString([], { weekday: "long" }).toUpperCase();
  const date = d
    .toLocaleDateString([], { day: "numeric", month: "short" })
    .toUpperCase();
  const iso = d.toISOString().slice(0, 10);
  return { weekday, date, iso };
}

export default async function TodayPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [bundle, routinesFull, workspaces, profileRes] = await Promise.all([
    fetchTodayBundle(supabase, user.id),
    fetchRoutinesWithToday(supabase, user.id),
    listWorkspaces(supabase, user.id),
    supabase.from("profiles").select("display_name").eq("id", user.id).single(),
  ]);

  const firstName = firstNameFrom(profileRes.data?.display_name);
  const bestStreak = routinesFull.reduce((m, r) => Math.max(m, r.streak), 0);

  // Plans: active workspaces, with rough item-count progress as a proxy.
  const activePlans = workspaces.slice(0, 3);

  // Now we split today's tasks/routines into "now" (next ~60 min) and "later".
  const nowMs = Date.now();
  const nowEnd = nowMs + 60 * 60 * 1000;

  const openTasks = bundle.tasksDueToday.filter((t) => t.status !== "completed");
  const nowTasks = openTasks.filter((t) => {
    if (!t.due_at) return false;
    const d = new Date(t.due_at).getTime();
    return d <= nowEnd;
  });
  const laterTasks = openTasks.filter((t) => !nowTasks.includes(t));

  const todayHour = new Date().getHours();
  const upcomingRoutines = bundle.activeRoutines.filter((r) => !r.todayCompleted);
  const nowRoutines = upcomingRoutines.filter((r) => {
    if (!r.time_of_day) return false;
    const h = parseInt(r.time_of_day.slice(0, 2), 10);
    if (Number.isNaN(h)) return false;
    return h >= todayHour && h <= todayHour + 1;
  });
  const laterRoutines = upcomingRoutines.filter((r) => !nowRoutines.includes(r));
  const doneRoutines = bundle.activeRoutines.filter((r) => r.todayCompleted);

  const standfirst = composeStandfirst({
    bundle,
    planCount: workspaces.length,
    bestStreak,
    firstName,
  });

  const head = masthead();

  return (
    <div className="mx-auto w-full max-w-3xl px-6 pt-10 pb-32 md:pl-16">
      {/* Date masthead — small mono caps, with a hairline rule beneath.
          The "edition number" on the right is the day-of-year, like Vol. xxiv N°. */}
      <header className="flex items-baseline justify-between gap-4">
        <div className="font-mono text-[10.5px] uppercase tracking-[0.22em] text-foreground">
          {head.weekday}
          <span className="px-2 text-muted-foreground/50">·</span>
          {head.date}
        </div>
        <NowMarker />
      </header>
      <div className="ru-rule mt-3" />

      {/* Standfirst — the editorial cover line. Light weight, tight leading. */}
      <h1
        className="mt-10 text-[30px] font-light leading-[1.15] tracking-[-0.018em] text-foreground sm:text-[34px]"
        style={{ fontFeatureSettings: '"ss01"' }}
      >
        {firstName ? (
          <span className="text-muted-foreground/70">{`${firstName} — `}</span>
        ) : null}
        {standfirst}
      </h1>

      <SectionMark glyph="§" />

      {/* NOW — what to do in the next ~hour. */}
      <section>
        <Eyebrow count={nowTasks.length + nowRoutines.length}>now</Eyebrow>
        {nowTasks.length === 0 && nowRoutines.length === 0 ? (
          <p className="py-5 font-mono text-[12px] lowercase tracking-wide text-muted-foreground/70">
            nothing on the clock right now. take a breath.
          </p>
        ) : (
          <div>
            {nowRoutines.map((r) => (
              <TodayRoutineLine
                key={r.id}
                id={r.id}
                title={r.title}
                timeOfDay={r.time_of_day}
                todayCompleted={false}
              />
            ))}
            {nowTasks.map((t) => (
              <TodayTaskLine
                key={t.id}
                id={t.id}
                title={t.title}
                status={t.status as "pending" | "in_progress" | "completed" | "missed"}
                dueAt={t.due_at}
                priority={t.priority}
                nowMs={nowMs}
              />
            ))}
          </div>
        )}
      </section>

      <SectionMark glyph="¶" />

      {/* LATER TODAY — the rest of the day's queue. */}
      <section>
        <Eyebrow count={laterTasks.length + laterRoutines.length}>later today</Eyebrow>
        {laterTasks.length === 0 && laterRoutines.length === 0 ? (
          <p className="py-5 font-mono text-[12px] lowercase tracking-wide text-muted-foreground/70">
            the day is clear from here.
          </p>
        ) : (
          <div>
            {laterRoutines.map((r) => (
              <TodayRoutineLine
                key={r.id}
                id={r.id}
                title={r.title}
                timeOfDay={r.time_of_day}
                todayCompleted={false}
              />
            ))}
            {laterTasks.map((t) => (
              <TodayTaskLine
                key={t.id}
                id={t.id}
                title={t.title}
                status={t.status as "pending" | "in_progress" | "completed" | "missed"}
                dueAt={t.due_at}
                priority={t.priority}
                nowMs={nowMs}
              />
            ))}
          </div>
        )}
        {doneRoutines.length > 0 && (
          <div className="mt-3 font-mono text-[10.5px] uppercase tracking-[0.16em] text-muted-foreground/60">
            ✓ {doneRoutines.length} {doneRoutines.length === 1 ? "routine" : "routines"} already marked
          </div>
        )}
      </section>

      {/* ACTIVE PLANS — workspaces. */}
      {activePlans.length > 0 && (
        <>
          <SectionMark glyph="※" />
          <section>
            <Eyebrow
              count={activePlans.length}
              trailing={
                <Link
                  href="/plans"
                  className="ml-2 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground/60 hover:text-foreground"
                >
                  <span className="ru-link">all plans</span>
                </Link>
              }
            >
              active plans
            </Eyebrow>
            <div>
              {activePlans.map((w) => (
                <TodayPlanCard
                  key={w.id}
                  id={w.id}
                  title={w.title}
                  description={w.description}
                  itemCount={w.itemCount}
                  doneCount={0}
                  lastActivityIso={w.created_at}
                  nextAction={null}
                  nowMs={nowMs}
                />
              ))}
            </div>
          </section>
        </>
      )}

      <SectionMark glyph="§" />

      {/* THIS WEEK — collapsed link to the sheet. */}
      <section>
        <Eyebrow>this week</Eyebrow>
        <Link
          href="/sheet"
          className="mt-2 flex items-baseline justify-between gap-3 py-4 text-muted-foreground transition-colors hover:text-foreground"
        >
          <span className="text-[14.5px]">
            <span className="ru-link">open the full sheet</span>
          </span>
          <span className="font-mono text-[10.5px] uppercase tracking-[0.16em]">
            tasks · routines · logs · reminders
          </span>
        </Link>
      </section>

      {/* Footer — small colophon, like a print spread. */}
      <footer className="mt-24 flex items-baseline justify-between font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground/40">
        <span>ru. — daily</span>
        <span>{head.iso}</span>
      </footer>
    </div>
  );
}
