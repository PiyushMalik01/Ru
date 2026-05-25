import { redirect } from "next/navigation";
import { format } from "date-fns";
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
import { AnticipationSection } from "@/components/today/anticipation-section";
import { HeroBand } from "@/components/editorial/hero-band";

export const dynamic = "force-dynamic";

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

  const taskCount = openTasks.length;
  const routineCount = upcomingRoutines.length;
  const weekCount = taskCount + routineCount;

  const standfirst = composeStandfirst({
    bundle,
    planCount: workspaces.length,
    bestStreak,
    firstName,
  });

  const featuredPlan = workspaces[0] ?? null;
  const todayLabel = format(new Date(nowMs), "EEE MMM d").toLowerCase();
  const itemCount = taskCount + routineCount;

  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 5) return "still up";
    if (h < 12) return "good morning";
    if (h < 17) return "good afternoon";
    if (h < 21) return "good evening";
    return "late tonight";
  })();

  const title = firstName
    ? `${greeting}, ${firstName.toLowerCase()}.`
    : `${greeting}.`;

  return (
    <div className="mx-auto w-full max-w-5xl px-4 pt-8 pb-32 sm:px-6 sm:pt-10">
      <HeroBand
        eyebrow={`today · ${todayLabel} · ${itemCount} item${itemCount === 1 ? "" : "s"}`}
        title={title}
        subtitle={standfirst.replace(/\.$/, ".").toLowerCase()}
        trailing={<NowMarker />}
      />

      {/* Ru noticed — anticipation row. Renders nothing if no pending
          suggestions; takes precedence above the bento when it has content. */}
      <AnticipationSection />

      {/* Bento grid — six tiles, asymmetric, F-pattern.
          NOW   (col-span-2 row-span-2)  STREAK
                                         PLAN
          UP NEXT (col-span-2)           LOG
      */}
      <div className="mt-8 grid grid-cols-1 gap-3 md:grid-cols-3 md:gap-4">
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

      {/* This-week summary as a secondary row, beneath the bento. */}
      <div className="mt-3 md:mt-4">
        <BentoWeek
          count={weekCount}
          taskCount={taskCount}
          routineCount={routineCount}
        />
      </div>
    </div>
  );
}
