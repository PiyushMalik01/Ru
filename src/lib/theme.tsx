"use client";

// Minimal theme provider — replaces next-themes because next-themes 0.4.6
// renders its FOUC-prevention script inside the React component tree, which
// React 19 / Next 16 flags as "Encountered a script tag while rendering React
// component." We solve FOUC by injecting a pre-hydration script directly in
// app/layout.tsx's <head> instead; this provider only manages React state.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";

export type Theme = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

interface ThemeContext {
  theme: Theme;
  resolvedTheme: ResolvedTheme;
  setTheme: (t: Theme) => void;
}

const Ctx = createContext<ThemeContext | undefined>(undefined);

const STORAGE_KEY = "theme";
const DEFAULT_THEME: Theme = "dark";

function systemTheme(): ResolvedTheme {
  if (typeof window === "undefined") return "dark";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyToDocument(resolved: ResolvedTheme) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.classList.remove("light", "dark");
  root.classList.add(resolved);
  root.style.colorScheme = resolved;
}

function readStoredTheme(): Theme {
  if (typeof window === "undefined") return DEFAULT_THEME;
  try {
    const v = window.localStorage.getItem(STORAGE_KEY) as Theme | null;
    if (v === "light" || v === "dark" || v === "system") return v;
  } catch {
    /* localStorage unavailable */
  }
  return DEFAULT_THEME;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // Initial state matches the pre-hydration script's logic so React's first
  // render doesn't fight what the inline script already wrote to <html>.
  const [theme, setThemeState] = useState<Theme>(() => readStoredTheme());
  const [resolved, setResolved] = useState<ResolvedTheme>(() =>
    theme === "system" ? systemTheme() : (theme as ResolvedTheme),
  );

  // Re-resolve whenever the user-chosen theme changes. For "system" mode,
  // also subscribe to OS-level preference changes.
  useEffect(() => {
    if (theme !== "system") {
      const r = theme as ResolvedTheme;
      setResolved(r);
      applyToDocument(r);
      return;
    }
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const update = () => {
      const r: ResolvedTheme = mq.matches ? "dark" : "light";
      setResolved(r);
      applyToDocument(r);
    };
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, [theme]);

  // Cross-tab sync — if another tab changes the theme, follow.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY) return;
      if (e.newValue === "light" || e.newValue === "dark" || e.newValue === "system") {
        setThemeState(e.newValue);
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* localStorage unavailable */
    }
  }, []);

  return (
    <Ctx.Provider value={{ theme, resolvedTheme: resolved, setTheme }}>
      {children}
    </Ctx.Provider>
  );
}

export function useTheme(): ThemeContext {
  const ctx = useContext(Ctx);
  if (!ctx) {
    // Safe fallback so consumers don't crash if rendered outside the provider
    // (e.g. during early SSR or in unit tests).
    return {
      theme: DEFAULT_THEME,
      resolvedTheme: "dark",
      setTheme: () => undefined,
    };
  }
  return ctx;
}

/**
 * Pre-hydration script body — used by app/layout.tsx to set the initial
 * theme class on <html> before React mounts, avoiding FOUC. Inlined as
 * static text so the bundler doesn't transform it; the function gets
 * stringified and IIFE'd in the document head.
 */
export const PRE_HYDRATION_SCRIPT = `(function(){try{var t=localStorage.getItem('theme')||'${DEFAULT_THEME}';var r=t==='system'?(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'):t;var d=document.documentElement;d.classList.remove('light','dark');d.classList.add(r);d.style.colorScheme=r;}catch(e){}})();`;
