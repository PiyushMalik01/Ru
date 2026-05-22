"use client";

// Anticipation section — "Ru noticed."
//
// Editorial premium row above the bento. Fetches pending suggestions from
// the briefing surface and renders 0..5 of them as wide cream cards with
// a Fraunces heading, mono eyebrow label, body message, and three actions:
// primary (act, label varies by type), snooze (menu), dismiss (X).
//
// Mutations are optimistic — the card fades out (150ms) immediately and we
// fire-and-forget the POST. If the POST fails we don't reinstate; the
// suggestion will re-appear on next briefing refresh if still pending.
// This matches the soft-touch tone of the surface: never block the user.

import * as React from "react";
import Link from "next/link";
import { Check, X, Clock, ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// ---------------------------------------------------------------------------
// Types — kept local so this component has no coupling to server-only modules.
// Mirror the API contract from /api/suggestions.
// ---------------------------------------------------------------------------

type SuggestionType =
  | "routine_adherence"
  | "task_urgency"
  | "routine_candidate"
  | "promise_followup"
  | "cross_thread";

type SuggestionPriority = "soft" | "urgent";

interface Suggestion {
  id: string;
  type: SuggestionType;
  payload: Record<string, unknown>;
  message: string;
  priority: SuggestionPriority;
  confidence: number;
  show_at: string;
  created_at: string;
}

interface SuggestionsResponse {
  suggestions: Suggestion[];
}

type SnoozeWindow = "tomorrow" | "next_morning" | "1h" | "3h";

// ---------------------------------------------------------------------------
// Per-type config — humanized eyebrow label + primary action label.
// ---------------------------------------------------------------------------

const TYPE_LABEL: Record<SuggestionType, string> = {
  routine_adherence: "Routine",
  task_urgency: "Task",
  routine_candidate: "Idea",
  promise_followup: "Follow-up",
  cross_thread: "Thread",
};

const TYPE_ACTION_LABEL: Record<SuggestionType, string> = {
  routine_adherence: "Mark done",
  task_urgency: "Open task",
  routine_candidate: "Make routine",
  promise_followup: "Yes",
  cross_thread: "Open chat",
};

// Small accent dot color per type — uses entity tokens where they exist,
// falls back to a soft muted swatch otherwise. Earthy palette only.
const TYPE_ACCENT: Record<SuggestionType, string> = {
  routine_adherence: "var(--entity-routine)",
  task_urgency: "var(--entity-task)",
  routine_candidate: "var(--entity-routine)",
  promise_followup: "var(--entity-task)",
  cross_thread: "var(--muted-foreground)",
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AnticipationSection() {
  const [suggestions, setSuggestions] = React.useState<Suggestion[] | null>(
    null,
  );
  // IDs currently fading out — kept in state so the 150ms transition runs
  // before we remove the row.
  const [fadingOut, setFadingOut] = React.useState<Set<string>>(new Set());

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          "/api/suggestions?status=pending&surface=briefing",
          { cache: "no-store" },
        );
        if (!res.ok) {
          if (!cancelled) setSuggestions([]);
          return;
        }
        const data = (await res.json()) as SuggestionsResponse;
        if (cancelled) return;
        // Server already orders by priority. Cap to top 5.
        setSuggestions((data.suggestions ?? []).slice(0, 5));
      } catch {
        if (!cancelled) setSuggestions([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const removeOptimistically = React.useCallback((id: string) => {
    setFadingOut((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
    window.setTimeout(() => {
      setSuggestions((prev) => (prev ? prev.filter((s) => s.id !== id) : prev));
      setFadingOut((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }, 150);
  }, []);

  const postJson = React.useCallback(async (url: string, body: unknown) => {
    try {
      await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
    } catch {
      // Optimistic — swallow. Suggestion will re-surface if pending.
    }
  }, []);

  const handleAct = React.useCallback(
    (s: Suggestion) => {
      removeOptimistically(s.id);
      void postJson(`/api/suggestions/${s.id}/acted`, { surface: "briefing" });
    },
    [postJson, removeOptimistically],
  );

  const handleSnooze = React.useCallback(
    (s: Suggestion, until: SnoozeWindow) => {
      removeOptimistically(s.id);
      void postJson(`/api/suggestions/${s.id}/snooze`, { until });
    },
    [postJson, removeOptimistically],
  );

  const handleDismiss = React.useCallback(
    (s: Suggestion) => {
      removeOptimistically(s.id);
      void postJson(`/api/suggestions/${s.id}/dismiss`, { surface: "briefing" });
    },
    [postJson, removeOptimistically],
  );

  // Empty / loading: render nothing. Per spec — no empty state.
  if (!suggestions || suggestions.length === 0) {
    return null;
  }

  return (
    <section className="mt-12">
      {/* Header — Fraunces serif, small mono counter on the right */}
      <div className="mb-5 flex items-baseline justify-between">
        <h2 className="font-display text-[28px] leading-none text-foreground sm:text-[32px]">
          Ru noticed
        </h2>
        <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
          {suggestions.length.toString().padStart(2, "0")} pending
        </span>
      </div>

      <ul className="flex flex-col gap-3">
        {suggestions.map((s) => (
          <li
            key={s.id}
            className={cn(
              "transition-opacity duration-150",
              fadingOut.has(s.id) ? "opacity-0" : "opacity-100",
            )}
          >
            <SuggestionCard
              suggestion={s}
              onAct={() => handleAct(s)}
              onSnooze={(until) => handleSnooze(s, until)}
              onDismiss={() => handleDismiss(s)}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Card
// ---------------------------------------------------------------------------

interface CardProps {
  suggestion: Suggestion;
  onAct: () => void;
  onSnooze: (until: SnoozeWindow) => void;
  onDismiss: () => void;
}

function SuggestionCard({ suggestion, onAct, onSnooze, onDismiss }: CardProps) {
  const label = TYPE_LABEL[suggestion.type];
  const actLabel = TYPE_ACTION_LABEL[suggestion.type];
  const accent = TYPE_ACCENT[suggestion.type];

  // For task_urgency we link the primary action to the task page.
  const taskHref = taskHrefFromPayload(suggestion);

  return (
    <div
      className={cn(
        "group/anticipation rounded-2xl border bg-[var(--card)] px-5 py-4 transition-colors",
        "hover:border-[color-mix(in_oklch,var(--border),var(--foreground)_8%)]",
      )}
      style={{ borderColor: "var(--border)" }}
    >
      <div className="flex items-start gap-4">
        {/* Accent dot — entity-coded, tiny */}
        <span
          aria-hidden
          className="mt-[9px] h-2 w-2 shrink-0 rounded-[2px]"
          style={{ background: accent }}
        />

        <div className="min-w-0 flex-1">
          {/* Eyebrow: typewriter-style mono uppercase */}
          <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
            {label}
            {suggestion.priority === "urgent" && (
              <span className="ml-2 text-[var(--foreground)]/80">· now</span>
            )}
          </div>

          {/* The message itself — body sans, slightly larger than other Today text */}
          <p className="mt-2 text-[16px] leading-[1.45] text-foreground sm:text-[17px]">
            {suggestion.message}
          </p>

          {/* Action row */}
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <PrimaryAction
              label={actLabel}
              href={suggestion.type === "task_urgency" ? taskHref : undefined}
              onClick={onAct}
            />

            {suggestion.type === "promise_followup" && (
              <SubtleButton onClick={() => onSnooze("tomorrow")}>
                Not yet
              </SubtleButton>
            )}

            <SnoozeMenu
              onChoose={onSnooze}
              triggerClassName="ml-auto sm:ml-2"
            />

            <button
              type="button"
              onClick={onDismiss}
              aria-label="Dismiss suggestion"
              className={cn(
                "inline-flex h-7 w-7 items-center justify-center rounded-full",
                "text-muted-foreground transition-colors",
                "hover:bg-[color-mix(in_oklch,var(--foreground),transparent_92%)] hover:text-foreground",
              )}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Action sub-components
// ---------------------------------------------------------------------------

function PrimaryAction({
  label,
  href,
  onClick,
}: {
  label: string;
  href?: string;
  onClick: () => void;
}) {
  // Earthy dark pill. Matches `ru-pill-dark` aesthetic but local-styled so we
  // don't depend on global utility classes we can't verify.
  const className = cn(
    "inline-flex h-8 items-center gap-1.5 rounded-full px-3.5",
    "bg-[var(--foreground)] text-[var(--background)]",
    "font-mono text-[11px] font-semibold uppercase tracking-[0.14em]",
    "transition-opacity hover:opacity-90",
  );

  if (href) {
    return (
      <Link
        href={href}
        onClick={onClick}
        className={className}
      >
        <Check className="h-3.5 w-3.5" />
        {label}
        <ArrowUpRight className="h-3 w-3 opacity-70" />
      </Link>
    );
  }

  return (
    <button type="button" onClick={onClick} className={className}>
      <Check className="h-3.5 w-3.5" />
      {label}
    </button>
  );
}

function SubtleButton({
  onClick,
  children,
}: {
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex h-8 items-center rounded-full border px-3",
        "font-mono text-[11px] font-semibold uppercase tracking-[0.14em]",
        "text-foreground/80 transition-colors",
        "hover:bg-[color-mix(in_oklch,var(--foreground),transparent_94%)] hover:text-foreground",
      )}
      style={{ borderColor: "var(--border)" }}
    >
      {children}
    </button>
  );
}

function SnoozeMenu({
  onChoose,
  triggerClassName,
}: {
  onChoose: (until: SnoozeWindow) => void;
  triggerClassName?: string;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          "inline-flex h-8 items-center gap-1.5 rounded-full px-3",
          "font-mono text-[11px] font-semibold uppercase tracking-[0.14em]",
          "text-muted-foreground transition-colors",
          "hover:bg-[color-mix(in_oklch,var(--foreground),transparent_94%)] hover:text-foreground",
          triggerClassName,
        )}
      >
        <Clock className="h-3.5 w-3.5" />
        Snooze
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={6}>
        <DropdownMenuItem onClick={() => onChoose("1h")}>
          1 hour
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onChoose("next_morning")}>
          Tonight
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onChoose("tomorrow")}>
          Tomorrow
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Best-effort task href extraction from suggestion.payload. The payload shape
 * is detector-specific; for task_urgency the common shape is `{ taskId }` but
 * we also tolerate `task_id` / `id`. Falls back to /tasks if nothing matches.
 */
function taskHrefFromPayload(s: Suggestion): string {
  const p = s.payload ?? {};
  const candidate =
    (typeof p.taskId === "string" && p.taskId) ||
    (typeof p.task_id === "string" && p.task_id) ||
    (typeof p.id === "string" && p.id) ||
    null;
  return candidate ? `/tasks/${candidate}` : "/tasks";
}
