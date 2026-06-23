"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { encrypt } from "@/lib/crypto";

export async function saveBYOK(input: {
  provider: "openai" | "anthropic" | "gemini";
  apiKey: string;
  model?: string;
}): Promise<{ ok?: true; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "unauthorized" };
  if (!input.apiKey || input.apiKey.length < 8) return { error: "api key looks invalid" };

  const encrypted = encrypt(input.apiKey);
  const { error } = await supabase.from("profiles").update({
    ai_provider: input.provider,
    ai_credentials: { apiKey: encrypted, model: input.model || null },
  }).eq("id", user.id);

  if (error) return { error: error.message };
  return { ok: true };
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}

export async function getCurrentProvider(): Promise<"openai" | "anthropic" | "gemini" | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from("profiles").select("ai_provider").eq("id", user.id).single();
  const provider = data?.ai_provider;
  // chatgpt_oauth is surfaced via ChatGPTConnection, not the BYOK form
  if (provider === "openai" || provider === "anthropic" || provider === "gemini") return provider;
  return null;
}
