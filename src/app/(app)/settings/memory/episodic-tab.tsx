"use client";

import { useEffect, useState, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";
import { forgetEpisodeAction } from "./actions";

interface Episode {
  id: string;
  content: string;
  importance: number;
  last_referenced_at: string;
  created_at: string;
}

export function EpisodicTab({ userId }: { userId: string }) {
  const [expanded, setExpanded] = useState(false);
  const [episodes, setEpisodes] = useState<Episode[] | null>(null);
  const [minImportance, setMinImportance] = useState(0);

  useEffect(() => {
    if (!expanded) return;
    const supabase = createClient();
    supabase
      .from("episodes")
      .select("id, content, importance, last_referenced_at, created_at")
      .eq("user_id", userId)
      .is("superseded_by", null)
      .is("archived_at", null)
      .gte("importance", minImportance)
      .order("importance", { ascending: false })
      .order("last_referenced_at", { ascending: false })
      .limit(200)
      .then(({ data }) => setEpisodes((data ?? []) as Episode[]));
  }, [expanded, userId, minImportance]);

  if (!expanded) {
    return (
      <button
        onClick={() => setExpanded(true)}
        className="text-[14px]"
        style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", color: "#1a5632" }}
      >
        ▸ Show advanced memory
      </button>
    );
  }

  return (
    <div>
      <div className="mb-6 flex items-center gap-4 text-[13px]" style={{ color: "#6b6f66" }}>
        <label>min importance:</label>
        <input
          type="range"
          min={0}
          max={1}
          step={0.1}
          value={minImportance}
          onChange={(e) => setMinImportance(parseFloat(e.target.value))}
        />
        <span>{minImportance.toFixed(1)}</span>
      </div>

      {episodes === null && <p style={{ color: "#8a847b" }}>Loading…</p>}
      {episodes && episodes.length === 0 && <p style={{ color: "#8a847b" }}>No episodes match.</p>}
      {episodes && episodes.length > 0 && (
        <ul className="space-y-3">
          {episodes.map((e) => <EpisodeRow key={e.id} episode={e} />)}
        </ul>
      )}
    </div>
  );
}

function EpisodeRow({ episode }: { episode: Episode }) {
  const [pending, startTransition] = useTransition();
  return (
    <li className="rounded-xl border p-3" style={{ borderColor: "#e8e4de", background: "#fbfaf7" }}>
      <div className="flex items-start gap-3">
        <ImportanceBar value={episode.importance} />
        <div className="flex-1">
          <p className="text-[15px]" style={{ color: "#2d2a26" }}>{episode.content}</p>
          <p className="mt-1 text-[12px]" style={{ color: "#8a847b" }}>
            created {new Date(episode.created_at).toLocaleDateString()} · last seen {new Date(episode.last_referenced_at).toLocaleDateString()}
          </p>
        </div>
        <button
          disabled={pending}
          onClick={() => startTransition(async () => {
            if (!confirm("Ask Ru to forget this episode?")) return;
            await forgetEpisodeAction(episode.id);
          })}
          className="text-[12px]"
          style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", color: "#7d1a0d" }}
        >
          {pending ? "…" : "forget"}
        </button>
      </div>
    </li>
  );
}

function ImportanceBar({ value }: { value: number }) {
  return (
    <div className="mt-1 h-12 w-2 rounded-full" style={{ background: "#e8e4de", position: "relative" }}>
      <div
        className="absolute bottom-0 left-0 right-0 rounded-full"
        style={{ background: "#1a5632", height: `${Math.max(4, value * 100)}%` }}
      />
    </div>
  );
}
