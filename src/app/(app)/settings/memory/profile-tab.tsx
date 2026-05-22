"use client";

import { useState, useTransition } from "react";
import type { MemoryProfile } from "@/lib/queries/memory";
import { updateProfileSectionAction, rebuildMemoryAction } from "./actions";

const SECTION_ORDER: Array<{ key: keyof NonNullable<MemoryProfile>["profile_doc"]; label: string }> = [
  { key: "identity",         label: "Identity" },
  { key: "preferences",      label: "Preferences" },
  { key: "current_themes",   label: "Current themes" },
  { key: "active_projects",  label: "Active projects" },
  { key: "ru_and_me",        label: "Ru & me" },
];

export function ProfileTab({ profile }: { profile: MemoryProfile | null }) {
  const doc = profile?.profile_doc ?? {};
  return (
    <div className="space-y-10">
      {SECTION_ORDER.map(({ key, label }) => (
        <SectionEditor
          key={key as string}
          sectionKey={key as string}
          label={label}
          initialContent={doc[key]?.content ?? ""}
        />
      ))}
      <RebuildButton />
    </div>
  );
}

function SectionEditor({
  sectionKey,
  label,
  initialContent,
}: { sectionKey: string; label: string; initialContent: string }) {
  const [editing, setEditing] = useState(false);
  const [content, setContent] = useState(initialContent);
  const [draft, setDraft]     = useState(initialContent);
  const [pending, startTransition] = useTransition();
  const [savedAt, setSavedAt] = useState<number | null>(null);

  function save() {
    startTransition(async () => {
      const res = await updateProfileSectionAction({ section: sectionKey, newContent: draft });
      if (res.ok) {
        setContent(draft);
        setEditing(false);
        setSavedAt(Date.now());
      }
    });
  }

  return (
    <section>
      <div className="mb-3 flex items-baseline justify-between">
        <h2
          style={{
            fontFamily: "var(--font-serif)",
            fontSize: "22px",
            color: "#0d1f15",
            letterSpacing: "-0.01em",
          }}
        >
          {label}
        </h2>
        {!editing && (
          <button
            className="text-[13px]"
            style={{
              fontFamily: "var(--font-serif)",
              fontStyle: "italic",
              color: "#1a5632",
            }}
            onClick={() => { setDraft(content); setEditing(true); }}
          >
            edit
          </button>
        )}
      </div>

      {!editing ? (
        <p
          className="whitespace-pre-wrap text-[15px] leading-relaxed"
          style={{ color: content ? "#2d2a26" : "#8a847b" }}
        >
          {content || "(Ru hasn't picked anything up here yet.)"}
        </p>
      ) : (
        <div>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={Math.max(3, draft.split("\n").length)}
            className="w-full rounded-xl border bg-transparent px-4 py-3 text-[15px] leading-relaxed focus:outline-none"
            style={{
              borderColor: "#1a5632",
              boxShadow: "0 0 0 4px rgba(26,86,50,0.10)",
              background: "#fbfaf7",
              color: "#2d2a26",
            }}
          />
          <div className="mt-3 flex gap-3">
            <button
              disabled={pending}
              onClick={save}
              className="rounded-full border-2 px-5 py-2 text-[14px]"
              style={{
                background: "#d9fb60",
                borderColor: "#1a5632",
                color: "#1a5632",
                fontFamily: "var(--font-serif)",
              }}
            >
              {pending ? "Saving…" : "Save"}
            </button>
            <button
              disabled={pending}
              onClick={() => { setDraft(content); setEditing(false); }}
              className="text-[13px]"
              style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", color: "#6b6f66" }}
            >
              cancel
            </button>
          </div>
        </div>
      )}

      {savedAt && Date.now() - savedAt < 2000 && (
        <div className="mt-2 text-[12px]" style={{ color: "#1a5632" }}>saved</div>
      )}
    </section>
  );
}

function RebuildButton() {
  const [pending, startTransition] = useTransition();
  const [done, setDone] = useState(false);
  return (
    <div className="border-t pt-8" style={{ borderColor: "#e8e4de" }}>
      <h3 style={{ fontFamily: "var(--font-serif)", fontSize: "18px", color: "#0d1f15" }}>
        Rebuild from scratch
      </h3>
      <p className="mt-2 text-[13.5px]" style={{ color: "#6b6f66" }}>
        Reads your last 180 days of chats and produces a fresh profile. Existing memory is preserved; this just rewrites the summary sections.
      </p>
      <button
        disabled={pending}
        onClick={() => startTransition(async () => {
          if (!confirm("Rebuild your memory profile from the last 180 days of chats?")) return;
          await rebuildMemoryAction("rebuild");
          setDone(true);
        })}
        className="mt-3 rounded-full border px-4 py-2 text-[13px]"
        style={{ borderColor: "#1a5632", color: "#1a5632", background: "#fff" }}
      >
        {done ? "Queued — ready by tomorrow" : pending ? "Queuing…" : "Rebuild"}
      </button>
    </div>
  );
}
