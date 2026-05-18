"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

// The three primary surfaces of Ru. Settings sits on the far right.
// Order matters: Today is the publication, Sheet is the database, Chat is the conversation.
const tabs = [
  { name: "Today", href: "/today" },
  { name: "Sheet", href: "/sheet" },
  { name: "Chat",  href: "/chat"  },
];

function isActive(pathname: string, href: string): boolean {
  if (href === "/today")  return pathname === "/today" || pathname === "/";
  if (href === "/sheet")  return pathname.startsWith("/sheet") || pathname.startsWith("/plans");
  if (href === "/chat")   return pathname.startsWith("/chat");
  return pathname === href;
}

export function TopNav() {
  const pathname = usePathname();
  return (
    <nav
      className={cn(
        // A thin top frame, dark and matte. Border bottom is a true hairline.
        "sticky top-0 z-50 bg-background/90 backdrop-blur-md",
        "border-b border-[rgba(255,255,255,0.06)]",
      )}
    >
      <div className="mx-auto flex h-12 max-w-5xl items-center justify-between px-5">
        {/* Wordmark: "ru." as a publication identifier. Geist Mono, medium.
            The period is a thin character — it reads as the masthead full stop. */}
        <div className="flex items-baseline gap-7">
          <Link
            href="/today"
            aria-label="Ru — home"
            className="group flex items-baseline gap-px font-mono text-[14px] font-medium tracking-[-0.01em] text-foreground"
          >
            <span>ru</span>
            <span className="text-foreground/60 transition-colors group-hover:text-foreground">.</span>
          </Link>

          <div className="flex items-baseline gap-1">
            {tabs.map((tab) => {
              const active = isActive(pathname, tab.href);
              return (
                <Link
                  key={tab.href}
                  href={tab.href}
                  className={cn(
                    // No icons. Text-weight + position only — like a magazine masthead.
                    "group relative whitespace-nowrap px-2.5 py-3 text-[13px] transition-colors",
                    active
                      ? "text-foreground font-medium"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {tab.name}
                  {active && (
                    // The active mark is a short hairline directly under the word,
                    // inset slightly from the text edges. Reads like a print rule.
                    <span className="absolute inset-x-2.5 -bottom-px h-px bg-foreground" />
                  )}
                </Link>
              );
            })}
          </div>
        </div>

        <Link
          href="/settings"
          className={cn(
            "text-[13px] transition-colors",
            pathname === "/settings"
              ? "text-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          Settings
        </Link>
      </div>
    </nav>
  );
}
