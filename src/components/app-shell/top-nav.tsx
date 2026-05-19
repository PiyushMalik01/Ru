"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "./theme-toggle";

// Three primary surfaces. Each carries an entity color so the active marker
// reads as a publication section header, not a generic tab indicator.
//   Today  → ochre   (the morning sun, the day ahead)
//   Sheet  → cobalt  (the structured database — same hue as the task entity)
//   Chat   → teal    (insight, conversation — borrowed from --entity-insight)
const tabs: { name: string; href: string; tone: string }[] = [
  { name: "Today", href: "/today", tone: "var(--entity-plan)" },
  { name: "Sheet", href: "/sheet", tone: "var(--entity-task)" },
  { name: "Chat",  href: "/chat",  tone: "var(--entity-insight)" },
];

function isActive(pathname: string, href: string): boolean {
  if (href === "/today")  return pathname === "/today" || pathname === "/";
  if (href === "/sheet")  return pathname.startsWith("/sheet") || pathname.startsWith("/plans") || pathname.startsWith("/tasks") || pathname.startsWith("/routines") || pathname.startsWith("/trackers");
  if (href === "/chat")   return pathname.startsWith("/chat");
  return pathname === href;
}

export function TopNav() {
  const pathname = usePathname();
  const activeIndex = tabs.findIndex((t) => isActive(pathname, t.href));

  return (
    <nav
      className={cn(
        // Slightly taller. Bottom hairline upgraded to a colored 2px strip
        // that follows the active tab's tone — the navbar itself reads as
        // part of the page's identity, not a separator above it.
        "sticky top-0 z-50 bg-background/85 backdrop-blur-xl",
        "border-b border-[var(--hairline-soft)]",
      )}
    >
      {/* Bottom edge tint — the entity color of the active section bleeds
          into the navbar's underline. Subtle, but ties the bar to the page. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 h-[2px] opacity-90 transition-colors duration-500"
        style={{
          background:
            activeIndex >= 0
              ? `linear-gradient(90deg, transparent 0%, ${tabs[activeIndex].tone} 30%, ${tabs[activeIndex].tone} 70%, transparent 100%)`
              : "transparent",
        }}
      />

      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-6 px-6">
        {/* Wordmark — bigger, with a colored dot that animates when fresh.
            The dot inherits the active section's tone so the brand carries
            the current context. */}
        <div className="flex items-center gap-8">
          <Link
            href="/today"
            aria-label="Ru — home"
            className="group flex items-baseline gap-[2px] font-display text-[22px] font-semibold leading-none tracking-[-0.02em] text-foreground"
            style={{ fontVariationSettings: '"SOFT" 100, "WONK" 0, "opsz" 36' }}
          >
            <span>ru</span>
            <span
              aria-hidden
              className="inline-block h-[8px] w-[8px] translate-y-[-2px] rounded-full transition-colors duration-500"
              style={{
                background:
                  activeIndex >= 0 ? tabs[activeIndex].tone : "var(--foreground)",
              }}
            />
          </Link>

          {/* Tabs */}
          <div className="flex items-center gap-1">
            {tabs.map((tab) => {
              const active = isActive(pathname, tab.href);
              return (
                <Link
                  key={tab.href}
                  href={tab.href}
                  className={cn(
                    "group relative whitespace-nowrap rounded-md px-3 py-2 text-[15px] transition-colors",
                    active
                      ? "text-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                  style={{ fontWeight: active ? 600 : 500 }}
                >
                  {tab.name}
                  {/* Active marker — entity-color dot sitting under the word,
                      not a flat underline. Reads as a deliberate mark, not
                      a hover state stuck on. */}
                  {active && (
                    <span
                      aria-hidden
                      className="absolute left-1/2 -bottom-[6px] block h-1.5 w-1.5 -translate-x-1/2 rounded-full"
                      style={{ background: tab.tone }}
                    />
                  )}
                </Link>
              );
            })}
          </div>
        </div>

        <div className="flex items-center gap-4">
          <ThemeToggle />
          <Link
            href="/settings"
            className={cn(
              "text-[14px] transition-colors",
              pathname === "/settings"
                ? "text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
            style={{ fontWeight: 500 }}
          >
            Settings
          </Link>
        </div>
      </div>
    </nav>
  );
}
