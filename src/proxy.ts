import { type NextRequest } from "next/server";
// import { updateSession } from "@/lib/supabase/middleware";
import { NextResponse } from "next/server";

export async function proxy(request: NextRequest) {
  // Auth bypassed for dev preview — uncomment updateSession when Supabase is linked
  // return await updateSession(request);
  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|sw.js|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
