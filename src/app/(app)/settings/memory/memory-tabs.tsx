"use client";

import { useState } from "react";
import { ProfileTab } from "./profile-tab";
import { TimelineTab } from "./timeline-tab";
import { EpisodicTab } from "./episodic-tab";
import type { MemoryProfile } from "@/lib/queries/memory";

type TabKey = "profile" | "timeline" | "episodic";

export function MemoryTabs({ profile, userId }: { profile: MemoryProfile | null; userId: string }) {
  const [tab, setTab] = useState<TabKey>("profile");

  return (
    <div>
      <nav className="mb-8 flex gap-6 border-b" style={{ borderColor: "#e8e4de" }}>
        {(["profile", "timeline", "episodic"] as const).map((t) => {
          const active = tab === t;
          return (
            <button
              key={t}
              onClick={() => setTab(t)}
              className="relative pb-3 text-[15px] transition-colors"
              style={{
                fontFamily: active ? "var(--font-serif)" : undefined,
                fontStyle: active ? "italic" : undefined,
                color: active ? "#0d1f15" : "#8a847b",
              }}
            >
              {t === "episodic" ? "episodic memory" : t}
              {active && (
                <span
                  aria-hidden
                  className="absolute -bottom-px left-0 right-0"
                  style={{ height: "2px", background: "#1a5632" }}
                />
              )}
            </button>
          );
        })}
      </nav>

      {tab === "profile" && <ProfileTab profile={profile} />}
      {tab === "timeline" && <TimelineTab userId={userId} />}
      {tab === "episodic" && <EpisodicTab userId={userId} />}
    </div>
  );
}
