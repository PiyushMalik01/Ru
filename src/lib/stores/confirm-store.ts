"use client";

// Promise-based global confirm dialog. Replaces window.confirm() so we can
// render a real UI that matches the platform aesthetic, supports proper
// keyboard handling (Escape / Enter), and styles destructive actions
// distinctly. Usage:
//
//   const ok = await confirm({
//     title: "Delete chat?",
//     description: "All messages in this thread will be gone.",
//     confirmLabel: "Delete",
//     destructive: true,
//   });
//   if (ok) { ... }

import { create } from "zustand";

export interface ConfirmOptions {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
}

interface ConfirmState {
  open: boolean;
  options: ConfirmOptions | null;
  resolver: ((value: boolean) => void) | null;
  open_: (opts: ConfirmOptions) => Promise<boolean>;
  resolve: (value: boolean) => void;
}

export const useConfirmStore = create<ConfirmState>((set, get) => ({
  open: false,
  options: null,
  resolver: null,
  open_: (opts) => {
    // If a previous dialog was somehow left open, resolve it cancelled so
    // we never strand a caller waiting on a Promise.
    const existing = get().resolver;
    if (existing) existing(false);

    return new Promise<boolean>((resolve) => {
      set({ open: true, options: opts, resolver: resolve });
    });
  },
  resolve: (value) => {
    const r = get().resolver;
    if (r) r(value);
    set({ open: false, options: null, resolver: null });
  },
}));

/** Public API — call from anywhere in the client tree. */
export function confirm(opts: ConfirmOptions): Promise<boolean> {
  return useConfirmStore.getState().open_(opts);
}
