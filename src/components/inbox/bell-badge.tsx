"use client";

// BellBadge — top-bar bell with a live unread count.
//
// Reads `initialCount` from a server component, then subscribes to Supabase
// realtime INSERT events on `notifications` filtered to the current user.
// Each insert bumps the local counter. Clicking navigates to /inbox where
// the actual list lives (and where the counter will be reconciled by the
// next server render).
//
// Visual: a Bell icon inside a rounded-full hover-tinted button, with a
// small cobalt circle in the upper-right corner showing the number when > 0.

import * as React from "react";
import Link from "next/link";
import { Bell } from "lucide-react";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";

interface Props {
  initialCount: number;
}

export function BellBadge({ initialCount }: Props) {
  const [count, setCount] = React.useState(initialCount);

  // Re-sync if the server prop changes (e.g. after a router refresh).
  React.useEffect(() => {
    setCount(initialCount);
  }, [initialCount]);

  React.useEffect(() => {
    const supabase = createClient();
    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (cancelled || !user) return;

      channel = supabase
        .channel(`inbox-bell:${user.id}`)
        .on(
          "postgres_changes" as never,
          {
            event: "INSERT",
            schema: "public",
            table: "notifications",
            filter: `user_id=eq.${user.id}`,
          },
          () => {
            // Optimistic bump. The page render on /inbox will reconcile
            // the canonical value.
            setCount((c) => c + 1);
          },
        )
        .subscribe();
    })();

    return () => {
      cancelled = true;
      if (channel) {
        void supabase.removeChannel(channel);
      }
    };
  }, []);

  const display = count > 99 ? "99+" : String(count);

  return (
    <Link
      href="/inbox"
      aria-label={count > 0 ? `Inbox — ${count} unread` : "Inbox"}
      className={cn(
        "relative inline-flex h-9 w-9 items-center justify-center rounded-full p-2",
        "text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground",
      )}
    >
      <Bell className="h-[18px] w-[18px]" aria-hidden />
      {count > 0 && (
        <span
          aria-hidden
          className={cn(
            "absolute -top-0.5 -right-0.5 grid h-[18px] min-w-[18px] place-items-center",
            "rounded-full bg-[var(--entity-task)] px-1 text-[10px] font-mono text-white",
          )}
          style={{ fontVariationSettings: "'wght' 600, 'wdth' 100" }}
        >
          {display}
        </span>
      )}
    </Link>
  );
}
