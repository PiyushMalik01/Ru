"use client";

import { ScrollReveal } from "./scroll-reveal";
import { WaveDivider } from "./wave-divider";
import { cn } from "@/lib/utils";

function WaveformVisual() {
  const bars = [
    { h: 28, c: "#a78bfa" }, { h: 48, c: "#c084fc" }, { h: 64, c: "#f472b6" },
    { h: 42, c: "#fb923c" }, { h: 70, c: "#fbbf24" }, { h: 56, c: "#34d399" },
    { h: 36, c: "#38bdf8" }, { h: 62, c: "#818cf8" }, { h: 44, c: "#f472b6" },
    { h: 74, c: "#fb923c" }, { h: 38, c: "#34d399" }, { h: 58, c: "#38bdf8" },
  ];
  return (
    <>
      <style>{`
        ${bars.map((b, i) => `
          @keyframes feat-w-${i} {
            0%, 100% { height: ${b.h * 0.4}px; }
            50% { height: ${b.h}px; }
          }
        `).join("")}
      `}</style>
      <div className="flex h-full w-full flex-col items-center justify-center gap-5 p-8">
        <div className="flex items-end justify-center gap-1.5" style={{ height: "80px" }}>
          {bars.map((b, i) => (
            <div
              key={i}
              className="rounded-full"
              style={{
                width: "5px",
                backgroundColor: b.c,
                animation: `feat-w-${i} ${1.2 + (i % 4) * 0.22}s ease-in-out ${i * 0.1}s infinite`,
                height: `${b.h * 0.4}px`,
              }}
            />
          ))}
        </div>
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 animate-pulse rounded-full bg-green-400" />
          <span className="font-mono text-xs font-medium text-green-400">Deepgram Nova-3</span>
        </div>
      </div>
    </>
  );
}

function SortingVisual() {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-4 p-8">
      <div className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3">
        <p className="text-center text-xs text-white/50">
          &ldquo;gym, groceries, call mom&rdquo;
        </p>
      </div>
      <div className="flex flex-col items-center">
        <svg width="2" height="24" viewBox="0 0 2 24"><line x1="1" y1="0" x2="1" y2="24" stroke="rgba(255,255,255,0.1)" strokeWidth="2" strokeDasharray="4 4" /></svg>
      </div>
      <div className="flex w-full flex-col gap-2">
        {[
          { label: "Activity logged", color: "#22c55e", bg: "rgba(34,197,94,0.1)", border: "rgba(34,197,94,0.25)" },
          { label: "Task created", color: "#f59e0b", bg: "rgba(245,158,11,0.1)", border: "rgba(245,158,11,0.25)" },
          { label: "Reminder set", color: "#60a5fa", bg: "rgba(96,165,250,0.1)", border: "rgba(96,165,250,0.25)" },
        ].map((item) => (
          <div
            key={item.label}
            className="flex items-center gap-2 rounded-lg px-3 py-2.5 font-mono text-xs font-semibold"
            style={{ color: item.color, background: item.bg, border: `1px solid ${item.border}` }}
          >
            <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: item.color }} />
            {item.label}
          </div>
        ))}
      </div>
    </div>
  );
}

