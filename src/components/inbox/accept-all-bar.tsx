"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { acceptAll } from "@/app/(app)/inbox/extracted/actions";

interface Props {
  ids: string[];
}

export function AcceptAllBar({ ids }: Props) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const count = ids.length;

  function handle() {
    startTransition(async () => {
      try {
        await acceptAll(ids);
      } catch {
        // Optimistic.
      }
      router.refresh();
    });
  }

  return (
    <div
      className={cn(
        "pointer-events-none fixed inset-x-0 bottom-24 z-30 flex justify-center px-4",
      )}
      aria-live="polite"
    >
      <div
        className={cn(
          "pointer-events-auto flex items-center gap-3 rounded-full border border-[var(--hairline)]",
          "bg-[var(--card)]/95 px-4 py-2.5 shadow-[0_12px_32px_-16px_rgba(0,0,0,0.22)] backdrop-blur-xl",
        )}
      >
        <span
          className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground"
          style={{ fontVariationSettings: "'wght' 600, 'wdth' 100" }}
        >
          {count} pending
        </span>
        <button
          type="button"
          onClick={handle}
          disabled={pending}
          className={cn(
            "inline-flex h-8 items-center gap-1.5 rounded-full px-4",
            "bg-[var(--foreground)] text-[var(--background)]",
            "font-mono text-[10.5px] font-semibold uppercase tracking-[0.14em]",
            "transition-opacity hover:opacity-90 disabled:opacity-50",
          )}
        >
          <Check className="h-3.5 w-3.5" />
          {pending ? "…" : "accept all"}
        </button>
      </div>
    </div>
  );
}
