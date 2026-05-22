"use client";

// ---------------------------------------------------------------------------
// SuggestionToast — Ru's anticipatory toast layer.
//
// Mounted globally inside the (app) layout. Subscribes to Supabase realtime
// INSERTs on `public.suggestions` filtered to the current user. When a new
// suggestion is inserted, we schedule it for display:
//   - show_at in the past  → display immediately
//   - show_at within 30min → setTimeout until that moment
//   - show_at further out  → ignore (a later sweep / page reload will pick it
//     up; we don't want to hold timers for hours and we already get realtime
//     re-notification on UPDATE / re-INSERT scenarios)
//
// Visual contract: a 320–400px card pinned just above the floating pill
// (which lives at bottom: 16px + ~56px pill height). We sit at bottom: 96px
// so we never overlap. Editorial premium — Fraunces serif heading, mono
// uppercase tag eyebrow, earthy palette, no purple/gradient/emoji.
//
// One toast at a time. Additional inserts queue; the next one appears 1s
// after the current dismisses. Auto-dismiss after 10s of no action.
//
// On show we PATCH the suggestion via supabase (RLS scoped to user) to set
// surfaced_toast = true + shown_at = now. On user action we POST the
// appropriate /api/suggestions/:id/{acted,dismiss,snooze} endpoint.
// ---------------------------------------------------------------------------

import * as React from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, X, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Database } from "@/types/database";

// ---------------------------------------------------------------------------
// Types — minimal local mirror of the DB row so we don't pull server-only
// modules into the client bundle.
// ---------------------------------------------------------------------------

type SuggestionType =
  | "routine_adherence"
  | "task_urgency"
  | "routine_candidate"
  | "promise_followup"
  | "cross_thread";

type SuggestionPriority = "soft" | "urgent";

interface ToastSuggestion {
  id: string;
  type: SuggestionType;
  priority: SuggestionPriority;
  message: string;
  show_at: string;
}

type SnoozeWindow = "1h" | "3h" | "next_morning" | "tomorrow";

// ---------------------------------------------------------------------------
// Per-type config — eyebrow label + primary action label + accent dot color.
// Mirrors the Today briefing surface so the language is consistent.
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

const TYPE_ACCENT: Record<SuggestionType, string> = {
  routine_adherence: "var(--entity-routine)",
  task_urgency: "var(--entity-task)",
  routine_candidate: "var(--entity-routine)",
  promise_followup: "var(--entity-task)",
  cross_thread: "var(--muted-foreground)",
};

