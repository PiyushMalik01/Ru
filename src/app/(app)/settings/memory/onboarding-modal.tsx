"use client";

import { useState, useTransition } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { markOnboardedAction } from "./actions";

export function OnboardingModal() {
  const [open, setOpen] = useState(true);
  const [pending, startTransition] = useTransition();

  function dismiss() {
    startTransition(async () => {
      await markOnboardedAction();
      setOpen(false);
    });
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-6"
          style={{ background: "rgba(13,31,21,0.45)" }}
        >
          <motion.div
            initial={{ y: 16, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 16, opacity: 0 }}
            transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
            className="w-full max-w-md rounded-[28px] border p-7"
            style={{ background: "#fff", borderColor: "#e8e4de" }}
          >
            <h2
              style={{
                fontFamily: "var(--font-serif)",
                fontSize: "30px",
                lineHeight: 1.1,
                color: "#0d1f15",
                letterSpacing: "-0.015em",
              }}
            >
              Here&apos;s what I&apos;ve picked <em style={{ color: "#1a5632", fontStyle: "italic" }}>up</em> about you so far.
            </h2>
            <p className="mt-3 text-[15px] leading-relaxed" style={{ color: "#4a5547" }}>
              I learn from our conversations and update this whenever you tell me something new.
              Everything&apos;s editable — fix anything that&apos;s off and I&apos;ll learn from your correction.
            </p>
            <button
              disabled={pending}
              onClick={dismiss}
              className="mt-6 rounded-full border-2 px-5 py-2.5 text-[15px]"
              style={{ background: "#d9fb60", borderColor: "#1a5632", color: "#1a5632", fontFamily: "var(--font-serif)" }}
            >
              {pending ? "…" : "Got it."}
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
