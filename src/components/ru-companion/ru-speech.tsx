"use client";

// Ru's speech "cloud" — soft, irregular, with little puff dots around it so
// the silhouette reads as a thought-cloud rather than a generic chat bubble.
// Text is Fraunces italic for warmth.

import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

interface Props {
  text: string | null;
  /** Tail direction toward Ru's body. */
  tail?: "left" | "right";
  className?: string;
}

const CLOUD_BG_LIGHT = "#fef6e7";
const CLOUD_BG_DARK = "#3d3d3f";
const TEXT_LIGHT = "#1a1a18";
const TEXT_DARK = "#f5f5f7";

export function RuSpeech({ text, tail = "right", className }: Props) {
  return (
    <AnimatePresence>
      {text && (
        <motion.div
          key={text}
          initial={{ opacity: 0, y: 6, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -4, scale: 0.94 }}
          transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
          className={cn("pointer-events-none relative", className)}
        >
          <style>{`
            .ru-cloud { background: ${CLOUD_BG_LIGHT}; color: ${TEXT_LIGHT}; }
            .dark .ru-cloud { background: ${CLOUD_BG_DARK}; color: ${TEXT_DARK}; }
            .ru-cloud-puff { background: ${CLOUD_BG_LIGHT}; }
            .dark .ru-cloud-puff { background: ${CLOUD_BG_DARK}; }
          `}</style>

          {/* Main cloud body — irregular border-radius matches the body's
              organic DNA so they read as the same character. */}
          <div
            className="ru-cloud relative z-10 px-4 py-2.5"
            style={{
              borderRadius: "32px 26px 30px 28px",
              boxShadow:
                "0 6px 18px -4px rgba(0,0,0,0.14), inset 0 -2px 6px rgba(0,0,0,0.04)",
            }}
          >
            <span
              className="block max-w-[200px] whitespace-pre-wrap text-[14px] italic leading-snug"
              style={{ fontFamily: "var(--font-fraunces), Georgia, serif" }}
            >
              {text}
            </span>
          </div>

          {/* Puff circles bulging from the silhouette */}
          <Puff style={{ top: -6, left: 18, width: 14, height: 14 }} />
          <Puff style={{ top: -10, left: 38, width: 20, height: 20 }} />
          <Puff style={{ top: -4, right: 28, width: 12, height: 12 }} />
          <Puff style={{ bottom: -3, left: 30, width: 10, height: 10 }} />

          {/* Tail dots toward Ru */}
          {tail === "right" ? (
            <>
              <Puff style={{ right: -10, top: "62%", width: 10, height: 10 }} />
              <Puff style={{ right: -18, top: "78%", width: 6, height: 6 }} />
            </>
          ) : (
            <>
              <Puff style={{ left: -10, top: "62%", width: 10, height: 10 }} />
              <Puff style={{ left: -18, top: "78%", width: 6, height: 6 }} />
            </>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Puff({ style }: { style: React.CSSProperties }) {
  return (
    <span
      aria-hidden
      className="ru-cloud-puff absolute z-0 rounded-full"
      style={{
        ...style,
        boxShadow: "0 2px 6px -2px rgba(0,0,0,0.1)",
      }}
    />
  );
}
