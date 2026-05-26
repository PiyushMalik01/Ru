import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { syncFromGoogle } from "@/lib/google/calendar-sync";

export const dynamic = "force-dynamic";

export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response("unauthorized", { status: 401 });

  try {
    const result = await syncFromGoogle(user.id);
    return NextResponse.json({ count: result.count, upserted: result.upserted, deleted: result.deleted });
  } catch (e) {
    console.error("[api/google/calendar/sync] failed", e);
    const msg = e instanceof Error ? e.message : "sync failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
