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
  // Returning the master key to the browser hands any signed-in user root
  // access to the Deepgram account (key management, usage, billing). Only
  // permit that in a local-dev environment, never in production.
  const isProd = process.env.NODE_ENV === "production";
  if (!projectId) {
    if (isProd) {
      return new Response("deepgram project id not configured", { status: 500 });
    }
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
    console.warn(
      "[deepgram] scoped key mint failed:",
      e instanceof Error ? e.message : e
    );
    if (isProd) {
      // Fail closed — never hand out the master key in prod even on error.
      return new Response("could not mint deepgram key", { status: 502 });
    }
    return NextResponse.json({ key: dgKey, expiresIn: null, scoped: false });
  }
}
