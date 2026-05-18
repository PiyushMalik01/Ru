import { NextResponse } from "next/server";
import { createClient as createDg } from "@deepgram/sdk";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response("unauthorized", { status: 401 });

  const dgKey = process.env.DEEPGRAM_API_KEY;
  if (!dgKey) return new Response("deepgram not configured", { status: 500 });

  const projectId = process.env.DEEPGRAM_PROJECT_ID;
  // Dev fallback: when no project id is set, return the master key directly.
  // Production MUST set DEEPGRAM_PROJECT_ID so we can mint short-lived scoped keys.
  if (!projectId) {
    return NextResponse.json({ key: dgKey, expiresIn: null, scoped: false });
  }

  const dg = createDg(dgKey);
  const expiration = 60;
  const { result, error } = await dg.manage.createProjectKey(projectId, {
    comment: `ru-session-${user.id}`,
    scopes: ["usage:write"],
    time_to_live_in_seconds: expiration,
  });
  if (error || !result) {
    return new Response(`deepgram key mint failed: ${error?.message ?? "unknown"}`, { status: 500 });
  }

  return NextResponse.json({ key: result.key, expiresIn: expiration, scoped: true });
}
