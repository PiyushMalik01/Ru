"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { ScrollReveal } from "./scroll-reveal";
import { WobblyUnderline, Squiggle, RuMark } from "./marginalia";

// ─── Animated visuals ─────────────────────────────────────────────────────

function VoiceVisual() {
  const [seconds, setSeconds] = useState(1);
  useEffect(() => {
    const id = setInterval(() => setSeconds((s) => (s >= 9 ? 1 : s + 1)), 1000);
    return () => clearInterval(id);
  }, []);
  const bars = Array.from({ length: 18 }, (_, i) => {
    // make a curve so middle bars are tallest
    const t = (i - 8.5) / 8.5;
    const base = Math.max(8, 44 - Math.abs(t) * 30);
    return base;
  });
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-end gap-[4px]" style={{ height: "56px" }}>
        {bars.map((h, i) => {
          const low = Math.max(6, h * 0.25);
          const high = h;
          return (
            <motion.div
              key={i}
              className="w-[5px] rounded-full"
              style={{ background: "#1a5632" }}
              animate={{ height: [low, high, low], opacity: [0.35, 1, 0.35] }}
              transition={{
                duration: 1.1,
                repeat: Infinity,
                ease: "easeInOut",
                delay: i * 0.05,
              }}
            />
          );
        })}
      </div>
      <div
        className="flex items-center gap-2 rounded-full px-3 py-1"
        style={{ background: "#1a5632", color: "#d9fb60" }}
      >
        <motion.span
          className="block h-1.5 w-1.5 rounded-full"
          style={{ background: "#d9fb60" }}
          animate={{ opacity: [1, 0.3, 1] }}
          transition={{ duration: 1, repeat: Infinity, ease: "easeInOut" }}
        />
        <span className="text-[11px] font-bold tabular-nums tracking-wider">
          0:0{seconds}
        </span>
      </div>
    </div>
  );
}

