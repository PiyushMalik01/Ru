"use client";

import { useEffect, useState, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";
import { reverseAuditEntryAction } from "./actions";

interface AuditRow {
  id: string;
  kind: string;
  summary: string;
  payload: Record<string, unknown> | null;
  reversible: boolean;
  reversed_at: string | null;
  created_at: string;
}

export function TimelineTab({ userId }: { userId: string }) {
  const [rows, setRows] = useState<AuditRow[] | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase
      .from("memory_audit")
      .select("id, kind, summary, payload, reversible, reversed_at, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(150)
      .then(({ data }) => setRows((data ?? []) as AuditRow[]));
  }, [userId]);

  if (rows === null) return <p style={{ color: "#8a847b" }}>Loading…</p>;
  if (rows.length === 0) return <p style={{ color: "#8a847b" }}>Nothing has happened yet.</p>;

  const grouped = groupByDay(rows);

  return (
    <div className="space-y-8">
      {grouped.map(({ day, entries }) => (
        <div key={day}>
          <h3
            className="mb-3 text-[13px] uppercase tracking-[0.16em]"
            style={{ fontFamily: "var(--font-body)", color: "#8a847b" }}
          >
            {day}
          </h3>
          <ul className="space-y-3">
            {entries.map((e) => <TimelineRow key={e.id} entry={e} />)}
          </ul>
        </div>
      ))}
    </div>
  );
}

function TimelineRow({ entry }: { entry: AuditRow }) {
  const [pending, startTransition] = useTransition();
  const isReversed = !!entry.reversed_at;
  const verb = verbForKind(entry.kind);

  return (
    <li className="group relative pl-4" style={{ borderLeft: "1px solid #e8e4de" }}>
      <div className="flex items-baseline gap-2">
        <span
          className="text-[13px] uppercase tracking-[0.14em]"
          style={{ color: "#1a5632", fontFamily: "var(--font-body)" }}
        >
          {verb}
        </span>
        <span className="text-[15px]" style={{ color: isReversed ? "#8a847b" : "#2d2a26" }}>
          {entry.summary}
          {isReversed && <span className="ml-2 text-[12px]" style={{ color: "#8a847b" }}>(undone)</span>}
        </span>
        {entry.reversible && !isReversed && (
          <button
            disabled={pending}
            onClick={() => startTransition(async () => { await reverseAuditEntryAction(entry.id); })}
            className="ml-auto text-[12px] opacity-0 transition-opacity group-hover:opacity-100"
            style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", color: "#1a5632" }}
          >
            {pending ? "undoing…" : "undo"}
          </button>
        )}
      </div>
    </li>
  );
}

function verbForKind(kind: string): string {
  switch (kind) {
    case "learned": return "learned";
    case "forgot": return "forgot";
    case "merged": return "merged";
    case "superseded": return "replaced";
    case "corrected": return "you edited";
    case "profile_rewrite": return "rewrote";
    case "reversed": return "undid";
    default: return kind;
  }
}

function groupByDay(rows: AuditRow[]) {
  const out: Array<{ day: string; entries: AuditRow[] }> = [];
  const todayISO = new Date().toISOString().slice(0, 10);
  const yesterdayISO = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  for (const r of rows) {
    const d = r.created_at.slice(0, 10);
    const label = d === todayISO ? "Today" : d === yesterdayISO ? "Yesterday" : new Date(r.created_at).toDateString();
    const bucket = out.find((b) => b.day === label);
    if (bucket) bucket.entries.push(r); else out.push({ day: label, entries: [r] });
  }
  return out;
}
