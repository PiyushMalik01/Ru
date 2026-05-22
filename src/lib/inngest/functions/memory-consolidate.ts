import { inngest } from "../client";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * Memory consolidation — replaces daily-summary + routine-detection.
 * Triggers:
 *   - cron sweep every hour: picks users whose local time is 3am
 *   - memory.consolidate.user_profile_touched: light patch for one section
 *   - memory.consolidate.requested: full or rebuild mode
 *
 * Five passes:
 *   1. Profile section rewrite
 *   2. Episode curation (dedup, merge, importance)
 *   3. Behavioral model (pure SQL)
 *   4. Routine detection v2
 *   5. Decay / forgetting
 */
export const memoryConsolidate = inngest.createFunction(
  {
    id: "memory-consolidate",
    concurrency: { limit: 10 },
    triggers: [
      { event: "memory.consolidate.requested" },
      { event: "memory.consolidate.user_profile_touched" },
      { cron: "0 * * * *" },
    ],
  },
  async ({ event, step }) => {
    if (!event.data || (!("userId" in event.data) && !("mode" in event.data))) {
      const queued = await step.run("sweep-by-tz", () => sweepByTimezone());
      return { sweeped: queued };
    }

    const userId = (event.data as { userId?: string }).userId;
    const mode = ((event.data as { mode?: string }).mode ?? "full") as "full" | "rebuild" | "patch_profile";
    const section = (event.data as { section?: string }).section;

    if (!userId) return { error: "userId missing" };

    if (mode === "patch_profile" && section) {
      await step.run(`patch-${section}`, () => passOneSection(userId, section));
      return { patched: section };
    }

    await step.run("pass-3-behavioral", () => passThreeBehavioral(userId));
    await step.run("pass-2-curate",      () => passTwoCuration(userId, mode));
    await step.run("pass-1-profile",     () => passOneProfile(userId, mode));
    await step.run("pass-4-routines",    () => passFourRoutineDetection(userId));
    await step.run("pass-5-decay",       () => passFiveDecay(userId));

    return { userId, mode };
  }
);

async function sweepByTimezone(): Promise<number> {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("profiles")
    .select("id, timezone")
    .eq("memory_enabled", true);
  if (!data) return 0;
  const now = new Date();
  let queued = 0;
  for (const p of data) {
    const tz = p.timezone || "UTC";
    const hourLocal = localHour(now, tz);
    if (hourLocal === 3) {
      await inngest.send({
        name: "memory.consolidate.requested",
        data: { userId: p.id, mode: "full" },
      });
      queued += 1;
    }
  }
  return queued;
}

function localHour(now: Date, tz: string): number {
  try {
    const fmt = new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", hour12: false });
    return parseInt(fmt.format(now), 10);
  } catch {
    return now.getUTCHours();
  }
}

