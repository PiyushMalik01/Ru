"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

export function MemoryRolloutBanner() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (localStorage.getItem("ru_memory_rollout_dismissed") === "1") return;
    const supabase = createClient();
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from("profiles")
        .select("memory_onboarded_at")
        .eq("id", user.id)
        .single();
      if (!data?.memory_onboarded_at) setShow(true);
    })();
  }, []);

  if (!show) return null;
  return (
    <div
      className="border-b px-6 py-3 text-[13px]"
      style={{ background: "#fffaeb", borderColor: "#f0e7c8", color: "#2d2a26" }}
    >
      <div className="mx-auto flex max-w-5xl items-center gap-3">
        <span style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", color: "#1a5632" }}>
          Ru just got a memory.
        </span>
        <Link href="/settings/memory" className="underline" style={{ color: "#1a5632" }}>
          See what she knows
        </Link>
        <button
          className="ml-auto text-[12px]"
          style={{ color: "#8a847b" }}
          onClick={() => { localStorage.setItem("ru_memory_rollout_dismissed", "1"); setShow(false); }}
        >
          dismiss
        </button>
      </div>
    </div>
  );
}
