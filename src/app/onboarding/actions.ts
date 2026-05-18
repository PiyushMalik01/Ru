"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function saveProfile(input: { displayName: string; timezone: string }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "unauthorized" } as const;

  const displayName = input.displayName.trim().slice(0, 80);
  const timezone = input.timezone.trim().slice(0, 50) || "UTC";
  if (!displayName) return { ok: false, error: "name is required" } as const;

  const { error } = await supabase
    .from("profiles")
    .update({ display_name: displayName, timezone })
    .eq("id", user.id);
  if (error) return { ok: false, error: error.message } as const;

  revalidatePath("/onboarding");
  return { ok: true } as const;
}

export async function completeOnboarding() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "unauthorized" } as const;

  await supabase
    .from("profiles")
    .update({ onboarding_completed: true })
    .eq("id", user.id);

  // Seed Ru's opening message so the first chat already feels alive.
  // We insert an assistant message; the system prompt + this message kick off the convo.
  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", user.id)
    .single();

  const name = profile?.display_name ?? "";
  const greeting = name
    ? `Hey ${name}. Tell me about your typical day — anything you're working on right now, or just trying to get a handle on?`
    : `Hey. Tell me about your typical day — anything you're working on right now, or just trying to get a handle on?`;

  await supabase.from("messages").insert({
    user_id: user.id,
    role: "assistant",
    content: greeting,
    input_method: "text",
  });

  redirect("/chat");
}
