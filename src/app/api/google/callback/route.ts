import { NextRequest, NextResponse } from "next/server";
import { verifyState } from "@/lib/google/oauth";
import { persistFromCode } from "@/lib/google/tokens";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? new URL(req.url).origin;
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  if (error) {
    return NextResponse.redirect(new URL(`/settings/connections?err=${encodeURIComponent(error)}`, appUrl));
  }
  if (!code || !state) {
    return NextResponse.redirect(new URL("/settings/connections?err=missing_code", appUrl));
  }
  const stateUserId = verifyState(state);
  if (!stateUserId) {
    return NextResponse.redirect(new URL("/settings/connections?err=invalid_state", appUrl));
  }

  // HMAC alone proves the state wasn't tampered with — not that the person
  // returning is the same one who started the flow. Without this check, a
  // captured state value could be replayed to bind a different user's
  // Google tokens to whoever is signed into the browser at callback time.
  // Pin the state to the currently authenticated session.
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(new URL("/login?redirect=/settings/connections", appUrl));
  }
  if (user.id !== stateUserId) {
    console.warn("[google/callback] state user mismatch", { stateUserId, sessionUserId: user.id });
    return NextResponse.redirect(new URL("/settings/connections?err=session_mismatch", appUrl));
  }

  try {
    await persistFromCode(stateUserId, code);
  } catch (e) {
    console.error("[google/callback] persist failed", e);
    return NextResponse.redirect(new URL("/settings/connections?err=exchange_failed", appUrl));
  }

  return NextResponse.redirect(new URL("/settings/connections?ok=connected", appUrl));
}
