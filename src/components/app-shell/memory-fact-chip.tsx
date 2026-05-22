"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

export function MemoryFactChip() {
  const [factCount, setFactCount] = useState<number | null>(null);

  useEffect(() => {
    const supabase = createClient();
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const [{ data: prof }, { count }] = await Promise.all([
        supabase.from("profiles").select("profile_doc").eq("id", user.id).single(),
        supabase
          .from("episodes")
          .select("id", { count: "exact", head: true })
          .eq("user_id", user.id)
          .is("superseded_by", null)
          .is("archived_at", null),
      ]);
      const doc = (prof?.profile_doc as Record<string, { content?: string }>) ?? {};
      let sentences = 0;
      for (const v of Object.values(doc)) {
        if (typeof v?.content === "string") {
          sentences += v.content.split(/[.!?]+/).filter((s) => s.trim().length > 0).length;
        }
      }
      setFactCount(sentences + (count ?? 0));
    })();
  }, []);

  if (factCount === null || factCount === 0) return null;
  return (
    <Link
      href="/settings/memory"
      className="hidden items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] md:inline-flex"
      style={{ borderColor: "#e8e4de", color: "#1a5632", background: "#fbfaf7" }}
      title="What Ru knows about you"
    >
      <span aria-hidden className="h-1.5 w-1.5 rounded-full" style={{ background: "#1a5632" }} />
      {factCount} {factCount === 1 ? "fact" : "facts"}
    </Link>
  );
}