// ===== Pass 3 — Behavioral model (pure SQL) =====
async function passThreeBehavioral(userId: string): Promise<void> {
  const supabase = createServiceClient();
  const sinceIso30 = new Date(Date.now() - 30 * 86400000).toISOString();
  const sinceIso60 = new Date(Date.now() - 60 * 86400000).toISOString();
  const sinceIso90 = new Date(Date.now() - 90 * 86400000).toISOString();
  const sinceIso7  = new Date(Date.now() -  7 * 86400000).toISOString();
  const sinceIso24 = new Date(Date.now() -      86400000).toISOString();

  const { data: activityHours } = await supabase
    .from("activity_log")
    .select("category, timestamp")
    .eq("user_id", userId)
    .gte("timestamp", sinceIso30);

  const byCategory: Record<string, number[]> = {};
  for (const a of activityHours ?? []) {
    const h = new Date(a.timestamp).getHours();
    if (!byCategory[a.category]) byCategory[a.category] = [];
    byCategory[a.category].push(h);
  }
  const typical_activity_hour: Record<string, number> = {};
  for (const [cat, hours] of Object.entries(byCategory)) {
    if (hours.length < 5) continue;
    const sorted = [...hours].sort((a, b) => a - b);
    typical_activity_hour[cat] = sorted[Math.floor(sorted.length / 2)];
  }

  const { data: routineLogs } = await supabase
    .from("routine_logs")
    .select("logged_date, completed")
    .eq("user_id", userId)
    .gte("logged_date", sinceIso60.slice(0, 10));

  const dowKeys = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
  const dowCounts: Record<string, { done: number; total: number }> = {};
  for (const k of dowKeys) dowCounts[k] = { done: 0, total: 0 };
  for (const r of routineLogs ?? []) {
    const dow = dowKeys[new Date(r.logged_date).getUTCDay()];
    dowCounts[dow].total += 1;
    if (r.completed) dowCounts[dow].done += 1;
  }
  const routine_completion_by_dow: Record<string, number> = {};
  for (const [k, v] of Object.entries(dowCounts)) {
    if (v.total >= 4) routine_completion_by_dow[k] = v.done / v.total;
  }

  const { data: completedTasks } = await supabase
    .from("tasks")
    .select("created_at, completed_at")
    .eq("user_id", userId)
    .gte("created_at", sinceIso90)
    .not("completed_at", "is", null);

  const lags = (completedTasks ?? [])
    .map((t) => (new Date(t.completed_at!).getTime() - new Date(t.created_at).getTime()) / 3600_000)
    .filter((h) => h >= 0)
    .sort((a, b) => a - b);
  const task_creation_to_completion_hours_p50 = lags.length > 0
    ? Math.round(lags[Math.floor(lags.length / 2)])
    : null;

  const { data: recentActs } = await supabase
    .from("activity_log")
    .select("timestamp, sentiment")
    .eq("user_id", userId)
    .gte("timestamp", sinceIso7);
  const byDay: Record<string, number[]> = {};
  for (const a of recentActs ?? []) {
    if (typeof a.sentiment !== "number") continue;
    const d = a.timestamp.slice(0, 10);
    if (!byDay[d]) byDay[d] = [];
    byDay[d].push(a.sentiment);
  }
  const dayAverages = Object.entries(byDay)
    .map(([d, vals]) => ({ d, avg: vals.reduce((s, x) => s + x, 0) / vals.length }))
    .sort((a, b) => a.d.localeCompare(b.d));
  let sentiment_trend_7d: number | null = null;
  if (dayAverages.length >= 3) {
    const n = dayAverages.length;
    const xs = dayAverages.map((_, i) => i);
    const ys = dayAverages.map((p) => p.avg);
    const meanX = xs.reduce((s, x) => s + x, 0) / n;
    const meanY = ys.reduce((s, y) => s + y, 0) / n;
    let num = 0, den = 0;
    for (let i = 0; i < n; i++) {
      num += (xs[i] - meanX) * (ys[i] - meanY);
      den += (xs[i] - meanX) ** 2;
    }
    sentiment_trend_7d = den > 0 ? num / den : 0;
  }

  const { data: recentMessages } = await supabase
    .from("messages")
    .select("input_method")
    .eq("user_id", userId)
    .eq("role", "user")
    .gte("created_at", sinceIso24);
  const totalMsg = recentMessages?.length ?? 0;
  const voiceMsg = (recentMessages ?? []).filter((m) => m.input_method === "voice").length;
  const voice_share_24h = totalMsg > 0 ? voiceMsg / totalMsg : null;

  const behavioral_model = {
    typical_activity_hour,
    routine_completion_by_dow,
    task_creation_to_completion_hours_p50,
    sentiment_trend_7d,
    voice_share_24h,
    updated_at: new Date().toISOString(),
  };

  await supabase.from("profiles").update({ behavioral_model }).eq("id", userId);
}

