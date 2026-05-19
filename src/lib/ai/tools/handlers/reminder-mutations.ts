import type { ToolContext, ToolOutcome } from "../executor";

/**
 * Reminder mutations — complete (dismiss), snooze (push remind_at forward),
 * modify (change title/time/recurrence), delete. Looked up by id or by fuzzy
 * title match (ilike — there's no pg_trgm RPC for reminders yet).
 */

async function findReminder(
  ctx: ToolContext,
  hint: string,
): Promise<{ id: string; title: string; remind_at: string } | null> {
  const h = hint.trim();
  if (!h) return null;

  if (/^[0-9a-f-]{36}$/i.test(h)) {
    const { data } = await ctx.supabase
      .from("reminders")
      .select("id, title, remind_at")
      .eq("user_id", ctx.userId)
      .eq("id", h)
      .maybeSingle();
    if (data) return data;
  }

  // Most-recent pending reminder whose title matches.
  const { data } = await ctx.supabase
    .from("reminders")
    .select("id, title, remind_at")
    .eq("user_id", ctx.userId)
    .eq("status", "pending")
    .ilike("title", `%${h}%`)
    .order("remind_at", { ascending: true })
    .limit(1);
  return data?.[0] ?? null;
}

export async function completeReminder(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolOutcome> {
  const hint = String(args.reminder ?? args.reminder_id ?? args.reminder_description ?? "");
  const reminder = await findReminder(ctx, hint);
  if (!reminder) return { ok: false, message: `No matching reminder for "${hint}".` };

  const { error } = await ctx.supabase
    .from("reminders")
    .update({ status: "dismissed" })
    .eq("id", reminder.id)
    .eq("user_id", ctx.userId);
  if (error) return { ok: false, message: error.message };

  return {
    ok: true,
    message: `Dismissed: ${reminder.title}`,
    cardKind: "reminder",
    card: { id: reminder.id, title: reminder.title, remind_at: reminder.remind_at, status: "dismissed" },
  };
}

export async function snoozeReminder(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolOutcome> {
  const hint = String(args.reminder ?? args.reminder_id ?? args.reminder_description ?? "");
  const reminder = await findReminder(ctx, hint);
  if (!reminder) return { ok: false, message: `No matching reminder for "${hint}".` };

  // Accept either an absolute new_remind_at or a relative duration in minutes.
  let nextIso: string | null = null;
  if (args.new_remind_at) {
    const parsed = new Date(String(args.new_remind_at));
    if (!Number.isNaN(parsed.getTime())) nextIso = parsed.toISOString();
  }
  if (!nextIso && args.snooze_minutes != null) {
    const mins = Number(args.snooze_minutes);
    if (Number.isFinite(mins) && mins > 0) {
      const from = new Date(reminder.remind_at);
      const base = from.getTime() > Date.now() ? from : new Date();
      nextIso = new Date(base.getTime() + mins * 60_000).toISOString();
    }
  }
  if (!nextIso) {
    return { ok: false, message: "Provide either new_remind_at (ISO) or snooze_minutes." };
  }

  const { error } = await ctx.supabase
    .from("reminders")
    .update({ remind_at: nextIso, status: "pending" })
    .eq("id", reminder.id)
    .eq("user_id", ctx.userId);
  if (error) return { ok: false, message: error.message };

  return {
    ok: true,
    message: `Snoozed ${reminder.title} → ${new Date(nextIso).toLocaleString()}`,
    cardKind: "reminder",
    card: { id: reminder.id, title: reminder.title, remind_at: nextIso, status: "pending" },
  };
}

export async function modifyReminder(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolOutcome> {
  const hint = String(args.reminder ?? args.reminder_id ?? args.reminder_description ?? "");
  const reminder = await findReminder(ctx, hint);
  if (!reminder) return { ok: false, message: `No matching reminder for "${hint}".` };

  const updates = (args.updates as Record<string, unknown>) ?? {};
  if (Object.keys(updates).length === 0) return { ok: false, message: "no updates given" };

  const allowed: Record<string, unknown> = {};
  if (updates.title != null) allowed.title = String(updates.title);
  if (updates.remind_at != null) allowed.remind_at = String(updates.remind_at);
  if (updates.is_recurring != null) allowed.is_recurring = Boolean(updates.is_recurring);
  if (updates.recurrence_rule != null) allowed.recurrence_rule = String(updates.recurrence_rule);

  if (Object.keys(allowed).length === 0) {
    return { ok: false, message: "no recognized fields in updates" };
  }

  const { data, error } = await ctx.supabase
    .from("reminders")
    .update(allowed as never)
    .eq("id", reminder.id)
    .eq("user_id", ctx.userId)
    .select()
    .single();
  if (error || !data) return { ok: false, message: error?.message ?? "update failed" };

  return {
    ok: true,
    message: `Updated reminder: ${data.title}`,
    cardKind: "reminder",
    card: { id: data.id, title: data.title, remind_at: data.remind_at, is_recurring: data.is_recurring },
  };
}

export async function deleteReminder(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolOutcome> {
  const hint = String(args.reminder ?? args.reminder_id ?? args.reminder_description ?? "");
  const reminder = await findReminder(ctx, hint);
  if (!reminder) return { ok: false, message: `No matching reminder for "${hint}".` };

  const { error } = await ctx.supabase
    .from("reminders")
    .delete()
    .eq("id", reminder.id)
    .eq("user_id", ctx.userId);
  if (error) return { ok: false, message: error.message };

  return { ok: true, message: `Deleted reminder: ${reminder.title}` };
}
