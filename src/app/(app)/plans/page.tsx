import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { listWorkspaces } from "@/lib/queries/workspace";
import { HairlineProgress, formatAgo } from "@/components/app-shell/primitives";

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

export default async function PlansPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const workspaces = await listWorkspaces(supabase, user.id);
  const nowMs = Date.now();

  return (
    <div className="mx-auto w-full max-w-3xl px-6 pt-10 pb-32 md:pl-16">
      <header className="flex items-baseline justify-between gap-4">
        <div>
          <div className="font-mono text-[10.5px] uppercase tracking-[0.22em] text-muted-foreground">
            plans
          </div>
          <h1 className="mt-3 text-[28px] font-light leading-tight tracking-[-0.018em]">
            The arcs in motion.
          </h1>
          <p className="mt-2 max-w-md text-[13.5px] text-muted-foreground">
            Long-running threads — study plans, projects, recoveries. Each one is a page Ru
            keeps current.
          </p>
        </div>

        <form action={createPlan}>
          <button
            type="submit"
            className="ru-link font-mono text-[10.5px] uppercase tracking-[0.18em] text-muted-foreground hover:text-foreground"
          >
            + new plan
          </button>
        </form>
      </header>

      <div className="ru-rule mt-8" />

      {workspaces.length === 0 ? (
        <div className="mt-24 py-12 text-center font-mono text-[12px] lowercase tracking-wide text-muted-foreground/70">
          no plans yet. start a thread with ru and pin it.
        </div>
      ) : (
        <div className="mt-6">
          {workspaces.map((w, i) => (
            <Link
              key={w.id}
              href={`/plans/${w.id}`}
              className="ru-strip group grid items-baseline gap-4 border-b border-[var(--hairline-soft)] py-5 pl-5 pr-2 last:border-b-0 hover:bg-[var(--tint-hover)] transition-colors"
              style={{
                gridTemplateColumns: "40px minmax(0,1fr) 96px",
                ["--entity-color" as string]: "var(--entity-plan)",
              }}
            >
              <span className="font-mono text-[10.5px] tabular-nums text-muted-foreground/35 select-none">
                {(i + 1).toString().padStart(3, "0")}
              </span>
              <div className="min-w-0">
                <div className="flex items-baseline justify-between gap-3">
                  <h3 className="truncate text-[15.5px] font-medium leading-tight">
                    <span className="ru-link">{w.title}</span>
                  </h3>
                  <span className="shrink-0 font-mono text-[10.5px] tabular-nums text-muted-foreground">
                    {w.itemCount.toString().padStart(2, "0")}{" "}
                    <span className="text-muted-foreground/40">items</span>
                  </span>
                </div>
                {w.description ? (
                  <p className="mt-1 line-clamp-1 text-[13px] text-muted-foreground">
                    {w.description}
                  </p>
                ) : null}
                <div className="mt-3 flex items-center gap-3">
                  <HairlineProgress value={Math.min(100, w.itemCount * 8)} className="flex-1 max-w-[260px]" />
                  <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground/60">
                    {formatAgo(w.created_at, nowMs)}
                  </span>
                </div>
              </div>
              <span className="text-right font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground/50 transition-colors group-hover:text-foreground">
                open ↗
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
