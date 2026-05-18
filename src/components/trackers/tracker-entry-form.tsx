"use client";

import { useRef, useTransition } from "react";
import { logEntryAction } from "@/app/(app)/trackers/actions";
import type { TrackerField } from "@/lib/queries/trackers";
import { cn } from "@/lib/utils";

interface Props {
  trackerId: string;
  fields: TrackerField[];
  accent: { bg: string; fg: string };
}

export function TrackerEntryForm({ trackerId, fields, accent }: Props) {
  const formRef = useRef<HTMLFormElement>(null);
  const [isPending, startTransition] = useTransition();

  function onSubmit(formData: FormData) {
    formData.set("trackerId", trackerId);
    startTransition(async () => {
      await logEntryAction(formData);
      formRef.current?.reset();
    });
  }

  return (
    <form
      ref={formRef}
      action={onSubmit}
      className="rounded-2xl border border-[var(--hairline)] bg-[var(--card)] p-4"
    >
      <div className="mb-3 flex items-baseline justify-between">
        <h3 className="font-mono text-[10px] uppercase tracking-[0.18em] text-foreground">
          Log entry
        </h3>
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
          now
        </span>
      </div>

      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        {fields.map((f) => (
          <label key={f.key} className="block">
            <span className="block pb-1 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              {f.label}
              {f.unit ? ` · ${f.unit}` : ""}
            </span>
            <input
              type={f.type === "text" ? "text" : "number"}
              step="any"
              inputMode={f.type === "text" ? undefined : "decimal"}
              name={`field:${f.key}`}
              placeholder={f.type === "duration" ? "min" : f.unit || ""}
              className="w-full rounded-md border border-[var(--hairline-strong)] bg-transparent px-3 py-1.5 text-[14px] text-foreground placeholder:text-muted-foreground/60 focus:border-foreground focus:outline-none"
            />
          </label>
        ))}
      </div>

      <label className="mt-3 block">
        <span className="block pb-1 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
          notes (optional)
        </span>
        <input
          type="text"
          name="notes"
          className="w-full rounded-md border border-[var(--hairline-strong)] bg-transparent px-3 py-1.5 text-[14px] text-foreground placeholder:text-muted-foreground/60 focus:border-foreground focus:outline-none"
        />
      </label>

      <div className="mt-4 flex items-center justify-end">
        <button
          type="submit"
          disabled={isPending}
          className={cn(
            "rounded-full px-4 py-1.5 font-mono text-[11px] uppercase tracking-[0.14em] transition-opacity",
            "disabled:opacity-50",
          )}
          style={{ background: accent.bg, color: accent.fg }}
        >
          {isPending ? "Saving…" : "Log"}
        </button>
      </div>
    </form>
  );
}
