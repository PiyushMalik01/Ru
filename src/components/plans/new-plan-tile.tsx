// "Start a new plan" tile — a distinctive dashed-border block, NOT a
// generic button. Sits in the plan grid in the same 28px-radius footprint
// as the saturated cards but in cream with an italic Fraunces call.

"use client";

import { useTransition } from "react";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  action: () => Promise<void>;
  className?: string;
}

export function NewPlanTile({ action, className }: Props) {
  const [pending, startTransition] = useTransition();

  return (
    <form
      action={() => startTransition(() => action())}
      className={cn("contents", className)}
    >
      <button
        type="submit"
        disabled={pending}
        className={cn(
          "group relative flex min-h-[260px] flex-col justify-between rounded-[28px] p-6 text-left transition-colors",
          "border-2 border-dashed border-[var(--hairline-strong)]",
          "hover:border-[var(--entity-plan)] hover:bg-[color-mix(in_srgb,var(--entity-plan)_8%,transparent)]",
          pending && "opacity-60",
        )}
      >
        <div className="flex items-center justify-between">
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground transition-colors group-hover:text-foreground">
            new plan
          </span>
          <span
            className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--entity-plan)] text-[var(--entity-plan-fg)] transition-transform group-hover:rotate-90"
            aria-hidden
          >
            <Plus className="h-4 w-4" strokeWidth={2.2} />
          </span>
        </div>

        <div>
          <div className="font-display text-[26px] italic leading-[1.05] tracking-[-0.012em] text-foreground sm:text-[30px]">
            Start a new plan.
          </div>
          <p className="mt-3 max-w-xs text-[13px] leading-relaxed text-muted-foreground">
            A long thread Ru will keep current — a project, a course of study,
            a recovery. Items collect here over time.
          </p>
        </div>

        <div className="flex items-baseline justify-between font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground/60">
          <span>{pending ? "creating…" : "press to begin"}</span>
          <span className="text-foreground/40">↗</span>
        </div>
      </button>
    </form>
  );
}
