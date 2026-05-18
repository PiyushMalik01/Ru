import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { fetchTodayBundle, listWorkspaces } from "@/lib/queries/workspace";
import { fetchRoutinesWithToday } from "@/lib/queries/dashboard";
import { composeStandfirst, firstNameFrom } from "@/lib/today-standfirst";
import { NowMarker } from "@/components/app-shell/now-marker";
import { BentoNow } from "@/components/today/bento-now";
import { BentoStreak } from "@/components/today/bento-streak";
import { BentoPlan, BentoPlanEmpty } from "@/components/today/bento-plan";
import { BentoWeek } from "@/components/today/bento-week";
import { BentoUpNext } from "@/components/today/bento-up-next";
import { BentoLog } from "@/components/today/bento-log";

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

  const nowMs = Date.now();
  const nowEnd = nowMs + 60 * 60 * 1000;

  // OPEN, due-soon items: in the next hour for "Now"
  const openTasks = bundle.tasksDueToday.filter((t) => t.status !== "completed");
  const nowTasks = openTasks.filter((t) => {
    if (!t.due_at) return false;
    const d = new Date(t.due_at).getTime();
    return d <= nowEnd;
  });

  const todayHour = new Date().getHours();
  const upcomingRoutines = bundle.activeRoutines.filter((r) => !r.todayCompleted);
  const nowRoutines = upcomingRoutines.filter((r) => {
    if (!r.time_of_day) return false;
    const h = parseInt(r.time_of_day.slice(0, 2), 10);
    if (Number.isNaN(h)) return false;
    return h >= todayHour && h <= todayHour + 1;
  });

  // Compose NOW item set: routines tagged by time, tasks by due_at.
  const nowItems = [
    ...nowRoutines.map((r) => ({
      kind: "routine" as const,
      id: r.id,
      title: r.title,
      whenIso: null,
      timeOfDay: r.time_of_day,
    })),
    ...nowTasks.map((t) => ({
      kind: "task" as const,
      id: t.id,
      title: t.title,
      whenIso: t.due_at,
    })),
  ];

  // UP-NEXT: later tasks + later routines, ordered.
  const laterTasks = openTasks.filter((t) => !nowTasks.find((n) => n.id === t.id));
  const laterRoutines = upcomingRoutines.filter(
    (r) => !nowRoutines.find((n) => n.id === r.id),
  );
  const upNextItems = [
    ...laterRoutines.map((r) => ({
      kind: "routine" as const,
      id: r.id,
      title: r.title,
      whenIso: null,
      timeOfDay: r.time_of_day,
    })),
    ...laterTasks.map((t) => ({
      kind: "task" as const,
      id: t.id,
      title: t.title,
      whenIso: t.due_at,
    })),
  ];

  // Counts for the WEEK tile — approximate using today's bundle.
  const taskCount = openTasks.length;
  const routineCount = upcomingRoutines.length;
  const weekCount = taskCount + routineCount;

  const standfirst = composeStandfirst({
    bundle,
    planCount: workspaces.length,
    bestStreak,
    firstName,
  });

  const head = masthead();
  const featuredPlan = workspaces[0] ?? null;

  return (
    <div className="mx-auto w-full max-w-6xl px-6 pt-10 pb-32 md:pl-16">
      {/* Date masthead — small mono caps + live clock + edition mark.
          Theme-aware hairline below. */}
      <header className="flex items-baseline justify-between gap-4">
        <div className="font-mono text-[10.5px] uppercase tracking-[0.22em] text-foreground">
          {head.weekday}
          <span className="px-2 text-muted-foreground/50">·</span>
          {head.date}
          <span className="px-2 text-muted-foreground/50">·</span>
          <span className="text-muted-foreground">edition {head.iso}</span>
        </div>
        <NowMarker />
      </header>
      <div className="ru-rule mt-3" />

      {/* Standfirst — the cover line. Fraunces, large, anchors the page.
          The first name (if any) renders in display italics for warmth. */}
      <div className="mt-10 max-w-3xl">
        {firstName ? (
          <div className="mb-3 font-display text-[18px] italic leading-none text-muted-foreground sm:text-[20px]">
            {firstName},
          </div>
        ) : null}
        <h1 className="font-display text-[32px] leading-[1.06] text-foreground sm:text-[44px]">
          {standfirst}
        </h1>
      </div>

      {/* Bento grid — six tiles, asymmetric, F-pattern.
          NOW   (col-span-2 row-span-2)  STREAK
                                         PLAN
          UP NEXT (col-span-2)           LOG
      */}
      <div className="mt-12 grid grid-cols-1 gap-4 md:grid-cols-3 md:gap-5">
        <BentoNow
          items={nowItems}
          nowMs={nowMs}
          className="md:col-span-2 md:row-span-2"
        />
        <BentoStreak value={bestStreak} />
        {featuredPlan ? (
          <BentoPlan
            id={featuredPlan.id}
            title={featuredPlan.title}
            description={featuredPlan.description}
            itemCount={featuredPlan.itemCount}
            doneCount={0}
          />
        ) : (
          <BentoPlanEmpty />
        )}
        <BentoUpNext
          items={upNextItems}
          nowMs={nowMs}
          className="md:col-span-2"
        />
        <BentoLog items={bundle.recentActivities} nowMs={nowMs} />
      </div>

      {/* This-week summary as a secondary row, beneath the bento. Single
          insight tile — keeps the bento itself uncluttered. */}
      <div className="mt-5">
        <BentoWeek
          count={weekCount}
          taskCount={taskCount}
          routineCount={routineCount}
        />
      </div>

      {/* Colophon — print spread footer. */}
      <footer className="mt-20 flex items-baseline justify-between font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground/50">
        <span>ru. — daily</span>
        <span>vol · {head.iso}</span>
      </footer>
    </div>
  );
}
