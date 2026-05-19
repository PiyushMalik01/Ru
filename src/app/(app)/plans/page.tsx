import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { listWorkspaces } from "@/lib/queries/workspace";
import { PlanCard } from "@/components/plans/plan-card";
import { NewPlanTile } from "@/components/plans/new-plan-tile";

export const dynamic = "force-dynamic";

async function createPlan() {
  "use server";
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  const { data } = await supabase
    .from("workspaces")
    .insert({ user_id: user.id, title: "Untitled plan", kind: "plan" })
    .select("id")
    .single();
  revalidatePath("/plans");
  if (data?.id) {
    redirect(`/plans/${data.id}`);
  }
}

function masthead(): { weekday: string; date: string } {
  const d = new Date();
  return {
    weekday: d.toLocaleDateString("en-US", { weekday: "long" }).toUpperCase(),
    date: d.toLocaleDateString("en-US", { day: "numeric", month: "short" }).toUpperCase(),
  };
}

export default async function PlansPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const workspaces = await listWorkspaces(supabase, user.id);
  const nowMs = Date.now();
  const head = masthead();

  const totalItems = workspaces.reduce((s, w) => s + w.itemCount, 0);
  const totalDone = workspaces.reduce((s, w) => s + (w.doneCount ?? 0), 0);

  return (
    <div className="mx-auto w-full max-w-6xl px-6 pt-10 pb-32">
      {/* Hero band */}
      <header className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
            plans · {head.weekday} {head.date}
          </div>
          <h1 className="mt-4 font-display text-[44px] leading-[0.98] tracking-[-0.02em] sm:text-[56px]">
            The arcs in motion.
          </h1>
          <p className="mt-4 max-w-xl text-[14.5px] leading-relaxed text-muted-foreground">
            Long-running threads — study plans, projects, recoveries. Each plan
            is a page Ru keeps current as you talk to it.
          </p>
        </div>

        {/* Compact ledger — total counts across plans */}
        {workspaces.length > 0 && (
          <div className="grid grid-cols-3 gap-6 self-start pt-2">
            <Ledger label="plans" value={workspaces.length} />
            <Ledger label="items" value={totalItems} />
            <Ledger label="settled" value={totalDone} />
          </div>
        )}
      </header>

      <div className="ru-rule mt-10" />

      {/* Bento grid — 2 columns on md+ */}
      <div className="mt-8 grid grid-cols-1 gap-5 md:grid-cols-2">
        {workspaces.map((w, i) => (
          <PlanCard
            key={w.id}
            index={i}
            id={w.id}
            title={w.title}
            description={w.description}
            itemCount={w.itemCount}
            doneCount={w.doneCount ?? 0}
            lastActivityIso={w.lastActivityIso ?? w.updated_at ?? w.created_at}
            nowMs={nowMs}
          />
        ))}
        <NewPlanTile action={createPlan} />
      </div>
    </div>
  );
}

function Ledger({ label, value }: { label: string; value: number }) {
  return (
    <div className="border-l border-[var(--hairline)] pl-3">
      <div className="font-display text-[28px] leading-none tabular-nums sm:text-[32px]">
        {value.toString().padStart(2, "0")}
      </div>
      <div className="mt-1.5 font-mono text-[9.5px] uppercase tracking-[0.2em] text-muted-foreground">
        {label}
      </div>
    </div>
  );
}
