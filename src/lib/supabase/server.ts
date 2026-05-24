import { createServerClient } from "@supabase/ssr";
import { cookies, headers } from "next/headers";
import type { Database } from "@/types/database";

/**
 * Server-side Supabase client.
 *
 * Auth resolution order:
 *   1. `Authorization: Bearer <jwt>` header on the incoming request, if any.
 *      Native clients (the Flutter mobile app) ship the user's access token
 *      this way. Web requests don't set the header, so cookies win.
 *   2. Next.js session cookies. Web clients use this exclusively.
 *
 * Passing the access token via `global.headers.Authorization` makes Supabase
 * use that token for both auth.getUser() and RLS, so a mobile-issued request
 * resolves to the exact same user + permissions as the equivalent web request.
 */
export async function createClient() {
  const cookieStore = await cookies();
  // headers() throws outside a request scope (e.g. during build prerender);
  // tolerate that so server components that prerender keep working.
  let authHeader: string | null = null;
  try {
    const h = await headers();
    authHeader = h.get("authorization");
  } catch {}

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {}
        },
      },
      global: authHeader ? { headers: { Authorization: authHeader } } : undefined,
    }
  );
}
