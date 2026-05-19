"use client";

// Hydration-safe "5m ago / 2h / 3d / May 18" formatter. Date.now() in a render
// path causes server-and-client first renders to disagree by tiny amounts
// that cross bucket boundaries (e.g. 17.49h → "17h" on server, 17.51h → "18h"
// on client). The fix is to render a STABLE fallback during SSR and the
// initial client render, then update to the live relative time after mount
// via useEffect.

import { useEffect, useState } from "react";

interface Options {
  /** What to show during SSR / before mount. Default: en-US absolute date. */
  fallback?: string;
  /** How often to recompute (ms). Default: 60s. */
  intervalMs?: number;
}

export function useRelativeTime(iso: string | null, opts: Options = {}): string {
  const fallback =
    opts.fallback ?? (iso ? absoluteFallback(iso) : "");

  const [text, setText] = useState(fallback);

  useEffect(() => {
    if (!iso) return;
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return;

    const compute = () => setText(formatRelative(d));
    compute();
    const t = setInterval(compute, opts.intervalMs ?? 60_000);
    return () => clearInterval(t);
  }, [iso, opts.intervalMs]);

  return text;
}

function formatRelative(d: Date): string {
  const diff = Date.now() - d.getTime();
  const mins = Math.round(diff / 60_000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d`;
  return absoluteFallback(d.toISOString());
}

function absoluteFallback(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
