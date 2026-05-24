import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function proxy(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    // Page-level auth gate only. ALL `/api/*` routes handle their own auth
    // via createClient().auth.getUser() — which accepts both cookie sessions
    // (web) and the `Authorization: Bearer <jwt>` header (Flutter mobile).
    //
    // Without excluding `/api/` here, the proxy redirects non-cookie
    // requests to `/login`, which surfaces as 405 on the mobile client
    // (POST against the /login HTML page).
    "/((?!_next/static|_next/image|favicon.ico|sw.js|api|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
