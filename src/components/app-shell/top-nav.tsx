"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const tabs = [
  { name: "Chat", href: "/chat" },
  { name: "Routines", href: "/routines" },
  { name: "Tasks", href: "/tasks" },
  { name: "Insights", href: "/insights" },
];

export function TopNav() {
  const pathname = usePathname();
  return (
    <nav className="sticky top-0 z-50 border-b border-[rgba(255,255,255,0.06)] bg-background/80 backdrop-blur-sm">
      <div className="mx-auto flex h-12 max-w-5xl items-center justify-between px-4">
        <div className="flex items-center gap-1">
          <Link href="/chat" className="mr-6 text-base font-bold tracking-tight">Ru</Link>
          <div className="flex overflow-x-auto scrollbar-none">
            {tabs.map((tab) => (
              <Link key={tab.href} href={tab.href}
                className={cn("relative whitespace-nowrap px-3 py-3 text-sm transition-colors",
                  pathname === tab.href ? "text-foreground" : "text-muted-foreground hover:text-foreground"
                )}>
                {tab.name}
                {pathname === tab.href && <span className="absolute inset-x-3 -bottom-px h-px bg-foreground" />}
              </Link>
            ))}
          </div>
        </div>
        <Link href="/settings"
          className={cn("text-sm transition-colors",
            pathname === "/settings" ? "text-foreground" : "text-muted-foreground hover:text-foreground"
          )}>
          Settings
        </Link>
      </div>
    </nav>
  );
}