function SmartVisual() {
  const [phase, setPhase] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setPhase((p) => (p + 1) % 5), 900);
    return () => clearInterval(id);
  }, []);
  const chips = [
    { label: "Activity · Gym", bg: "#1a5632", fg: "#d9fb60" },
    { label: "Task · Groceries", bg: "#d9fb60", fg: "#1a5632" },
    { label: "Reminder · Dentist Thu", bg: "#1fd7df", fg: "#0a3438" },
  ];
  return (
    <div className="flex flex-col gap-2.5">
      <div
        className="rounded-lg px-3 py-2 text-[12px] italic"
        style={{
          color: "#1a5632",
          background: "#f5f7ef",
          border: "1px solid #1a563220",
        }}
      >
        “got back from gym, need groceries, dentist Thurs”
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {chips.map((c, i) => {
          const visible = phase > i && phase < 4;
          return (
            <motion.div
              key={c.label}
              className="rounded-full px-2.5 py-1 text-[11px] font-semibold"
              style={{ background: c.bg, color: c.fg }}
              animate={{
                opacity: visible ? 1 : 0,
                y: visible ? 0 : 6,
                scale: visible ? 1 : 0.95,
              }}
              transition={{ duration: 0.35, ease: "easeOut" }}
            >
              {c.label}
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

function PatternsVisual() {
  const [scanCol, setScanCol] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setScanCol((c) => (c + 1) % 7), 500);
    return () => clearInterval(id);
  }, []);
  // 7 cols (M-S) x 4 rows (weeks). Mark Mon (0) and Thu (3) always filled.
  const isFilled = (col: number) => col === 0 || col === 3;
  const days = ["M", "T", "W", "T", "F", "S", "S"];
  return (
    <div>
      <div className="mb-1 flex gap-[5px]">
        {days.map((d, i) => (
          <span
            key={i}
            className="w-[18px] text-center text-[9px] font-semibold"
            style={{ color: scanCol === i ? "#d9fb60" : "#5a6258" }}
          >
            {d}
          </span>
        ))}
      </div>
      <div className="flex flex-col gap-[5px]">
        {Array.from({ length: 3 }).map((_, row) => (
          <div key={row} className="flex gap-[5px]">
            {Array.from({ length: 7 }).map((_, col) => {
              const filled = isFilled(col);
              const scanning = scanCol === col;
              const bg = scanning
                ? "#d9fb60"
                : filled
                  ? "#1fd7df"
                  : "#1f3527";
              return (
                <motion.div
                  key={col}
                  className="h-[18px] w-[18px] rounded-[5px]"
                  style={{ background: bg }}
                  animate={{ scale: scanning ? 1.08 : 1 }}
                  transition={{ duration: 0.25 }}
                />
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

function TrackersVisual() {
  // Mock tracker tile — column chips at top, a hero number that ticks up,
  // and a sparkline of recent entries. Mirrors the real /trackers/[id] page.
  const [entryIdx, setEntryIdx] = useState(0);
  const ENTRIES = [5.2, 6.0, 4.8, 5.5, 6.3, 7.1, 6.8];
  useEffect(() => {
    const id = setInterval(() => setEntryIdx((i) => (i + 1) % ENTRIES.length), 1100);
    return () => clearInterval(id);
  }, []);

  const value = ENTRIES[entryIdx];
  // Build a polyline through the entries up to and including the current one.
  const visible = ENTRIES.slice(0, entryIdx + 1);
  const maxV = Math.max(...ENTRIES);
  const minV = Math.min(...ENTRIES);
  const points = visible
    .map((v, i) => {
      const x = (i / (ENTRIES.length - 1)) * 120;
      const y = 30 - ((v - minV) / (maxV - minV || 1)) * 24;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  const COLUMNS = [
    { label: "Distance · km", bg: "#d9fb60", fg: "#1a5632" },
    { label: "Time · min",    bg: "#1fd7df", fg: "#0a3438" },
    { label: "Pace",          bg: "rgba(255,255,255,0.6)", fg: "#1a5632" },
  ];

  return (
    <div
      className="rounded-xl p-3"
      style={{ background: "#f5f7ef", border: "1px solid #1a563225" }}
    >
      <div className="mb-2 flex items-center justify-between">
        <span
          className="text-[11px] font-bold uppercase tracking-wider"
          style={{ color: "#1a5632" }}
        >
          Running
        </span>
        <motion.span
          className="text-[10px] font-semibold tabular-nums"
          style={{ color: "#1a5632" }}
          animate={{ opacity: [1, 0.4, 1] }}
          transition={{ duration: 1.1, repeat: Infinity, ease: "easeInOut" }}
        >
          {(entryIdx + 1).toString().padStart(2, "0")} entries
        </motion.span>
      </div>

      {/* Column chips — the tracker's user-defined schema */}
      <div className="mb-2.5 flex flex-wrap gap-1">
        {COLUMNS.map((c) => (
          <span
            key={c.label}
            className="rounded-full px-2 py-[2px] text-[9px] font-semibold uppercase tracking-wider"
            style={{ background: c.bg, color: c.fg }}
          >
            {c.label}
          </span>
        ))}
      </div>

      {/* Hero number + sparkline */}
      <div className="flex items-end gap-3">
        <div>
          <motion.div
            key={entryIdx}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
            className="text-2xl font-extrabold leading-none tabular-nums"
            style={{ color: "#1a5632", fontFamily: "var(--font-serif)" }}
          >
            {value.toFixed(1)}
            <span className="ml-0.5 text-[11px] opacity-65">km</span>
          </motion.div>
          <div
            className="mt-1 text-[9px] font-semibold uppercase tracking-wider"
            style={{ color: "rgba(26,86,50,0.6)" }}
          >
            last entry
          </div>
        </div>
        <svg
          width="120"
          height="32"
          viewBox="0 0 120 32"
          aria-hidden="true"
          className="ml-auto"
        >
          <polyline
            points={points}
            fill="none"
            stroke="#1a5632"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {visible.length > 0 && (
            <circle
              cx={((visible.length - 1) / (ENTRIES.length - 1)) * 120}
              cy={30 - ((value - minV) / (maxV - minV || 1)) * 24}
              r="2.5"
              fill="#1a5632"
            />
          )}
        </svg>
      </div>
    </div>
  );
}

function InsightsVisual() {
  // Two-cycle loop: sparkline fills LtoR, ring fills 0→75% over 2s, both reset.
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 2000);
    return () => clearInterval(id);
  }, []);
  const sparkPoints = "0,16 10,12 20,14 30,8 40,10 50,5 60,7 70,3";
  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <div
          className="text-3xl font-extrabold leading-none"
          style={{ color: "#2a2270", fontFamily: "var(--font-serif)" }}
        >
          12 days
        </div>
        <div
          className="mt-1 text-[10px] font-semibold uppercase tracking-wider"
          style={{ color: "rgba(42,34,112,0.6)" }}
        >
          streak
        </div>
        <svg
          key={`spark-${tick}`}
          width="76"
          height="22"
          viewBox="0 0 76 22"
          className="mt-1"
          aria-hidden="true"
        >
          <polyline
            points={sparkPoints}
            fill="none"
            stroke="#c8c3ff"
            strokeWidth="1.5"
            opacity="0.5"
          />
          <motion.polyline
            points={sparkPoints}
            fill="none"
            stroke="#2a2270"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 2, ease: "easeInOut" }}
          />
        </svg>
      </div>
      <div className="relative" style={{ width: 78, height: 78 }}>
        <svg width="78" height="78" viewBox="0 0 78 78" aria-hidden="true">
          <circle
            cx="39"
            cy="39"
            r="32"
            fill="none"
            stroke="rgba(255,255,255,0.45)"
            strokeWidth="8"
          />
          <motion.circle
            key={`ring-${tick}`}
            cx="39"
            cy="39"
            r="32"
            fill="none"
            stroke="#1a5632"
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={2 * Math.PI * 32}
            transform="rotate(-90 39 39)"
            initial={{ strokeDashoffset: 2 * Math.PI * 32 }}
            animate={{
              strokeDashoffset: 2 * Math.PI * 32 * (1 - 0.75),
            }}
            transition={{ duration: 2, ease: "easeInOut" }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span
            className="text-sm font-extrabold"
            style={{ color: "#2a2270" }}
          >
            75%
          </span>
        </div>
      </div>
    </div>
  );
}

function WorkspacesVisual() {
  // Sequential draw of 3 horizontal bars. Total cycle: 3*0.9 draw + 1.5 hold = 4.2s
  const cycle = 4.2;
  const phases = [
    { label: "Phase 1 · Design polish" },
    { label: "Phase 2 · Private beta" },
    { label: "Phase 3 · GA on Jun 15" },
  ];
  return (
    <div
      className="rounded-xl p-3"
      style={{ background: "#f5f7ef", border: "1px solid #1a563225" }}
    >
      <div className="mb-2 flex items-center justify-between">
        <span
          className="text-[11px] font-bold uppercase tracking-wider"
          style={{ color: "#1a5632" }}
        >
          Beta launch roadmap
        </span>
        <motion.span
          className="text-[10px] font-semibold"
          style={{ color: "#1a5632" }}
          animate={{ opacity: [1, 0.4, 1] }}
          transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut" }}
        >
          building…
        </motion.span>
      </div>
      <div className="flex flex-col gap-2">
        {phases.map((p, i) => (
          <div key={p.label}>
            <div
              className="mb-1 text-[10px] font-semibold"
              style={{ color: "#1a5632" }}
            >
              {p.label}
            </div>
            <div
              className="relative h-2 w-full overflow-hidden rounded-full"
              style={{ background: "#e3e7d8" }}
            >
              <motion.div
                className="absolute left-0 top-0 h-full rounded-full"
                style={{ background: "#d9fb60" }}
                animate={{ width: ["0%", "0%", "100%", "100%", "0%"] }}
                transition={{
                  duration: cycle,
                  times: [
                    i * 0.22,
                    i * 0.22 + 0.01,
                    i * 0.22 + 0.21,
                    0.78,
                    1,
                  ],
                  repeat: Infinity,
                  ease: "easeInOut",
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function RoutinesVisual() {
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setIdx((v) => (v + 1) % 3), 2000);
    return () => clearInterval(id);
  }, []);
  const segments = [
    { label: "Silent", color: "#0a3438" },
    { label: "Gentle", color: "#1a5632" },
    { label: "Active", color: "#2a2270" },
  ];
  return (
    <div>
      <div
        className="relative flex h-12 w-full overflow-hidden rounded-xl border"
        style={{ borderColor: "rgba(10,52,56,0.25)" }}
      >
        {segments.map((s, i) => {
          const active = i === idx;
          return (
            <motion.div
              key={s.label}
              className="relative flex flex-1 items-center justify-center text-[11px] font-bold uppercase tracking-wider"
              style={{
                borderRight: i < 2 ? "1px solid rgba(10,52,56,0.2)" : "none",
              }}
              animate={{
                background: active ? s.color : "rgba(255,255,255,0.35)",
                color: active ? "#ffffff" : "#0a3438",
              }}
              transition={{ duration: 0.35, ease: "easeOut" }}
            >
              {s.label}
            </motion.div>
          );
        })}
        <motion.div
          className="pointer-events-none absolute bottom-1 h-1 rounded-full"
          style={{ background: "#ffffff", width: "28%" }}
          animate={{ left: `${idx * 33.33 + 2.5}%` }}
          transition={{ type: "spring", stiffness: 180, damping: 20 }}
        />
      </div>
      <div
        className="mt-2 flex items-center gap-1.5 text-[10px] font-semibold"
        style={{ color: "#0a3438" }}
      >
        <motion.span
          className="block h-1.5 w-1.5 rounded-full"
          style={{ background: "#ffffff", border: "1px solid #0a3438" }}
          animate={{ scale: [1, 1.3, 1] }}
          transition={{ duration: 0.8, repeat: Infinity, ease: "easeInOut" }}
        />
        you are here · {segments[idx].label}
      </div>
    </div>
  );
}

// ─── Feature catalog ──────────────────────────────────────────────────────

type FeatureCard = {
  tag: string;
  accent: string;
  title: string;
  desc: React.ReactNode;
  visual: React.ReactNode;
};

const FEATURES: FeatureCard[] = [
  {
    tag: "Voice",
    accent: "#1a5632",
    title: "Talk like you think",
    desc: (
      <>
        No typing, no tapping, no forms. Just speak naturally — <RuMark /> picks up
        context, intent, and nuance from your voice. Powered by Deepgram Nova-3.
      </>
    ),
    visual: <VoiceVisual />,
  },
  {
    tag: "Smart",
    accent: "#1a5632",
    title: "One sentence does it all",
    desc: (
      <>
        Mention a task, a habit, and an appointment in the same breath. <RuMark /> separates them,
        categorizes them, and files them — all in a single AI call.
      </>
    ),
    visual: <SmartVisual />,
  },
  {
    tag: "Patterns",
    accent: "#1fd7df",
    title: "Habits you didn’t know you had",
    desc: (
      <>
        <RuMark /> spots that you run every Monday, read every Thursday, and skip
        cooking on Fridays. It surfaces these patterns so you can lean into them.
      </>
    ),
    visual: <PatternsVisual />,
  },
  {
    tag: "Insights",
    accent: "#2a2270",
    title: "Your day at a glance",
    desc: (
      <>
        Morning briefs, evening summaries, weekly trends. <RuMark /> turns raw
        activity into clear insights — without you lifting a finger.
      </>
    ),
    visual: <InsightsVisual />,
  },
  {
    tag: "Workspaces",
    accent: "#1a5632",
    title: "Plans, end-to-end",
    desc: (
      <>
        No more generate-in-one-tool, paste-into-another, manage-in-a-third. Ask
        for a roadmap, a study week, a launch plan — <RuMark /> opens a named
        workspace and assembles every task, phase and date in place.
      </>
    ),
    visual: <WorkspacesVisual />,
  },
  {
    tag: "Routines",
    accent: "#1a5632",
    title: "Nudges, your way",
    desc: (
      <>
        Set the cadence (daily, weekdays, custom) and the volume (silent, gentle,
        active). <RuMark /> remembers — and gets out of the way when you ask it to.
      </>
    ),
    visual: <RoutinesVisual />,
  },
  {
    tag: "Trackers",
    accent: "#2a2270",
    title: "Track what matters to you",
    desc: (
      <>
        Tell <RuMark /> what to follow — runs, workouts, sleep, mood. Custom
        columns, charts, streaks. Want a new field next week? Just say so;
        nothing&rsquo;s locked.
      </>
    ),
    visual: <TrackersVisual />,
  },
];

export function Features() {
  return (
    <section
      id="features"
      className="relative mx-3 overflow-hidden rounded-[32px] px-5 py-20 md:mx-6 md:rounded-[40px] md:px-12 md:py-32"
      style={{ background: "#1a5632" }}
    >
      {/* Marginalia */}
      <Squiggle
        className="pointer-events-none absolute bottom-12 left-[8%] hidden md:block"
        width={180}
        height={20}
        opacity={0.6}
        color="#d9fb60"
      />

      <div className="mx-auto max-w-5xl">
        <ScrollReveal>
          <div className="mb-4 flex items-center gap-3">
            <div className="h-px w-10" style={{ background: "#d9fb60" }} />
            <span
              className="text-xs font-semibold uppercase tracking-[0.2em]"
              style={{ color: "#d9fb60" }}
            >
              Features
            </span>
          </div>
          <h2
            style={{
              fontFamily: "var(--font-serif)",
              color: "#f5f5f0",
              fontSize: "clamp(30px, 5vw, 56px)",
              lineHeight: 1.15,
            }}
          >
            Everything you need.
            <br />
            <span
              style={{
                color: "#a9b2a3",
                position: "relative",
                display: "inline-block",
              }}
            >
              Nothing you don’t.
              <WobblyUnderline color="#d9fb60" opacity={0.7} thickness={3} />
            </span>
          </h2>
        </ScrollReveal>

        <div className="mt-12 grid auto-rows-fr grid-cols-1 gap-5 md:mt-16 md:grid-cols-6 md:gap-6">
          {FEATURES.map((feat, i) => {
            // Bento layout per card
            const layouts: Record<
              string,
              {
                span: string;
                bg: string;
                radius: string;
                headingColor: string;
                descColor: string;
                tagColor: string;
                dotColor: string;
                border?: string;
                rotate?: string;
                minH: string;
              }
            > = {
              Voice: {
                span: "md:col-span-3 md:row-span-1",
                bg: "#d9fb60",
                radius: "rounded-3xl",
                headingColor: "#1a5632",
                descColor: "#1a5632",
                tagColor: "#1a5632",
                dotColor: "#1a5632",
                minH: "300px",
              },
              Smart: {
                span: "md:col-span-3 md:row-span-1",
                bg: "#ffffff",
                radius: "rounded-2xl",
                headingColor: "#0d1f15",
                descColor: "#5a6258",
                tagColor: "#1a5632",
                dotColor: "#1a5632",
                border: "2px solid #1a5632",
                rotate: "rotate(-1deg)",
                minH: "300px",
              },
              Patterns: {
                span: "md:col-span-2 md:row-span-1",
                bg: "#0d1f15",
                radius: "rounded-[32px]",
                headingColor: "#d9fb60",
                descColor: "#a9b2a3",
                tagColor: "#1fd7df",
                dotColor: "#1fd7df",
                minH: "300px",
              },
              Insights: {
                span: "md:col-span-4 md:row-span-1",
                bg: "#c8c3ff",
                radius: "rounded-2xl",
                headingColor: "#2a2270",
                descColor: "rgba(42,34,112,0.7)",
                tagColor: "#2a2270",
                dotColor: "#2a2270",
                minH: "300px",
              },
              Workspaces: {
                span: "md:col-span-3 md:row-span-1",
                bg: "#ffffff",
                radius: "rounded-2xl",
                headingColor: "#0d1f15",
                descColor: "#5a6258",
                tagColor: "#1a5632",
                dotColor: "#1a5632",
                minH: "300px",
              },
              Routines: {
                span: "md:col-span-3 md:row-span-1",
                bg: "#1fd7df",
                radius: "rounded-3xl",
                headingColor: "#0a3438",
                descColor: "#0a3438",
                tagColor: "#0a3438",
                dotColor: "#0a3438",
                minH: "300px",
              },
            };
            const L = layouts[feat.tag];

            return (
              <ScrollReveal
                key={feat.tag}
                delay={i * 0.08}
                className={`col-span-1 h-full ${L.span}`}
              >
                <motion.div
                  whileHover={{ y: -8, rotateX: 4, rotateY: -3, scale: 1.02 }}
                  transition={{ duration: 0.3 }}
                  className={`relative flex h-full flex-col justify-between overflow-visible ${L.radius} p-6 md:p-8`}
                  style={{
                    background: L.bg,
                    border: L.border ?? "1px solid transparent",
                    minHeight: L.minH,
                    boxShadow: "0 10px 30px rgba(0,0,0,0.2)",
                    transformStyle: "preserve-3d",
                    perspective: "1200px",
                    transform: L.rotate,
                  }}
                >
                  {/* Sticker badges */}
                  {feat.tag === "Smart" && (
                    <div
                      style={{
                        position: "absolute",
                        top: "-12px",
                        left: "20px",
                        padding: "4px 10px",
                        background: "#1a5632",
                        color: "#d9fb60",
                        borderRadius: 999,
                        fontSize: "10px",
                        fontWeight: 700,
                        letterSpacing: "0.1em",
                        textTransform: "uppercase",
                      }}
                    >
                      Smart
                    </div>
                  )}
                  {feat.tag === "Workspaces" && (
                    <div
                      style={{
                        position: "absolute",
                        top: "-10px",
                        right: "12px",
                        padding: "4px 10px",
                        background: "#d9fb60",
                        color: "#1a5632",
                        border: "2px solid #1a5632",
                        boxShadow: "2px 3px 0 0 #1a5632",
                        borderRadius: 999,
                        fontSize: "10px",
                        fontWeight: 800,
                        letterSpacing: "0.08em",
                        textTransform: "uppercase",
                        transform: "rotate(6deg)",
                        zIndex: 2,
                      }}
                    >
                      building…
                    </div>
                  )}

                  <div>
                    <div className="mb-4 flex items-center gap-2">
                      <div
                        className="h-2 w-2 rounded-full"
                        style={{ background: L.dotColor }}
                      />
                      <span
                        className="text-xs font-bold uppercase tracking-wider"
                        style={{ color: L.tagColor }}
                      >
                        {feat.tag}
                      </span>
                    </div>
                    <h3
                      className="text-xl font-bold md:text-2xl"
                      style={{
                        color: L.headingColor,
                        fontFamily: "var(--font-serif)",
                      }}
                    >
                      {feat.title}
                    </h3>
                    <p
                      className="mt-3 text-sm leading-relaxed"
                      style={{ color: L.descColor }}
                    >
                      {feat.desc}
                    </p>
                  </div>
                  <div className="mt-8">{feat.visual}</div>
                </motion.div>
              </ScrollReveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}
