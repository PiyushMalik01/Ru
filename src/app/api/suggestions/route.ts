import { NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/suggestions
 *
 * List the current user's surfaceable suggestions. By default returns rows
 * that are `status=pending`, past `show_at`, unexpired, and not snoozed into
 * the future. Optionally filtered to a single surface that hasn't been used.
 *
 * Query params:
 *   ?status=pending      (default; any `suggestion_status` enum value)
 *   ?limit=20            (default 50, hard cap 100)
 *   ?surface=briefing    optional: also require surfaced_<surface>=false
 *
 * Ordered: priority DESC (urgent first), confidence DESC, created_at ASC.
 */

const STATUS_VALUES = [
  "pending",
  "shown",
  "acted",
  "dismissed",
  "snoozed",
  "expired",
] as const;
const SURFACE_VALUES = ["briefing", "toast", "push"] as const;

const QuerySchema = z.object({
  status: z.enum(STATUS_VALUES).default("pending"),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  surface: z.enum(SURFACE_VALUES).optional(),
});

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Response("unauthorized", { status: 401 });

  const { searchParams } = new URL(req.url);
  const parsed = QuerySchema.safeParse({
    status: searchParams.get("status") ?? undefined,
    limit: searchParams.get("limit") ?? undefined,
    surface: searchParams.get("surface") ?? undefined,
  });
  if (!parsed.success) return new Response("invalid query", { status: 400 });

  const { status, limit, surface } = parsed.data;
  const nowIso = new Date().toISOString();

  let query = supabase
    .from("suggestions")
    .select(
      "id, type, payload, message, priority, confidence, show_at, created_at",
    )
    .eq("user_id", user.id)
    .eq("status", status)
    .lte("show_at", nowIso)
    .or(`expires_at.is.null,expires_at.gt.${nowIso}`)
    .or(`snooze_until.is.null,snooze_until.lte.${nowIso}`)
    .order("priority", { ascending: false })
    .order("confidence", { ascending: false })
    .order("created_at", { ascending: true })
    .limit(limit);

  if (surface === "briefing") query = query.eq("surfaced_briefing", false);
  else if (surface === "toast") query = query.eq("surfaced_toast", false);
  else if (surface === "push") query = query.eq("surfaced_push", false);

  const { data, error } = await query;
  if (error) {
    return new Response(`db error: ${error.message}`, { status: 500 });
  }

  return Response.json({ suggestions: data ?? [] });
}
