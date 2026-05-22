import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { inngest } from "@/lib/inngest";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response("unauthorized", { status: 401 });

  const body = await req.json().catch(() => ({}));
  const mode = body?.mode === "rebuild" ? "rebuild" : "full";

  await inngest.send({
    name: "memory.consolidate.requested",
    data: { userId: user.id, mode },
  });

  return Response.json({ ok: true, mode });
}
