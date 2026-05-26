import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { disconnect } from "@/lib/google/tokens";

export const dynamic = "force-dynamic";

export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response("unauthorized", { status: 401 });

  await disconnect(user.id);
  return NextResponse.json({ ok: true });
}