// ===== Pass 2 — Episode curation =====
async function passTwoCuration(userId: string, _mode: string): Promise<void> {
  const supabase = createServiceClient();
  const since = new Date(Date.now() - 26 * 3600_000).toISOString();

  const { data: newEps } = await supabase
    .from("episodes")
    .select("id, content, embedding, importance, entity_refs, source_message_ids")
    .eq("user_id", userId)
    .is("superseded_by", null)
    .is("archived_at", null)
    .gte("created_at", since);

  if (!newEps || newEps.length === 0) return;

  const merged = new Set<string>();
  for (let i = 0; i < newEps.length; i++) {
    if (merged.has(newEps[i].id)) continue;
    for (let j = i + 1; j < newEps.length; j++) {
      if (merged.has(newEps[j].id)) continue;
      const sim = cosineSim(newEps[i].embedding as number[] | null, newEps[j].embedding as number[] | null);
      if (sim > 0.92) {
        const keepIdx = (newEps[i].importance ?? 0) >= (newEps[j].importance ?? 0) ? i : j;
        const dropIdx = keepIdx === i ? j : i;
        const keep = newEps[keepIdx];
        const drop = newEps[dropIdx];
        const sourceUnion = Array.from(new Set([...(keep.source_message_ids ?? []), ...(drop.source_message_ids ?? [])]));
        await supabase
          .from("episodes")
          .update({ source_message_ids: sourceUnion })
          .eq("id", keep.id);
        await supabase
          .from("episodes")
          .update({ superseded_by: keep.id, superseded_reason: "dedup_merge" })
          .eq("id", drop.id);
        await supabase.from("memory_audit").insert({
          user_id: userId,
          kind: "merged",
          summary: `Merged duplicate episode into: "${keep.content.slice(0, 80)}"`,
          payload: { kept: keep.id, dropped: drop.id, similarity: sim, pre_drop_content: drop.content },
          episode_ids: [keep.id, drop.id],
          reversible: true,
        });
        merged.add(drop.id);
        if (dropIdx === i) break;
      }
    }
  }

  const { data: existing } = await supabase
    .from("episodes")
    .select("id, content, embedding, importance, entity_refs, source_message_ids")
    .eq("user_id", userId)
    .is("superseded_by", null)
    .is("archived_at", null)
    .lt("created_at", since);

  for (const ne of newEps) {
    if (merged.has(ne.id)) continue;
    for (const ee of existing ?? []) {
      const sim = cosineSim(ne.embedding as number[] | null, ee.embedding as number[] | null);
      if (sim < 0.88) continue;
      const sharedEntity = jsonHasOverlap(ne.entity_refs, ee.entity_refs);
      if (!sharedEntity) continue;

      const newImp = Math.min(1, (ee.importance ?? 0) + Math.min(0.15, 1 - (ee.importance ?? 0)));
      const sourceUnion = Array.from(new Set([
        ...((ee as { source_message_ids?: string[] }).source_message_ids ?? []),
        ...(ne.source_message_ids ?? []),
      ]));
      await supabase
        .from("episodes")
        .update({ importance: newImp, source_message_ids: sourceUnion })
        .eq("id", ee.id);
      await supabase
        .from("episodes")
        .update({ superseded_by: ee.id, superseded_reason: "cross_day_merge" })
        .eq("id", ne.id);
      await supabase.from("memory_audit").insert({
        user_id: userId,
        kind: "merged",
        summary: `Merged into existing: "${ee.content.slice(0, 80)}"`,
        payload: { kept: ee.id, dropped: ne.id, similarity: sim, pre_drop_content: ne.content },
        episode_ids: [ee.id, ne.id],
        reversible: true,
      });
      merged.add(ne.id);
      break;
    }
  }
}

function cosineSim(a: number[] | null, b: number[] | null): number {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom > 0 ? dot / denom : 0;
}

function jsonHasOverlap(a: unknown, b: unknown): boolean {
  if (!a || !b || typeof a !== "object" || typeof b !== "object") return false;
  const oa = a as Record<string, unknown>;
  const ob = b as Record<string, unknown>;
  for (const key of Object.keys(oa)) {
    const va = oa[key], vb = ob[key];
    if (Array.isArray(va) && Array.isArray(vb)) {
      const set = new Set(va.map(String));
      if (vb.some((x) => set.has(String(x)))) return true;
    }
  }
  return false;
}

// ===== Pass 1 — Profile section rewrite =====
const SECTION_TOKEN_BUDGET: Record<string, number> = {
  identity: 250,
  preferences: 350,
  current_themes: 300,
  active_projects: 300,
  ru_and_me: 300,
};

async function passOneProfile(userId: string, mode: string): Promise<void> {
  const supabase = createServiceClient();

  // First-run bootstrap: if profile_doc is empty AND mode != "rebuild",
  // promote to rebuild so we backfill from 180 days of history.
  if (mode !== "rebuild") {
    const { data: prof } = await supabase
      .from("profiles")
      .select("profile_doc")
      .eq("id", userId)
      .single();
    const doc = (prof?.profile_doc as Record<string, unknown>) ?? {};
    if (Object.keys(doc).length === 0) {
      mode = "rebuild";
    }
  }

  for (const section of Object.keys(SECTION_TOKEN_BUDGET)) {
    await rewriteSection(supabase, userId, section, mode);
  }
}

async function passOneSection(userId: string, section: string): Promise<void> {
  if (!SECTION_TOKEN_BUDGET[section]) return;
  const supabase = createServiceClient();
  await rewriteSection(supabase, userId, section, "patch");
}

