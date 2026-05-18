"use client";

// Ru's companion presence state. Used by RuGhost (the floating character)
// and by any component that wants to make Ru react to a user action.

import { create } from "zustand";

export type RuExpression = "happy" | "wink" | "thinking" | "surprised" | "sleeping";

interface SaidLine {
  /** Stable id so re-renders don't restart the animation */
  id: number;
  text: string;
  /** Milliseconds the line should remain on screen before fading. */
  lifeMs: number;
}

interface RuCompanionState {
  expression: RuExpression;
  /** The current speech bubble line, if any. */
  said: SaidLine | null;
  /** True when Ru is hidden entirely (e.g. on /chat where she'd clutter). */
  hidden: boolean;

  setExpression: (e: RuExpression) => void;
  say: (text: string, lifeMs?: number) => void;
  clear: () => void;
  setHidden: (hidden: boolean) => void;
  /**
   * Convenience: trigger an expression for a short duration, then return to happy.
   * Used by components to make Ru "react" to a click/action.
   */
  react: (e: Exclude<RuExpression, "happy">, holdMs?: number) => void;
}

let nextLineId = 1;
let clearTimer: ReturnType<typeof setTimeout> | null = null;
let reactTimer: ReturnType<typeof setTimeout> | null = null;

export const useRuCompanion = create<RuCompanionState>((set) => ({
  expression: "happy",
  said: null,
  hidden: false,

  setExpression: (e) => set({ expression: e }),

  setHidden: (hidden) => set({ hidden }),

  say: (text, lifeMs = 4500) => {
    if (clearTimer) clearTimeout(clearTimer);
    const id = nextLineId++;
    set({ said: { id, text, lifeMs } });
    clearTimer = setTimeout(() => {
      // Only clear if this line is still the active one
      set((s) => (s.said?.id === id ? { said: null } : s));
    }, lifeMs);
  },

  clear: () => {
    if (clearTimer) clearTimeout(clearTimer);
    set({ said: null });
  },

  react: (e, holdMs = 1400) => {
    if (reactTimer) clearTimeout(reactTimer);
    set({ expression: e });
    reactTimer = setTimeout(() => set({ expression: "happy" }), holdMs);
  },
}));
