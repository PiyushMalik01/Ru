"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Check, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { acceptExtracted, rejectExtracted } from "@/app/(app)/inbox/extracted/actions";

type ExtractionKind = "task" | "reminder" | "event" | "activity" | "note";

interface Props {
  id: string;
  source: string;
  kind: ExtractionKind;
  kindAccent: string;
  confidence: number;
  previewFrom: string | null;
  previewSubject: string | null;
  previewSnippet: string | null;
}

export function ExtractedItem({
  id,
  source,
  kind,
  kindAccent,
  confidence,
  previewFrom,
  previewSubject,
  previewSnippet,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [dismissed, setDismissed] = React.useState<"accept" | "reject" | null>(null);

  function act(verb: "accept" | "reject") {
    setDismissed(verb);
    startTransition(async () => {
      try {
        if (verb === "accept") await acceptExtracted(id);
        else await rejectExtracted(id);
      } catch {
        // Optimistic — leave dismissed in place on transient failure.
      }
      router.refresh();
    });
  }

  if (dismissed) return null;

  return (
    <article
      className={cn(
        "relative flex flex-col gap-3 rounded-2xl border border-[var(--hairline)] bg-[var(--card)]",
        "px-4 py-4 transition-colors sm:px-5 sm:py-5",
        pending && "opacity-60",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <span
              aria-hidden
              className="inline-block h-2 w-2 rounded-[2px]"
              style={{ background: kindAccent }}
            />
            <span
              className="font-mono text-[10px] uppercase tracking-[0.2em] text-foreground"
              style={{ fontVariationSettings: "'wght' 640, 'wdth' 100" }}
            >
              {kind}
            </span>
            <span
              className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground/70"
              style={{ fontVariationSettings: "'wght' 500, 'wdth' 96" }}
            >
              · {source}
            </span>
          </div>

          {previewFrom && (
            <span
              className="font-mono text-[11px] text-muted-foreground/85"
              style={{ fontVariationSettings: "'wght' 500, 'wdth' 96" }}
            >
              {previewFrom}
            </span>
          )}

          {previewSubject && (
            <h3
              className="text-[17px] leading-[1.3] text-foreground"
              style={{
                fontFamily: "var(--font-fraunces), Georgia, serif",
                fontVariationSettings: "'wght' 540, 'opsz' 24",
                letterSpacing: "-0.01em",
              }}
            >
              {previewSubject}
            </h3>
          )}

          {previewSnippet && (
            <p
              className="line-clamp-2 text-[14px] leading-[1.5] text-muted-foreground"
              style={{ fontVariationSettings: "'wght' 460, 'wdth' 96" }}
            >
              {previewSnippet}
            </p>
          )}
        </div>

        <span
          className="shrink-0 whitespace-nowrap font-mono text-[10px] uppercase tracking-[0.14em] tabular-nums text-muted-foreground/85"
          style={{ fontVariationSettings: "'wght' 600, 'wdth' 100" }}
          title={`Model confidence ${(confidence * 100).toFixed(0)}%`}
        >
          {(confidence * 100).toFixed(0)}%
        </span>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => act("accept")}
          disabled={pending}
          className={cn(
            "inline-flex h-8 items-center gap-1.5 rounded-full px-3.5",
            "bg-[var(--foreground)] text-[var(--background)]",
            "font-mono text-[10.5px] font-semibold uppercase tracking-[0.14em]",
            "transition-opacity hover:opacity-90 disabled:opacity-50",
          )}
        >
          <Check className="h-3.5 w-3.5" />
          accept
        </button>
        <button
          type="button"
          onClick={() => act("reject")}
          disabled={pending}
          className={cn(
            "inline-flex h-8 items-center gap-1.5 rounded-full bg-foreground/8 px-3.5",
            "font-mono text-[10.5px] font-semibold uppercase tracking-[0.14em] text-foreground",
            "transition-colors hover:bg-foreground/15 disabled:opacity-50",
          )}
        >
          <X className="h-3.5 w-3.5" />
          reject
        </button>
      </div>
    </article>
  );
}
