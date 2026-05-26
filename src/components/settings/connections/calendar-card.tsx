"use client";

// Google Calendar card — mirrors GmailCard. Two-way sync: ru pulls events
// into Today and pushes tasks-with-due-dates as calendar events. Only one
// connect flow for the whole Google integration, so we never show a separate
// "connect calendar" button — if the account is connected, the calendar
// scopes are already granted. We only show controls (toggle + sync now +
// disconnect) when the integration is live.

import * as React from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, Loader2 } from "lucide-react";
import { Toggle } from "./toggle";
import { setGoogleFeature } from "@/app/(app)/settings/connections/actions";
import { cn } from "@/lib/utils";

interface Props {
  connected: boolean;
  syncEnabled: boolean;
  lastSyncedAt: string | null;
}

export function CalendarCard({ connected, syncEnabled, lastSyncedAt }: Props) {
  const router = useRouter();
  const [enabled, setEnabled] = React.useState(syncEnabled);
  const [syncing, setSyncing] = React.useState(false);
  const [disconnecting, setDisconnecting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [, startTransition] = React.useTransition();

  const handleToggle = (next: boolean) => {
    const previous = enabled;
    setEnabled(next);
    setError(null);
    startTransition(async () => {
      try {
        await setGoogleFeature("calendar_sync", next);
      } catch {
        setEnabled(previous);
        setError("couldn't save");
      }
    });
  };

  const handleSync = async () => {
    setSyncing(true);
    setError(null);
    try {
      const res = await fetch("/api/google/calendar/sync", { method: "POST" });
      if (!res.ok) throw new Error(await res.text());
      router.refresh();
    } catch {
      setError("sync failed");
    } finally {
      setSyncing(false);
    }
  };

  const handleDisconnect = async () => {
    if (!window.confirm("disconnect google? this clears both gmail and calendar access.")) return;
    setDisconnecting(true);
    setError(null);
    try {
      const res = await fetch("/api/google/disconnect", { method: "POST" });
      if (!res.ok) throw new Error(await res.text());
      router.refresh();
    } catch {
      setError("couldn't disconnect");
    } finally {
      setDisconnecting(false);
    }
  };

  return (
    <article className="flex h-full flex-col gap-5 rounded-2xl border border-[var(--hairline)] bg-[var(--card)] p-6 md:p-7">
      <header className="flex items-start gap-3">
        <span
          aria-hidden
          className="mt-0.5 inline-flex h-9 w-9 items-center justify-center rounded-xl"
          style={{ background: "color-mix(in oklch, var(--entity-plan), transparent 86%)" }}
        >
          <CalendarDays className="h-4 w-4" style={{ color: "var(--entity-plan)" }} aria-hidden />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h3
            className="font-display lowercase leading-[1] text-foreground"
            style={{
              fontSize: "clamp(20px, 2.4vw, 24px)",
              fontVariationSettings: "'wght' 560, 'opsz' 48",
              letterSpacing: "-0.02em",
            }}
          >
            google calendar.
          </h3>
          <p className="text-[13.5px] leading-[1.5] text-muted-foreground" style={{ fontVariationSettings: "'wght' 460" }}>
            two-way: see your events in today, push tasks with due dates as calendar events.
          </p>
        </div>
        <StatusDot on={connected && enabled} />
      </header>

      <div className="mt-auto flex flex-col gap-3">
        {!connected ? (
          <a
            href="/api/google/connect"
            className={cn(
              "inline-flex h-10 items-center justify-center gap-2 self-start rounded-full px-5",
              "bg-foreground text-background",
              "font-mono text-[11px] uppercase tracking-[0.18em] transition-opacity hover:opacity-90",
            )}
            style={{ fontVariationSettings: "'wght' 560" }}
          >
            connect google →
          </a>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-1.5 text-[12.5px] sm:grid-cols-[auto_1fr] sm:gap-x-5 sm:gap-y-1.5">
              <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground sm:pt-0.5">
                last synced
              </span>
              <span className="font-mono text-foreground">{formatAgo(lastSyncedAt)}</span>
            </div>

            <div className="mt-1 flex items-center justify-between gap-4 rounded-xl border border-[var(--hairline-soft)] px-3.5 py-3">
              <div className="flex flex-col gap-0.5">
                <span
                  className="font-mono text-[10px] uppercase tracking-[0.2em] text-foreground"
                  style={{ fontVariationSettings: "'wght' 600" }}
                >
                  sync
                </span>
                <span className="text-[12.5px] text-muted-foreground">pull events in, push tasks out</span>
              </div>
              <Toggle checked={enabled} onChange={handleToggle} label="calendar sync" />
            </div>

            <div className="mt-1 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleSync}
                disabled={syncing}
                className={cn(
                  "inline-flex h-9 items-center gap-1.5 rounded-full border border-[var(--hairline)] px-4",
                  "font-mono text-[11px] uppercase tracking-[0.18em] text-foreground",
                  "transition-colors hover:bg-secondary disabled:opacity-50",
                )}
                style={{ fontVariationSettings: "'wght' 560" }}
              >
                {syncing && <Loader2 className="h-3 w-3 animate-spin" aria-hidden />}
                {syncing ? "syncing…" : "sync now"}
              </button>
              <button
                type="button"
                onClick={handleDisconnect}
                disabled={disconnecting}
                className={cn(
                  "ml-auto text-[12.5px] text-muted-foreground transition-colors",
                  "hover:text-foreground disabled:opacity-50",
                )}
              >
                {disconnecting ? "disconnecting…" : "disconnect"}
              </button>
            </div>
          </>
        )}

        {error && (
          <p className="text-[12px]" style={{ color: "var(--error, #a3341a)" }} role="alert">
            {error}
          </p>
        )}
      </div>
    </article>
  );
}

function StatusDot({ on }: { on: boolean }) {
  return (
    <span
      className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-[var(--hairline)] bg-secondary px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground"
      style={{ fontVariationSettings: "'wght' 580" }}
    >
      <span
        className="h-1.5 w-1.5 rounded-full"
        style={{ background: on ? "var(--entity-plan)" : "var(--muted-foreground)" }}
      />
      {on ? "on" : "off"}
    </span>
  );
}

function formatAgo(iso: string | null): string {
  if (!iso) return "never";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "never";
  const diff = Date.now() - then;
  if (diff < 0) return "just now";
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
