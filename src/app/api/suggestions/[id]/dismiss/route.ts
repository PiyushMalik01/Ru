import { NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * POST /api/suggestions/[id]/dismiss
 *
 * Marks a suggestion as explicitly dismissed by the user. Logs the event to
 * `suggestion_actions` so the ranker can learn suppression patterns later.
 */

const BodySchema = z
  .object({
    surface: z.enum(["briefing", "toast", "push"]).optional(),
  })
  .partial();

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Response("unauthorized", { status: 401 });

  const { id } = await params;
  if (!id) return new Response("missing id", { status: 400 });

  // Body is optional — accept missing / empty body.
  const rawBody = await req.json().catch(() => ({}));
  const parsed = BodySchema.safeParse(rawBody ?? {});
  if (!parsed.success) return new Response("invalid body", { status: 400 });
  const { surface } = parsed.data;

  // Ownership check.
  const { data: existing } = await supabase
    .from("suggestions")
    .select("id, user_id")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();
  if (!existing) return new Response("not found", { status: 404 });

  const nowIso = new Date().toISOString();
  const { error: updErr } = await supabase
    .from("suggestions")
    .update({ status: "dismissed", dismissed_at: nowIso })
    .eq("id", id)
    .eq("user_id", user.id);
  if (updErr) {
    return new Response(`db error: ${updErr.message}`, { status: 500 });
  }

  const { error: logErr } = await supabase.from("suggestion_actions").insert({
    suggestion_id: id,
    user_id: user.id,
    action: "dismissed",
    surface: surface ?? null,
  });
  if (logErr) {
    // The mutation succeeded — telemetry is best-effort.
    console.error("suggestion_actions insert failed", logErr);
  }

  return Response.json({ ok: true });
}
