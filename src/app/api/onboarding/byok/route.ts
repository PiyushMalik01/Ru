import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { encrypt } from "@/lib/crypto";

export const dynamic = "force-dynamic";

/**
 * REST shim around the `saveBYOK` server action so non-Next clients
 * (the Flutter mobile app) can submit a BYOK key. The web continues to
 * use the server action directly; this route is additive.
 *
 * Auth: cookie (web) or `Authorization: Bearer <access_token>` (mobile) —
 * resolved by createClient() which now accepts both.
 */
const BodySchema = z.object({
  provider: z.enum(["openai", "anthropic", "gemini"]),
  apiKey: z.string().min(8).max(500),
  model: z.string().max(120).optional().nullable(),
});

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response("unauthorized", { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) return new Response("invalid body", { status: 400 });

  const encrypted = encrypt(parsed.data.apiKey);
  const { error } = await supabase.from("profiles").update({
    ai_provider: parsed.data.provider,
    ai_credentials: { apiKey: encrypted, model: parsed.data.model || null },
  }).eq("id", user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
