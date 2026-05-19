"use client";

// Thin component wrapper around useRelativeTime — useful when you need
// a relative-time string inside a .map() where hooks can't be called
// directly. Renders a stable absolute date during SSR and upgrades to
// the live relative string after mount, so no hydration mismatch.

import { useRelativeTime } from "@/lib/hooks/use-relative-time";

interface Props {
  iso: string | null | undefined;
  /** Override the SSR fallback (default: "MMM D" via useRelativeTime). */
  fallback?: string;
}

export function RelativeTime({ iso, fallback }: Props) {
  const text = useRelativeTime(iso ?? null, fallback ? { fallback } : undefined);
  return <>{text}</>;
}
