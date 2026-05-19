"use client";

// Global confirm dialog — mounted once in the (app) layout. Driven by the
// confirm-store: any caller anywhere in the client tree awaits `confirm({...})`
// and the resulting Promise resolves with true / false.

import { useEffect, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useConfirmStore } from "@/lib/stores/confirm-store";
import { cn } from "@/lib/utils";

export function ConfirmDialog() {
  const open = useConfirmStore((s) => s.open);
  const options = useConfirmStore((s) => s.options);
  const resolve = useConfirmStore((s) => s.resolve);

  const confirmBtnRef = useRef<HTMLButtonElement>(null);

  // Focus the confirm button on open so keyboard users can press Enter.
  useEffect(() => {
    if (open) {
      const t = setTimeout(() => confirmBtnRef.current?.focus(), 50);
      return () => clearTimeout(t);
    }
  }, [open]);

  // Escape cancels. Enter confirms. Trapped at the document level so the
  // dialog wins even if a background input has focus.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        resolve(false);
      } else if (e.key === "Enter") {
        // Only consume if focus is inside the dialog so we don't hijack
        // text inputs elsewhere.
        const t = e.target as HTMLElement | null;
        if (t?.closest("[data-confirm-dialog]")) {
          e.preventDefault();
          resolve(true);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, resolve]);

  return (
    <AnimatePresence>
      {open && options && (
        <motion.div
          key="backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
          onClick={() => resolve(false)}
          data-confirm-dialog
        >
          <motion.div
            key="card"
            initial={{ opacity: 0, y: 8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.98 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            onClick={(e) => e.stopPropagation()}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="confirm-title"
            aria-describedby={options.description ? "confirm-desc" : undefined}
            className="w-full max-w-[420px] rounded-3xl border border-border bg-card p-6 shadow-2xl"
          >
            <h2
              id="confirm-title"
              className="font-display text-[24px] leading-[1.1] tracking-tight text-foreground"
            >
              {options.title}
            </h2>

            {options.description && (
              <p
                id="confirm-desc"
                className="mt-3 text-[14px] text-muted-foreground"
                style={{ lineHeight: 1.55 }}
              >
                {options.description}
              </p>
            )}

            <div className="mt-6 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => resolve(false)}
                className="rounded-full px-4 py-2 text-[13px] text-muted-foreground transition-colors hover:bg-[var(--secondary)] hover:text-foreground"
              >
                {options.cancelLabel ?? "Cancel"}
              </button>
              <button
                ref={confirmBtnRef}
                type="button"
                onClick={() => resolve(true)}
                className={cn(
                  "rounded-full px-4 py-2 text-[13px] font-medium transition-transform hover:scale-[1.02] active:scale-95",
                  options.destructive
                    ? "bg-destructive text-white"
                    : "bg-foreground text-background",
                )}
              >
                {options.confirmLabel ?? "Confirm"}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
