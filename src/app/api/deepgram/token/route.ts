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
  // Production should set DEEPGRAM_PROJECT_ID with an admin key so we can mint
  // short-lived scoped keys instead of exposing the master to the browser.
  if (!projectId) {
    return NextResponse.json({ key: dgKey, expiresIn: null, scoped: false });
  }

  try {
    const dg = createDg(dgKey);
    const expiration = 60;
    const { result, error } = await dg.manage.createProjectKey(projectId, {
      comment: `ru-session-${user.id}`,
      scopes: ["usage:write"],
      time_to_live_in_seconds: expiration,
    });
    if (error || !result) throw new Error(error?.message ?? "unknown");
    return NextResponse.json({ key: result.key, expiresIn: expiration, scoped: true });
  } catch (e) {
    // Key likely lacks the `keys:write` scope. Fall back to the master key so voice
    // still works in dev. Surface the reason so the user knows to upgrade for prod.
    console.warn(
      "[deepgram] scoped key mint failed, falling back to master key:",
      e instanceof Error ? e.message : e
    );
    return NextResponse.json({ key: dgKey, expiresIn: null, scoped: false });
  }
}
