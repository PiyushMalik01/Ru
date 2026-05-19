"use client";

// Circular-reveal theme toggle.
//
// State comes from our home-rolled theme provider (src/lib/theme), and the
// transition uses the View Transitions API for the radial clipPath animation
// that radiates from the button's center. Both old and new theme stack during
// the transition; the new layer clips open like an expanding circular aperture
// over the old.
//
// Fallbacks gracefully on browsers that don't support startViewTransition.

import { useCallback, useEffect, useRef, useState } from "react";
import { Sun, Moon } from "lucide-react";
import { useTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";

export function ThemeToggle({ className }: { className?: string }) {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  const toggle = useCallback(async () => {
    const isDark = resolvedTheme === "dark";
    const next = isDark ? "light" : "dark";

    type DocWithVT = Document & {
      startViewTransition?: (cb: () => void) => {
        ready: Promise<void>;
      };
    };
    const doc = document as DocWithVT;

    const prefersReduced =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    if (!doc.startViewTransition || prefersReduced || !buttonRef.current) {
      setTheme(next);
      return;
    }

    const { flushSync } = await import("react-dom");

    const transition = doc.startViewTransition(() => {
      flushSync(() => {
        setTheme(next);
      });
    });

    await transition.ready;

    const rect = buttonRef.current.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    const maxRadius = Math.hypot(
      Math.max(x, window.innerWidth - x),
      Math.max(y, window.innerHeight - y)
    );

    document.documentElement.animate(
      {
        clipPath: [
          `circle(0px at ${x}px ${y}px)`,
          `circle(${maxRadius}px at ${x}px ${y}px)`,
        ],
      },
      {
        duration: 480,
        easing: "cubic-bezier(0.22, 0.61, 0.36, 1)",
        pseudoElement: "::view-transition-new(root)",
      }
    );
  }, [resolvedTheme, setTheme]);

  // Render a stable placeholder until mounted, to avoid hydration mismatch.
  if (!mounted) {
    return (
      <button
        type="button"
        aria-label="Toggle theme"
        className={cn(
          "inline-flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground",
          className
        )}
      >
        <span className="block h-3.5 w-3.5 rounded-full bg-muted-foreground/20" />
      </button>
    );
  }

  const isDark = resolvedTheme === "dark";

  return (
    <button
      ref={buttonRef}
      type="button"
      onClick={toggle}
      aria-label={isDark ? "Switch to light" : "Switch to dark"}
      title={isDark ? "Switch to light" : "Switch to dark"}
      className={cn(
        "group inline-flex h-7 w-7 items-center justify-center rounded-full",
        "text-muted-foreground transition-all duration-150",
        "hover:text-foreground hover:bg-[var(--tint-hover)]",
        className
      )}
    >
      {isDark ? (
        <Sun className="h-[14px] w-[14px] transition-transform duration-200 group-hover:rotate-45" strokeWidth={1.75} />
      ) : (
        <Moon className="h-[14px] w-[14px] transition-transform duration-200 group-hover:-rotate-12" strokeWidth={1.75} />
      )}
    </button>
  );
}
