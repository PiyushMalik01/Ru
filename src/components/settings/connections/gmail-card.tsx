"use client";

// Gmail connection card — two visual states:
//   1. not connected  → a single link to /api/google/connect (full-page nav,
//      no JS — the auth handshake redirects back here with ?ok=connected).
//   2. connected      → account email, last-sync timestamp, an extraction
//      toggle, a "scan now" button that POSTs to /api/google/gmail/scan,
//      and a disconnect button.
//
// We keep the component small: server passes initial integration state in,
// we manage transient busy/error UI here.

import * as React from "react";
import { useRouter } from "next/navigation";
import { Mail, Loader2 } from "lucide-react";
import { Toggle } from "./toggle";
import { setGoogleFeature } from "@/app/(app)/settings/connections/actions";
import { cn } from "@/lib/utils";

interface Props {
  connected: boolean;
  email: string | null;
  extractionEnabled: boolean;
  lastSyncedAt: string | null;
}

export function GmailCard({ connected, email, extractionEnabled, lastSyncedAt }: Props) {
  const router = useRouter();
  const [enabled, setEnabled] = React.useState(extractionEnabled);
  const [scanning, setScanning] = React.useState(false);
  const [disconnecting, setDisconnecting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [, startTransition] = React.useTransition();

  const handleToggle = (next: boolean) => {
    const previous = enabled;
    setEnabled(next);
    setError(null);
    startTransition(async () => {
      try {
        await setGoogleFeature("gmail_extraction", next);
      } catch {
        setEnabled(previous);
        setError("couldn't save");
      }
    });
  };

  const handleScan = async () => {
    setScanning(true);
    setError(null);
    try {
      const res = await fetch("/api/google/gmail/scan", { method: "POST" });
      if (!res.ok) throw new Error(await res.text());
      router.refresh();
    } catch {
      setError("scan failed");
    } finally {
      setScanning(false);
    }
  };

  const handleDisconnect = async () => {
    if (!window.confirm("disconnect gmail? ru will stop reading new mail.")) return;
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
          style={{ background: "color-mix(in oklch, var(--entity-insight), transparent 86%)" }}
        >
          <Mail className="h-4 w-4" style={{ color: "var(--entity-insight)" }} aria-hidden />
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
            gmail.
          </h3>
          <p className="text-[13.5px] leading-[1.5] text-muted-foreground" style={{ fontVariationSettings: "'wght' 460" }}>
            ru reads new mail and pulls out tasks, reminders, and events for you to review.
          </p>
        </div>
        <StatusDot on={connected} />
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
            connect gmail →
          </a>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-1.5 text-[12.5px] sm:grid-cols-[auto_1fr] sm:gap-x-5 sm:gap-y-1.5">
              <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground sm:pt-0.5">
                account
              </span>
              <span className="font-mono text-foreground">{email ?? "—"}</span>
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
                  extraction
                </span>
                <span className="text-[12.5px] text-muted-foreground">turn ru's mail reading on or off</span>
              </div>
              <Toggle checked={enabled} onChange={handleToggle} label="gmail extraction" />
            </div>

            <div className="mt-1 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleScan}
                disabled={scanning}
                className={cn(
                  "inline-flex h-9 items-center gap-1.5 rounded-full border border-[var(--hairline)] px-4",
                  "font-mono text-[11px] uppercase tracking-[0.18em] text-foreground",
                  "transition-colors hover:bg-secondary disabled:opacity-50",
                )}
                style={{ fontVariationSettings: "'wght' 560" }}
              >
                {scanning && <Loader2 className="h-3 w-3 animate-spin" aria-hidden />}
                {scanning ? "scanning…" : "scan now"}
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
        style={{ background: on ? "var(--entity-insight)" : "var(--muted-foreground)" }}
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
