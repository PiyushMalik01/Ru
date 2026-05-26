import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { buildAuthUrl } from "@/lib/google/oauth";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/login", process.env.NEXT_PUBLIC_APP_URL));

  if (!process.env.GOOGLE_OAUTH_CLIENT_ID) {
    return NextResponse.redirect(
      new URL("/settings/connections?err=not_configured", process.env.NEXT_PUBLIC_APP_URL),
    );
  }

  const { url } = buildAuthUrl(user.id);
  return NextResponse.redirect(url);
}
