"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { inngest } from "@/lib/inngest";

export async function updateProfileSectionAction(input: {
  section: string;
  newContent: string;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "unauthorized" };

  const SECTIONS = ["identity", "preferences", "current_themes", "active_projects", "ru_and_me"];
  if (!SECTIONS.includes(input.section)) return { ok: false, error: "invalid section" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("profile_doc, profile_version")
    .eq("id", user.id)
    .single();
  if (!profile) return { ok: false, error: "profile not found" };

  const doc = (profile.profile_doc as Record<string, { content: string; sources: string[]; updated_at: string }>) ?? {};
  const before = doc[input.section]?.content ?? "";

  doc[input.section] = {
    content: input.newContent.trim(),
    sources: doc[input.section]?.sources ?? [],
    updated_at: new Date().toISOString(),
  };

  await supabase
    .from("profiles")
    .update({
      profile_doc: doc,
      profile_version: (profile.profile_version ?? 0) + 1,
    })
    .eq("id", user.id);

  await supabase.from("memory_corrections").insert({
    user_id: user.id,
    section: input.section,
    original: before,
    corrected: input.newContent.trim(),
  });

  await supabase.from("memory_audit").insert({
    user_id: user.id,
    kind: "corrected",
    summary: `You edited ${input.section}.`,
    payload: { section: input.section, before, after: input.newContent.trim() },
    reversible: true,
  });

  await inngest.send({
    name: "memory.consolidate.user_profile_touched",
    data: { userId: user.id, mode: "patch_profile", section: input.section },
  });

  revalidatePath("/settings/memory");
  return { ok: true };
}

export async function reverseAuditEntryAction(auditId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "unauthorized" };

  const { data: entry } = await supabase
    .from("memory_audit")
    .select("*")
    .eq("id", auditId)
    .eq("user_id", user.id)
    .single();

  if (!entry || !entry.reversible || entry.reversed_at) {
    return { ok: false, error: "not reversible" };
  }

  if (entry.kind === "learned" && entry.episode_ids && entry.episode_ids.length > 0) {
    await supabase
      .from("episodes")
      .update({ archived_at: new Date().toISOString() })
      .in("id", entry.episode_ids);
  } else if (entry.kind === "forgot" && entry.episode_ids && entry.episode_ids.length > 0) {
    await supabase
      .from("episodes")
      .update({ archived_at: null, superseded_by: null, superseded_reason: null })
      .in("id", entry.episode_ids);
  } else if (entry.kind === "merged" && entry.payload) {
    const payload = entry.payload as { kept?: string; dropped?: string; pre_drop_content?: string };
    if (payload.dropped) {
      await supabase
        .from("episodes")
        .update({ superseded_by: null, superseded_reason: null })
        .eq("id", payload.dropped);
    }
  } else if (entry.kind === "corrected" && entry.payload) {
    const payload = entry.payload as { section?: string; before?: string };
    if (payload.section && typeof payload.before === "string") {
      const { data: profile } = await supabase
        .from("profiles")
        .select("profile_doc, profile_version")
        .eq("id", user.id)
        .single();
      if (profile) {
        const doc = (profile.profile_doc as Record<string, { content: string; sources: string[]; updated_at: string }>) ?? {};
        doc[payload.section] = {
          content: payload.before,
          sources: doc[payload.section]?.sources ?? [],
          updated_at: new Date().toISOString(),
        };
        await supabase
          .from("profiles")
          .update({ profile_doc: doc, profile_version: (profile.profile_version ?? 0) + 1 })
          .eq("id", user.id);
      }
    }
  }

  const { data: reversal } = await supabase
    .from("memory_audit")
    .insert({
      user_id: user.id,
      kind: "reversed",
      summary: `Reversed: ${entry.summary}`,
      payload: { reversed_entry_id: entry.id, original_kind: entry.kind },
      episode_ids: entry.episode_ids ?? [],
      reversible: false,
    })
    .select()
    .single();

  await supabase
    .from("memory_audit")
    .update({
      reversed_at: new Date().toISOString(),
      reversed_by: reversal?.id ?? null,
    })
    .eq("id", entry.id);

  revalidatePath("/settings/memory");
  return { ok: true };
}

export async function forgetEpisodeAction(episodeId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "unauthorized" };

  const { data: ep } = await supabase
    .from("episodes")
    .select("content")
    .eq("id", episodeId)
    .eq("user_id", user.id)
    .single();
  if (!ep) return { ok: false, error: "not found" };

  await supabase
    .from("episodes")
    .update({ archived_at: new Date().toISOString(), superseded_reason: "user_forget" })
    .eq("id", episodeId);
  await supabase.from("memory_audit").insert({
    user_id: user.id,
    kind: "forgot",
    summary: `You asked Ru to forget: "${ep.content.slice(0, 80)}"`,
    payload: { episode_id: episodeId, original_content: ep.content },
    episode_ids: [episodeId],
    reversible: true,
  });
  revalidatePath("/settings/memory");
  return { ok: true };
}

export async function rebuildMemoryAction(mode: "full" | "rebuild" = "full") {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "unauthorized" };
  await inngest.send({
    name: "memory.consolidate.requested",
    data: { userId: user.id, mode },
  });
  return { ok: true };
}

export async function markOnboardedAction() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false };
  await supabase
    .from("profiles")
    .update({ memory_onboarded_at: new Date().toISOString() })
    .eq("id", user.id);
  revalidatePath("/settings/memory");
  return { ok: true };
}