async function rewriteSection(
  supabase: ReturnType<typeof createServiceClient>,
  userId: string,
  section: string,
  mode: string
): Promise<void> {
  const { data: profile } = await supabase
    .from("profiles")
    .select("profile_doc, profile_version, display_name, timezone")
    .eq("id", userId)
    .single();
  if (!profile) return;
  const doc = (profile.profile_doc as Record<string, { content: string; sources: string[] }>) ?? {};
  const currentContent = doc[section]?.content ?? "";

  const since = mode === "rebuild"
    ? new Date(Date.now() - 180 * 86400000).toISOString()
    : new Date(Date.now() - 26 * 3600_000).toISOString();

  const { data: episodes } = await supabase
    .from("episodes")
    .select("id, content, importance, source_message_ids, created_at")
    .eq("user_id", userId)
    .is("superseded_by", null)
    .is("archived_at", null)
    .gte("created_at", since)
    .gte("importance", 0.6)
    .order("importance", { ascending: false })
    .limit(25);

  const { data: corrections } = await supabase
    .from("memory_corrections")
    .select("id, original, corrected")
    .eq("user_id", userId)
    .eq("section", section)
    .is("applied_in_consolidation_at", null);

  if ((episodes?.length ?? 0) === 0 && (corrections?.length ?? 0) === 0 && currentContent) {
    return;
  }

  const newContent = await callSectionRewriter({
    section,
    budget: SECTION_TOKEN_BUDGET[section],
    currentContent,
    displayName: profile.display_name ?? null,
    timezone: profile.timezone ?? "UTC",
    episodes: episodes ?? [],
    corrections: corrections ?? [],
  });

  if (!newContent || newContent === currentContent) {
    if (corrections && corrections.length > 0) {
      await supabase
        .from("memory_corrections")
        .update({ applied_in_consolidation_at: new Date().toISOString() })
        .in("id", corrections.map((c) => c.id));
    }
    return;
  }

  const sources = Array.from(new Set([
    ...(doc[section]?.sources ?? []),
    ...((episodes ?? []).flatMap((e) => e.source_message_ids ?? [])),
  ]));

  doc[section] = {
    content: newContent,
    sources,
  };

  await supabase
    .from("profiles")
    .update({
      profile_doc: doc,
      profile_version: (profile.profile_version ?? 0) + 1,
    })
    .eq("id", userId);

  if (corrections && corrections.length > 0) {
    await supabase
      .from("memory_corrections")
      .update({ applied_in_consolidation_at: new Date().toISOString() })
      .in("id", corrections.map((c) => c.id));
  }

  await supabase.from("memory_audit").insert({
    user_id: userId,
    kind: "profile_rewrite",
    summary: `Rewrote ${section}`,
    payload: { section, before: currentContent, after: newContent, episode_ids: (episodes ?? []).map((e) => e.id) },
    reversible: true,
  });
}

async function callSectionRewriter(input: {
  section: string;
  budget: number;
  currentContent: string;
  displayName: string | null;
  timezone: string;
  episodes: Array<{ id: string; content: string; importance: number }>;
  corrections: Array<{ original: string; corrected: string }>;
}): Promise<string | null> {
  const apiKey = process.env.ANTHROPIC_CONSOLIDATION_KEY;
  if (!apiKey) {
    console.error("ANTHROPIC_CONSOLIDATION_KEY not set; skipping consolidation");
    return null;
  }
  const Anthropic = (await import("@anthropic-ai/sdk")).default;
  const client = new Anthropic({ apiKey });

  const epLines = input.episodes
    .map((e) => `- (${e.importance.toFixed(2)}) ${e.content}`)
    .join("\n");
  const corrLines = input.corrections
    .map((c) => c.corrected
      ? c.original
        ? `- replace "${c.original}" with "${c.corrected}"`
        : `- add: ${c.corrected}`
      : `- remove "${c.original}"`)
    .join("\n");

  const sys = `You are a memory consolidator for Ru, an AI life organizer. Output the rewritten content of ONE profile section. Constraints:
- Section: ${input.section}
- Target length: under ${input.budget} tokens, ideally 2-6 short factual sentences.
- Style: third person, neutral, no opinions, no first-person "I".
- Do not fabricate. Only include facts supported by the existing content, episodes, or corrections below.
- If episodes contradict prior content, prefer the episodes (the user just confirmed them).
- If corrections are given, honor them strictly.
- Output ONLY the new section content. No headers, no quotes, no commentary.`;
  const user = `Existing ${input.section}:
${input.currentContent || "(empty)"}

User: ${input.displayName ?? "(unknown)"}, ${input.timezone}

Recent high-importance episodes:
${epLines || "(none)"}

User corrections to apply:
${corrLines || "(none)"}

Rewrite the section.`;

  try {
    const res = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: Math.ceil(input.budget * 1.3),
      system: sys,
      messages: [{ role: "user", content: user }],
    });
    const text = res.content.find((b) => b.type === "text");
    if (!text || text.type !== "text") return null;
    return text.text.trim();
  } catch (e) {
    console.error("section rewriter failed", e);
    return null;
  }
}

