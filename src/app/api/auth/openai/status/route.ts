import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getChatGPTStatus } from "@/lib/ai/openai-connection";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response("unauthorized", { status: 401 });

  const status = await getChatGPTStatus(supabase, user.id);
  return NextResponse.json(status);
}
