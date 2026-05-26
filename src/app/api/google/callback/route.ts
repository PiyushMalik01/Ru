import { NextRequest, NextResponse } from "next/server";
import { verifyState } from "@/lib/google/oauth";
import { persistFromCode } from "@/lib/google/tokens";

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
  const userId = verifyState(state);
  if (!userId) {
    return NextResponse.redirect(new URL("/settings/connections?err=invalid_state", appUrl));
  }

  try {
    await persistFromCode(userId, code);
  } catch (e) {
    console.error("[google/callback] persist failed", e);
    return NextResponse.redirect(new URL("/settings/connections?err=exchange_failed", appUrl));
  }

  return NextResponse.redirect(new URL("/settings/connections?ok=connected", appUrl));
}
