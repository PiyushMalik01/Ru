import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { syncUser } from "@/lib/google/gmail-sync";

export const dynamic = "force-dynamic";

export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response("unauthorized", { status: 401 });

  try {
    const result = await syncUser(user.id);
    return NextResponse.json({
      inserted: result.inserted,
      scanned: result.scanned,
      bootstrapped: result.bootstrapped,
      errors: result.errors.length > 0 ? result.errors : undefined,
    });
  } catch (e) {
    console.error("[api/google/gmail/scan] failed", e);
    const msg = e instanceof Error ? e.message : "scan failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