// ===== Pass 4 — Routine detection v2 =====
async function passFourRoutineDetection(userId: string): Promise<void> {
  const supabase = createServiceClient();
  const since = new Date(Date.now() - 14 * 86400000).toISOString();

  const { data: acts } = await supabase
    .from("activity_log")
    .select("activity, category, timestamp")
    .eq("user_id", userId)
    .gte("timestamp", since);
  if (!acts || acts.length === 0) return;

  const buckets = new Map<string, { activity: string; category: string; times: number[] }>();
  for (const a of acts) {
    const key = a.activity.toLowerCase().trim();
    if (!buckets.has(key)) buckets.set(key, { activity: a.activity, category: a.category, times: [] });
    buckets.get(key)!.times.push(new Date(a.timestamp).getTime());
  }

  for (const bucket of buckets.values()) {
    if (bucket.times.length < 4) continue;
    const hours = bucket.times.map((t) => new Date(t).getHours());
    const mean = hours.reduce((s, h) => s + h, 0) / hours.length;
    const variance = hours.reduce((s, h) => s + (h - mean) ** 2, 0) / hours.length;
    const stdev = Math.sqrt(variance);
    if (stdev >= 2) continue;

    const { data: existing } = await supabase
      .from("routines")
      .select("id")
      .eq("user_id", userId)
      .ilike("title", bucket.activity)
      .maybeSingle();
    if (existing) continue;

    const vote = await routineDetectionVote({
      activity: bucket.activity,
      occurrences: bucket.times.length,
      hourMean: Math.round(mean),
      stdev,
    });
    if (!vote) continue;

    const timeOfDay = `${Math.round(mean).toString().padStart(2, "0")}:00:00`;
    const confidence = Math.min(1, bucket.times.length / 10);

    const { data: inserted } = await supabase
      .from("routines")
      .insert({
        user_id: userId,
        title: bucket.activity,
        frequency: "daily",
        time_of_day: timeOfDay,
        origin: "auto_detected",
        detection_confidence: confidence,
        nudge_level: "gentle",
        is_active: false,
      })
      .select()
      .single();

    if (inserted) {
      await inngest.send({
        name: "routine.detected",
        data: { userId, routineId: inserted.id, title: bucket.activity, confidence },
      });
    }
  }
}

async function routineDetectionVote(input: {
  activity: string;
  occurrences: number;
  hourMean: number;
  stdev: number;
}): Promise<boolean> {
  const apiKey = process.env.ANTHROPIC_CONSOLIDATION_KEY;
  if (!apiKey) return false;
  const Anthropic = (await import("@anthropic-ai/sdk")).default;
  const client = new Anthropic({ apiKey });
  try {
    const res = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 16,
      system: 'You vote yes or no on whether an activity pattern should be promoted to a tracked "routine". Reply ONLY "yes" or "no".',
      messages: [{
        role: "user",
        content: `Activity: "${input.activity}"\nOccurrences in last 14 days: ${input.occurrences}\nTypical hour: ${input.hourMean}\nHour stdev: ${input.stdev.toFixed(2)}\n\nShould this be auto-promoted to a routine the user can opt into?`,
      }],
    });
    const text = res.content.find((b) => b.type === "text");
    if (!text || text.type !== "text") return false;
    return /^yes/i.test(text.text.trim());
  } catch {
    return false;
  }
}

// ===== Pass 5 — Decay =====
async function passFiveDecay(userId: string): Promise<void> {
  const supabase = createServiceClient();
  const cutoff = new Date(Date.now() - 90 * 86400000).toISOString();

  const { data: stale } = await supabase
    .from("episodes")
    .select("id")
    .eq("user_id", userId)
    .lt("importance", 0.3)
    .lt("last_referenced_at", cutoff)
    .is("superseded_by", null)
    .is("archived_at", null);

  if (stale && stale.length > 0) {
    const ids = stale.map((e) => e.id);
    await supabase
      .from("episodes")
      .update({ archived_at: new Date().toISOString() })
      .in("id", ids);
    await supabase.from("memory_audit").insert({
      user_id: userId,
      kind: "forgot",
      summary: `Archived ${ids.length} stale low-importance episode(s).`,
      payload: { episode_ids: ids, rule: "stale_low_importance_90d" },
      episode_ids: ids,
      reversible: false,
    });
  }
}
