"use server";

import { createClient } from "@/lib/supabase/server";

export async function joinWaitlist(email: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("waitlist").insert({ email });
  if (error) {
    if (error.code === "23505") return { error: "Already on the waitlist!" };
    return { error: "Something went wrong. Try again." };
  }
  return { success: true };
}
