import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { disconnectChatGPT } from "@/lib/ai/openai-connection";

export const dynamic = "force-dynamic";

export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response("unauthorized", { status: 401 });

  await disconnectChatGPT(supabase, user.id);
  return NextResponse.json({ ok: true });
}