// Don't schedule toasts further than 30 minutes in the future. The cron /
// realtime layer will re-deliver closer to the show_at moment.
const MAX_SCHEDULE_MS = 30 * 60 * 1000;
// Auto-dismiss after this long with no action.
const AUTO_DISMISS_MS = 10_000;
// Gap between dismissing one toast and showing the next from the queue.
const QUEUE_GAP_MS = 1_000;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SuggestionToast() {
  const [current, setCurrent] = React.useState<ToastSuggestion | null>(null);

  // Queue + scheduled timers are refs — they don't drive renders and we want
  // stable references inside the realtime callback (which is created once).
  const queueRef = React.useRef<ToastSuggestion[]>([]);
  const scheduledRef = React.useRef<Map<string, number>>(new Map());
  const shownIdsRef = React.useRef<Set<string>>(new Set());
  const autoDismissRef = React.useRef<number | null>(null);
  const queueGapRef = React.useRef<number | null>(null);
  const currentRef = React.useRef<ToastSuggestion | null>(null);

  React.useEffect(() => {
    currentRef.current = current;
  }, [current]);

  // Promote the next queued suggestion to current, if any. Called after a
  // dismissal / action with a small gap so the exit animation can play.
  const showNext = React.useCallback(() => {
    if (queueGapRef.current !== null) window.clearTimeout(queueGapRef.current);
    queueGapRef.current = window.setTimeout(() => {
      queueGapRef.current = null;
      const next = queueRef.current.shift();
      if (next) setCurrent(next);
    }, QUEUE_GAP_MS);
  }, []);

  // Enqueue or display. If nothing is showing, become the current toast.
  // Otherwise tail the queue.
  const present = React.useCallback((s: ToastSuggestion) => {
    if (shownIdsRef.current.has(s.id)) return;
    shownIdsRef.current.add(s.id);
    if (currentRef.current === null && queueGapRef.current === null) {
      setCurrent(s);
    } else {
      queueRef.current.push(s);
    }
  }, []);

  // Dismiss the current toast WITHOUT firing any API. Used for the auto
  // 10-second timeout and as the cleanup half of all action paths.
  const closeCurrent = React.useCallback(() => {
    if (autoDismissRef.current !== null) {
      window.clearTimeout(autoDismissRef.current);
      autoDismissRef.current = null;
    }
    setCurrent(null);
    showNext();
  }, [showNext]);

  // ---------------------------------------------------------------------
  // Realtime subscription — set up once.
  // ---------------------------------------------------------------------
  React.useEffect(() => {
    const supabase = createClient();
    let cancelled = false;
    // Keep a reference so cleanup can remove the channel even if the auth
    // step hasn't resolved yet.
    let channel: ReturnType<typeof supabase.channel> | null = null;

    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (cancelled || !user) return;

      channel = supabase
        .channel(`suggestion-toast:${user.id}`)
        .on(
          // Note: the typed `.on('postgres_changes', ...)` overload from
          // supabase-js has a tight literal-union shape; we keep this
          // call signature as it is the documented one.
          "postgres_changes" as never,
          {
            event: "INSERT",
            schema: "public",
            table: "suggestions",
            filter: `user_id=eq.${user.id}`,
          },
          (payload: {
            new: Database["public"]["Tables"]["suggestions"]["Row"];
          }) => {
            const row = payload.new;
            // Skip rows that have already been surfaced on this channel by a
            // previous sweep (e.g. server-side fired before realtime caught
            // up).
            if (row.surfaced_toast) return;
            const suggestion: ToastSuggestion = {
              id: row.id,
              type: row.type as SuggestionType,
              priority: row.priority as SuggestionPriority,
              message: row.message,
              show_at: row.show_at,
            };
            scheduleSuggestion(suggestion);
          },
        )
        .subscribe();
    })();

    // Schedule a suggestion for display based on its show_at.
    function scheduleSuggestion(s: ToastSuggestion) {
      const showAtMs = new Date(s.show_at).getTime();
      const delay = showAtMs - Date.now();

      if (delay <= 0) {
        present(s);
        return;
      }
      if (delay > MAX_SCHEDULE_MS) {
        // Too far in the future — drop it; the cron/realtime layer will
        // re-notify closer to the moment.
        return;
      }
      // Replace any prior timer for this id (e.g. duplicate INSERT).
      const existing = scheduledRef.current.get(s.id);
      if (existing !== undefined) window.clearTimeout(existing);
      const handle = window.setTimeout(() => {
        scheduledRef.current.delete(s.id);
        present(s);
      }, delay);
      scheduledRef.current.set(s.id, handle);
    }

    return () => {
      cancelled = true;
      if (channel) {
        void supabase.removeChannel(channel);
      }
      // Clear all pending schedule timers.
      scheduledRef.current.forEach((h) => window.clearTimeout(h));
      scheduledRef.current.clear();
      if (autoDismissRef.current !== null) {
        window.clearTimeout(autoDismissRef.current);
        autoDismissRef.current = null;
      }
      if (queueGapRef.current !== null) {
        window.clearTimeout(queueGapRef.current);
        queueGapRef.current = null;
      }
    };
  }, [present]);

  // ---------------------------------------------------------------------
  // When `current` changes to a real suggestion:
  //   1) start the 10s auto-dismiss timer
  //   2) mark surfaced_toast = true server-side (telemetry; non-blocking)
  // ---------------------------------------------------------------------
  React.useEffect(() => {
    if (!current) return;

    if (autoDismissRef.current !== null) {
      window.clearTimeout(autoDismissRef.current);
    }
    autoDismissRef.current = window.setTimeout(() => {
      autoDismissRef.current = null;
      closeCurrent();
    }, AUTO_DISMISS_MS);

    // Telemetry: mark this suggestion as surfaced on the toast channel.
    // Fire and forget — failure here shouldn't block UX.
    const supabase = createClient();
    void supabase
      .from("suggestions")
      .update({
        surfaced_toast: true,
        shown_at: new Date().toISOString(),
      })
      .eq("id", current.id);

    return () => {
      if (autoDismissRef.current !== null) {
        window.clearTimeout(autoDismissRef.current);
        autoDismissRef.current = null;
      }
    };
  }, [current, closeCurrent]);

  // ---------------------------------------------------------------------
  // Action handlers — all optimistic. POST and don't await.
  // ---------------------------------------------------------------------
  const postJson = React.useCallback(async (url: string, body: unknown) => {
    try {
      await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
    } catch {
      // Optimistic: swallow.
    }
  }, []);

  const handleAct = React.useCallback(() => {
    const s = currentRef.current;
    if (!s) return;
    closeCurrent();
    void postJson(`/api/suggestions/${s.id}/acted`, { surface: "toast" });
  }, [closeCurrent, postJson]);

  const handleDismiss = React.useCallback(() => {
    const s = currentRef.current;
    if (!s) return;
    closeCurrent();
    void postJson(`/api/suggestions/${s.id}/dismiss`, { surface: "toast" });
  }, [closeCurrent, postJson]);

  const handleSnooze = React.useCallback(
    (until: SnoozeWindow) => {
      const s = currentRef.current;
      if (!s) return;
      closeCurrent();
      void postJson(`/api/suggestions/${s.id}/snooze`, { until });
    },
    [closeCurrent, postJson],
  );

  // ---------------------------------------------------------------------
  // Render — bottom-center, just above the floating pill. The pill region
  // claims ~72px from the bottom (16px gutter + 56px pill height); we sit
  // at bottom-24 (96px) to clear it with breathing room. The chat page
  // confines the pill to the chat column (lg:right-[40%]) — we honor the
  // same on /chat so the toast stays aligned with the pill instead of
  // drifting over the workspace panel.
  // ---------------------------------------------------------------------
  return (
    <div
      // pointer-events-none on the wrapper so we never intercept clicks on
      // empty space; the inner card re-enables them.
      className="pointer-events-none fixed inset-x-0 bottom-24 z-40 flex justify-center px-4"
      aria-live="polite"
      aria-atomic="true"
    >
      <AnimatePresence>
        {current && (
          <motion.div
            key={current.id}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className={cn(
              "pointer-events-auto w-full max-w-[380px] min-w-[320px]",
              "rounded-2xl border px-5 py-4 shadow-[0_12px_32px_-16px_rgba(0,0,0,0.22)]",
              "backdrop-blur-xl",
            )}
            style={{
              background: "color-mix(in oklch, var(--card), transparent 4%)",
              borderColor: "var(--border)",
              color: "var(--foreground)",
            }}
            role="status"
          >
            <ToastBody
              suggestion={current}
              onAct={handleAct}
              onSnooze={handleSnooze}
              onDismiss={handleDismiss}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Inner — keeps the motion wrapper clean.
// ---------------------------------------------------------------------------

function ToastBody({
  suggestion,
  onAct,
  onSnooze,
  onDismiss,
}: {
  suggestion: ToastSuggestion;
  onAct: () => void;
  onSnooze: (until: SnoozeWindow) => void;
  onDismiss: () => void;
}) {
  const label = TYPE_LABEL[suggestion.type];
  const actLabel = TYPE_ACTION_LABEL[suggestion.type];
  const accent = TYPE_ACCENT[suggestion.type];

  return (
    <div className="flex items-start gap-3">
      {/* Accent square — entity-coded */}
      <span
        aria-hidden
        className="mt-[7px] h-2 w-2 shrink-0 rounded-[2px]"
        style={{ background: accent }}
      />

      <div className="min-w-0 flex-1">
        {/* Eyebrow tag — mono, uppercase, wide tracking */}
        <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          {label}
          {suggestion.priority === "urgent" && (
            <span className="ml-2 text-foreground/80">· now</span>
          )}
        </div>

        {/* Message — Fraunces serif heading style */}
        <p
          className="mt-1.5 text-[16px] leading-[1.4] text-foreground"
          style={{ fontFamily: "var(--font-fraunces), Georgia, serif" }}
        >
          {suggestion.message}
        </p>

        {/* Action row */}
        <div className="mt-3 flex items-center gap-1.5">
          <button
            type="button"
            onClick={onAct}
            className={cn(
              "inline-flex h-7 items-center gap-1 rounded-full px-3",
              "bg-[var(--foreground)] text-[var(--background)]",
              "font-mono text-[10px] font-semibold uppercase tracking-[0.14em]",
              "transition-opacity hover:opacity-90",
            )}
          >
            <Check className="h-3 w-3" />
            {actLabel}
          </button>

          <DropdownMenu>
            <DropdownMenuTrigger
              className={cn(
                "inline-flex h-7 items-center gap-1 rounded-full px-2.5",
                "font-mono text-[10px] font-semibold uppercase tracking-[0.14em]",
                "text-muted-foreground transition-colors",
                "hover:bg-[color-mix(in_oklch,var(--foreground),transparent_94%)] hover:text-foreground",
              )}
              aria-label="Snooze this suggestion"
            >
              <Clock className="h-3 w-3" />
              Snooze
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" side="top" sideOffset={6}>
              <DropdownMenuItem onClick={() => onSnooze("1h")}>
                1 hour
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onSnooze("3h")}>
                3 hours
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onSnooze("next_morning")}>
                Tonight
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onSnooze("tomorrow")}>
                Tomorrow morning
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <button
            type="button"
            onClick={onDismiss}
            aria-label="Dismiss"
            title="Dismiss"
            className={cn(
              "ml-auto inline-flex h-7 w-7 items-center justify-center rounded-full",
              "text-muted-foreground transition-colors",
              "hover:bg-[color-mix(in_oklch,var(--foreground),transparent_92%)] hover:text-foreground",
            )}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
