import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const SubscriptionSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({ p256dh: z.string(), auth: z.string() }),
  expirationTime: z.number().nullable().optional(),
});

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response("unauthorized", { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = SubscriptionSchema.safeParse(body);
  if (!parsed.success) return new Response("invalid subscription", { status: 400 });

  const { error } = await supabase
    .from("profiles")
    .update({ push_subscription: parsed.data as unknown as Record<string, unknown> })
    .eq("id", user.id);
  if (error) return new Response(error.message, { status: 500 });

  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response("unauthorized", { status: 401 });
  await supabase.from("profiles").update({ push_subscription: null }).eq("id", user.id);
  return NextResponse.json({ ok: true });
}