function PatternsVisual() {
  const days = [
    { label: "M", filled: true }, { label: "T", filled: false },
    { label: "W", filled: true }, { label: "T", filled: false },
    { label: "F", filled: true }, { label: "S", filled: false },
    { label: "S", filled: true },
  ];
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-5 p-8">
      <div className="flex gap-2.5">
        {days.map((d, i) => (
          <div key={i} className="flex flex-col items-center gap-1.5">
            <div
              className={cn(
                "flex h-10 w-10 items-center justify-center rounded-full text-xs font-bold transition-all",
                d.filled
                  ? "bg-gradient-to-br from-green-400 to-emerald-500 text-white shadow-md shadow-green-500/20"
                  : "border border-white/10 bg-white/[0.04] text-white/15"
              )}
            >
              {d.filled ? "✓" : ""}
            </div>
            <span className="font-mono text-[10px] text-white/30">{d.label}</span>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2 rounded-full bg-gradient-to-r from-green-500/10 to-emerald-500/10 border border-green-500/20 px-4 py-2">
        <div className="h-2 w-2 rounded-full bg-green-400 animate-pulse" />
        <span className="font-mono text-xs font-semibold text-green-400">Gym routine auto-detected</span>
      </div>
    </div>
  );
}

function InsightsVisual() {
  const stats = [
    { value: "4", label: "done", color: "#22c55e" },
    { value: "2", label: "pending", color: "#f59e0b" },
    { value: "12", label: "day streak", color: "#a78bfa" },
    { value: "↑", label: "productivity", color: "#f472b6" },
  ];
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-4 p-8">
      <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-white/20">Weekly Brief</span>
      <div className="grid w-full grid-cols-2 gap-2.5">
        {stats.map((s) => (
          <div key={s.label} className="flex flex-col items-center gap-1 rounded-xl border border-white/[0.06] bg-white/[0.03] py-4">
            <span className="font-mono text-2xl font-extrabold" style={{ color: s.color }}>{s.value}</span>
            <span className="text-[10px] font-medium uppercase tracking-wider text-white/30">{s.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

const FEATURES = [
  {
    tag: "Voice",
    tagColor: "#a78bfa",
    title: "Talk like you think",
    subtitle: "Voice-first means no forms, no fields, no friction. Speak naturally and Ru understands context, intent, and nuance. Powered by Deepgram Nova-3.",
    visual: <WaveformVisual />,
    gradient: "from-purple-500/10 to-indigo-500/10",
  },
  {
    tag: "Intelligence",
    tagColor: "#fb923c",
    title: "One message, everything sorted",
    subtitle: "Say one thing that contains a task, a reminder, and a habit log. Ru figures out which is which and organizes them automatically — in a single AI call.",
    visual: <SortingVisual />,
    gradient: "from-orange-500/10 to-amber-500/10",
  },
  {
    tag: "Detection",
    tagColor: "#22c55e",
    title: "Patterns you can't see",
    subtitle: "Ru notices you go to the gym every Monday, read every Thursday, and skip cooking on Fridays. It surfaces these patterns and helps you build on them.",
    visual: <PatternsVisual />,
    gradient: "from-green-500/10 to-emerald-500/10",
  },
  {
    tag: "Insights",
    tagColor: "#f472b6",
    title: "Your day, understood",
    subtitle: "Morning brief tells you what's ahead. Evening summary shows what you accomplished. Weekly insights reveal trends you'd never spot on your own.",
    visual: <InsightsVisual />,
    gradient: "from-pink-500/10 to-rose-500/10",
  },
];

export function Features() {
  return (
    <>
      <WaveDivider topColor="#0a0a0f" bottomColor="#faf7f2" />

      <section className="relative overflow-hidden bg-[#faf7f2] px-4 pb-12 pt-20">
        {/* Background blobs */}
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background: `
              radial-gradient(circle 400px at 80% 30%, rgba(167,139,250,0.06) 0%, transparent 60%),
              radial-gradient(circle 300px at 20% 70%, rgba(52,211,153,0.05) 0%, transparent 60%)
            `,
          }}
        />

        <div className="relative mx-auto max-w-5xl">
          <ScrollReveal>
            <div className="flex items-center gap-3 mb-4">
              <div className="h-px flex-1 max-w-[60px] bg-gradient-to-r from-purple-500 to-transparent" />
              <p className="font-mono text-[11px] font-bold uppercase tracking-[0.25em] text-purple-600">
                Features
              </p>
            </div>
          </ScrollReveal>

          {FEATURES.map((feat, i) => {
            const isEven = i % 2 === 1;
            return (
              <div
                key={i}
                className={cn(
                  "flex flex-col items-center gap-10 py-14 md:py-20",
                  "md:flex-row md:gap-16",
                  isEven && "md:flex-row-reverse"
                )}
              >
                <ScrollReveal direction={isEven ? "right" : "left"} delay={0.05} className="flex-1">
                  <div
                    className="mb-3 inline-flex items-center gap-2 rounded-full px-3 py-1"
                    style={{ backgroundColor: `${feat.tagColor}15`, border: `1px solid ${feat.tagColor}30` }}
                  >
                    <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: feat.tagColor }} />
                    <span className="font-mono text-[11px] font-semibold uppercase tracking-wider" style={{ color: feat.tagColor }}>
                      {feat.tag}
                    </span>
                  </div>
                  <h3 className="mt-2 text-2xl font-bold tracking-tight text-[#1a1a1a] md:text-4xl">
                    {feat.title}
                  </h3>
                  <p className="mt-4 max-w-md text-base leading-relaxed text-[#6b6560]">
                    {feat.subtitle}
                  </p>
                </ScrollReveal>

                <ScrollReveal direction={isEven ? "left" : "right"} delay={0.1} className="w-full md:w-[320px] lg:w-[360px]">
                  <div className={cn(
                    "overflow-hidden rounded-3xl border border-[#1a1a1a]/5 bg-[#111118] shadow-xl",
                  )}
                    style={{ minHeight: "260px" }}
                  >
                    {feat.visual}
                  </div>
                </ScrollReveal>
              </div>
            );
          })}
        </div>
      </section>
    </>
  );
}
