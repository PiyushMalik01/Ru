import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { initiateChatGPTDeviceCode } from "@/lib/ai/openai-connection";

export const dynamic = "force-dynamic";

export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response("unauthorized", { status: 401 });

  try {
    const code = await initiateChatGPTDeviceCode(supabase, user.id);
    return NextResponse.json(code);
  } catch (e) {
    return new Response(e instanceof Error ? e.message : "failed to start device flow", { status: 500 });
  }
}
