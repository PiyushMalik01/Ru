import { NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * POST /api/suggestions/[id]/acted
 *
 * Records that the user took the suggested action. Used by the ranker as a
 * positive signal for similar future suggestions.
 */

const BodySchema = z
  .object({
    surface: z.string().min(1).max(64).optional(),
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

  const rawBody = await req.json().catch(() => ({}));
  const parsed = BodySchema.safeParse(rawBody ?? {});
  if (!parsed.success) return new Response("invalid body", { status: 400 });
  const { surface } = parsed.data;

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
    .update({ status: "acted", acted_at: nowIso })
    .eq("id", id)
    .eq("user_id", user.id);
  if (updErr) {
    return new Response(`db error: ${updErr.message}`, { status: 500 });
  }

  const { error: logErr } = await supabase.from("suggestion_actions").insert({
    suggestion_id: id,
    user_id: user.id,
    action: "acted",
    surface: surface ?? null,
  });
  if (logErr) {
    console.error("suggestion_actions insert failed", logErr);
  }

  return Response.json({ ok: true });
}
