"use client";

// NotificationToast — when a push arrives while the tab is visible+focused, the
// service worker postMessages the payload here instead of firing an OS-level
// notification (that's the whole point of presence-aware push). We render a
// soft inline chip above the pill so the user sees Ru reaching out without the
// noisy double-ping.
//
// Editorial premium — same visual language as SuggestionToast: Fraunces
// serif, mono uppercase eyebrow, earthy palette, no purple/gradient/emoji.
// Auto-dismiss after 8s; click → navigate to the notification's URL.

import * as React from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

interface RuNotificationPayload {
  title: string;
  body?: string;
  url?: string;
  tag?: string;
}

interface VisibleToast extends RuNotificationPayload {
  id: number;
}

const AUTO_DISMISS_MS = 8000;

export function NotificationToast() {
  const router = useRouter();
  const [current, setCurrent] = React.useState<VisibleToast | null>(null);
  const idRef = React.useRef(0);
  const timeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

    const onMessage = (event: MessageEvent) => {
      const data = event.data as { type?: string; payload?: RuNotificationPayload } | null;
      if (!data || data.type !== "ru-notification" || !data.payload) return;
      const next: VisibleToast = { id: ++idRef.current, ...data.payload };
      // Replace any existing toast — the latest event wins. The user only
      // gets one floating chip; the inbox holds the full history.
      setCurrent(next);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => setCurrent(null), AUTO_DISMISS_MS);
    };

    navigator.serviceWorker.addEventListener("message", onMessage);
    return () => {
      navigator.serviceWorker.removeEventListener("message", onMessage);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  const open = () => {
    if (!current) return;
    const url = current.url || "/inbox";
    setCurrent(null);
    router.push(url);
  };

  return (
    <AnimatePresence>
      {current && (
        <motion.div
          key={current.id}
          initial={{ opacity: 0, y: 16, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 8, scale: 0.97 }}
          transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
          className="fixed bottom-24 right-4 z-[95] w-[min(380px,calc(100vw-32px))]"
        >
          <button
            type="button"
            onClick={open}
            className={cn(
              "group flex w-full flex-col gap-1.5 rounded-2xl border border-[var(--hairline)] bg-[var(--card)] px-5 py-4 text-left shadow-lg transition-colors",
              "hover:border-[var(--entity-insight)]",
            )}
          >
            <span
              className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground"
              style={{ fontVariationSettings: "'wght' 600, 'wdth' 100" }}
            >
              ru noticed
            </span>
            <span
              className="font-display text-[18px] leading-[1.15] text-foreground"
              style={{ fontVariationSettings: "'wght' 540, 'opsz' 32", letterSpacing: "-0.01em" }}
            >
              {current.title}
            </span>
            {current.body && (
              <span className="text-[13px] leading-[1.5] text-muted-foreground line-clamp-3">
                {current.body}
              </span>
            )}
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
