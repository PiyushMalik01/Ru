"use client";

import { cn } from "@/lib/utils";

const WORDS = [
  { text: "VOICE-FIRST", color: "#a78bfa" },
  { text: "AI-POWERED", color: "#fb923c" },
  { text: "TASKS", color: "#34d399" },
  { text: "ROUTINES", color: "#38bdf8" },
  { text: "REMINDERS", color: "#f472b6" },
  { text: "INSIGHTS", color: "#fbbf24" },
  { text: "YOUR DATA", color: "#a78bfa" },
  { text: "YOUR KEYS", color: "#34d399" },
  { text: "ZERO FRICTION", color: "#fb923c" },
  { text: "ONE CONVERSATION", color: "#38bdf8" },
  { text: "NO FORMS", color: "#f472b6" },
  { text: "NO APPS", color: "#fbbf24" },
];

interface MarqueeProps {
  className?: string;
}

export function Marquee({ className }: MarqueeProps) {
  const items = [...WORDS, ...WORDS, ...WORDS];

  return (
    <div
      className={cn("relative w-full overflow-hidden", className)}
      style={{
        maskImage:
          "linear-gradient(to right, transparent, black 10%, black 90%, transparent)",
        WebkitMaskImage:
          "linear-gradient(to right, transparent, black 10%, black 90%, transparent)",
      }}
    >
      <style>{`
        @keyframes marquee-scroll {
          from { transform: translateX(0); }
          to { transform: translateX(-33.333%); }
        }
      `}</style>
      <div
        className="flex whitespace-nowrap"
        style={{
          animation: "marquee-scroll 30s linear infinite",
          width: "max-content",
        }}
      >
        {items.map((word, i) => (
          <span
            key={i}
            className="mx-4 font-mono text-[11px] font-bold tracking-[0.2em]"
            style={{ color: word.color }}
          >
            {word.text}
            <span className="ml-4 text-white/10">✦</span>
          </span>
        ))}
      </div>
    </div>
  );
}
