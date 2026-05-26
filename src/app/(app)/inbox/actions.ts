"use server";

// Server actions for the inbox surface. RLS on `notifications` already
// restricts rows to the authenticated user, but we still re-check user
// presence and scope every mutation by user_id for defense in depth.

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

async function authed() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user ? { supabase, userId: user.id } : null;
}

export async function markRead(id: string): Promise<{ ok: boolean }> {
  const ctx = await authed();
  if (!ctx) return { ok: false };
  const { error } = await ctx.supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", ctx.userId)
    .is("read_at", null);
  if (error) return { ok: false };
  revalidatePath("/inbox");
  return { ok: true };
}

export async function markAllRead(): Promise<{ ok: boolean }> {
  const ctx = await authed();
  if (!ctx) return { ok: false };
  const { error } = await ctx.supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("user_id", ctx.userId)
    .is("read_at", null);
  if (error) return { ok: false };
  revalidatePath("/inbox");
  return { ok: true };
}

export async function archive(id: string): Promise<{ ok: boolean }> {
  const ctx = await authed();
  if (!ctx) return { ok: false };
  const now = new Date().toISOString();
  const { error } = await ctx.supabase
    .from("notifications")
    .update({ archived_at: now, read_at: now })
    .eq("id", id)
    .eq("user_id", ctx.userId);
  if (error) return { ok: false };
  revalidatePath("/inbox");
  return { ok: true };
}

export async function unarchive(id: string): Promise<{ ok: boolean }> {
  const ctx = await authed();
  if (!ctx) return { ok: false };
  const { error } = await ctx.supabase
    .from("notifications")
    .update({ archived_at: null })
    .eq("id", id)
    .eq("user_id", ctx.userId);
  if (error) return { ok: false };
  revalidatePath("/inbox");
  return { ok: true };
}
