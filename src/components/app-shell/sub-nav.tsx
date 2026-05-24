"use client";

// Quiet secondary nav strip — appears under the main TopNav on data
// surfaces. Without this, /plans, /tasks, /routines, /insights, /trackers
// are reachable only by deep link. Renders nothing on Today/Chat/Settings
// so those pages stay clean.

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

interface SubLink {
  label: string;
  href: string;
  /** Active when the pathname starts with this prefix. */
  match: (p: string) => boolean;
}

const SUB_LINKS: SubLink[] = [
  {
    label: "sheet",
    href: "/sheet",
    match: (p) => p === "/sheet" || p.startsWith("/sheet/"),
  },
  {
    label: "tasks",
    href: "/tasks",
    match: (p) => p === "/tasks" || p.startsWith("/tasks/"),
  },
  {
    label: "routines",
    href: "/routines",
    match: (p) =>
      p === "/routines" ||
      p.startsWith("/routines/") ||
      p.startsWith("/trackers/"),
  },
  {
    label: "plans",
    href: "/plans",
    match: (p) => p === "/plans" || p.startsWith("/plans/"),
  },
  {
    label: "insights",
    href: "/insights",
    match: (p) => p === "/insights" || p.startsWith("/insights/"),
  },
];

function shouldShow(pathname: string): boolean {
  return SUB_LINKS.some((l) => l.match(pathname));
}

export function SubNav() {
  const pathname = usePathname();
  if (!shouldShow(pathname)) return null;

  return (
    <div className="sticky top-14 z-40 border-b border-[var(--hairline-soft)] bg-background/85 backdrop-blur-xl">
      <div className="mx-auto flex h-10 max-w-6xl items-center gap-1 overflow-x-auto px-6 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {SUB_LINKS.map((link) => {
          const active = link.match(pathname);
          return (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                "relative whitespace-nowrap rounded-md px-2.5 py-1 text-[13px] transition-colors",
                active
                  ? "text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
              style={{ fontWeight: active ? 600 : 500 }}
            >
              {link.label}
              {active && (
                <span
                  aria-hidden
                  className="absolute inset-x-2.5 -bottom-px h-[2px] rounded-full bg-foreground"
                />
              )}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
