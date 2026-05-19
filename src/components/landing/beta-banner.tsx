"use client";

import { motion } from "framer-motion";

export function BetaBanner() {
  return (
    <div
      className="relative z-30 overflow-hidden"
      style={{ background: "#d9fb60" }}
    >
      <motion.div
        initial={{ y: -16, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-5 py-2 md:px-12"
      >
        <div className="flex items-center gap-2.5 overflow-hidden">
          <motion.span
            className="block h-2 w-2 shrink-0 rounded-full"
            style={{ background: "#1a5632" }}
            animate={{ opacity: [1, 0.25, 1], scale: [1, 1.18, 1] }}
            transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
          />
          <span
            className="truncate text-[11px] font-semibold uppercase tracking-[0.18em] sm:text-xs"
            style={{ color: "#1a5632" }}
          >
            currently in beta · invites going out monthly
          </span>
        </div>
        <a
          href="#waitlist"
          className="group flex shrink-0 items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.16em] sm:text-xs"
          style={{ color: "#1a5632" }}
        >
          <span className="hidden sm:inline">join the waitlist</span>
          <span className="sm:hidden">join</span>
          <motion.span
            aria-hidden="true"
            className="inline-block"
            animate={{ x: [0, 3, 0] }}
            transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
          >
            →
          </motion.span>
        </a>
      </motion.div>
    </div>
  );
}
