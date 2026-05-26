import { inngest } from "../client";
import { createServiceClient } from "@/lib/supabase/service";
import { deliverRawEmail } from "@/lib/notifications";

/**
 * Every hour at :00 — find users whose digest_hour matches the current local
 * hour in their timezone, and email them a morning briefing. Skipped if the
 * user has notify_email_enabled = false or digest_enabled = false.
 *
 * Digest contents:
 *   - tasks due today (open)
 *   - reminders due today (pending)
 *   - calendar events today (from cached calendar_events)
 *   - count of pending extracted items from gmail
 */
export const dailyDigest = inngest.createFunction(
  { id: "daily-digest", triggers: [{ cron: "0 * * * *" }] },
  async ({ step }) => {
    const users = await step.run("find-users-for-this-hour", async () => {
      const supabase = createServiceClient();
      const { data, error } = await supabase
        .from("profiles")
        .select("id, display_name, timezone, notify_digest_hour, notify_email_address")
        .eq("notify_digest_enabled", true)
        .eq("notify_email_enabled", true);
      if (error) throw new Error(error.message);

      const nowUtc = new Date();
      return (data ?? []).filter((u) => {
        const tz = u.timezone ?? "UTC";
        const hour = parseInt(
          new Intl.DateTimeFormat("en-US", {
            hour: "2-digit",
            hour12: false,
            timeZone: tz,
          }).format(nowUtc),
          10,
        );
        return hour === u.notify_digest_hour;
      });
    });

    if (users.length === 0) return { sent: 0 };

    let sent = 0;
    for (const u of users) {
      await step.run(`digest-${u.id}`, async () => {
        const supabase = createServiceClient();
        const startLocalDayIso = startOfLocalDayIso(u.timezone ?? "UTC");
        const endLocalDayIso = endOfLocalDayIso(u.timezone ?? "UTC");

        const [tasksRes, remindersRes, eventsRes, extractedRes, authRes] = await Promise.all([
          supabase
            .from("tasks")
            .select("title, due_at")
            .eq("user_id", u.id)
            .in("status", ["pending", "in_progress"])
            .gte("due_at", startLocalDayIso)
            .lte("due_at", endLocalDayIso)
            .order("due_at"),
          supabase
            .from("reminders")
            .select("title, remind_at")
            .eq("user_id", u.id)
            .eq("status", "pending")
            .gte("remind_at", startLocalDayIso)
            .lte("remind_at", endLocalDayIso)
            .order("remind_at"),
          supabase
            .from("calendar_events")
            .select("title, start_at, location")
            .eq("user_id", u.id)
            .gte("start_at", startLocalDayIso)
            .lte("start_at", endLocalDayIso)
            .order("start_at"),
          supabase
            .from("extracted_items")
            .select("id", { count: "exact", head: true })
            .eq("user_id", u.id)
            .eq("status", "pending"),
          supabase.auth.admin.getUserById(u.id),
        ]);

        const to = u.notify_email_address ?? authRes.data?.user?.email;
        if (!to) return;

        const tasks = tasksRes.data ?? [];
        const reminders = remindersRes.data ?? [];
        const events = eventsRes.data ?? [];
        const pendingExtracted = extractedRes.count ?? 0;

        if (
          tasks.length === 0 &&
          reminders.length === 0 &&
          events.length === 0 &&
          pendingExtracted === 0
        ) {
          return;
        }

        const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
        const firstName = (u.display_name ?? "").split(" ")[0]?.trim().toLowerCase() ?? null;
        const greeting = firstName ? `good morning, ${firstName}.` : "good morning.";

        const html = renderDigestHtml({
          greeting,
          tasks: tasks
            .filter((t): t is { title: string; due_at: string } => !!t.due_at)
            .map((t) => ({ title: t.title, time: t.due_at })),
          reminders: reminders.map((r) => ({ title: r.title, time: r.remind_at })),
          events: events.map((e) => ({ title: e.title, time: e.start_at, location: e.location ?? null })),
          pendingExtracted,
          appUrl,
          tz: u.timezone ?? "UTC",
        });

        const text = renderDigestText({
          greeting,
          tasks: tasks.map((t) => t.title),
          reminders: reminders.map((r) => r.title),
          events: events.map((e) => e.title),
          pendingExtracted,
          appUrl,
        });

        const ok = await deliverRawEmail({
          to,
          subject: `${greeting} ${digestSubjectSuffix(tasks.length, reminders.length, events.length)}`,
          html,
          text,
        });

        if (ok) {
          sent++;
          await supabase.from("notifications").insert({
            user_id: u.id,
            kind: "daily_digest",
            title: greeting,
            body: `${tasks.length} tasks · ${reminders.length} reminders · ${events.length} events · ${pendingExtracted} in your inbox`,
            url: "/today",
            channels: { email: true, in_app: true },
          });
        }
      });
    }

    return { sent };
  },
);

function digestSubjectSuffix(tasks: number, reminders: number, events: number): string {
  const parts: string[] = [];
  if (events > 0) parts.push(`${events} event${events === 1 ? "" : "s"}`);
  if (tasks > 0) parts.push(`${tasks} task${tasks === 1 ? "" : "s"}`);
  if (reminders > 0) parts.push(`${reminders} reminder${reminders === 1 ? "" : "s"}`);
  if (parts.length === 0) return "today's shape";
  return parts.join(" · ");
}

function startOfLocalDayIso(tz: string): string {
  const now = new Date();
  const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" });
  const ymd = fmt.format(now);
  return new Date(`${ymd}T00:00:00`).toISOString();
}

function endOfLocalDayIso(tz: string): string {
  const now = new Date();
  const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" });
  const ymd = fmt.format(now);
  return new Date(`${ymd}T23:59:59`).toISOString();
}

function fmtTime(iso: string, tz: string): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" }).format(new Date(iso));
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

interface DigestItem { title: string; time: string; location?: string | null }
interface DigestParams {
  greeting: string;
  tasks: DigestItem[];
  reminders: DigestItem[];
  events: DigestItem[];
  pendingExtracted: number;
  appUrl: string;
  tz: string;
}

function renderDigestHtml(p: DigestParams): string {
  const section = (eyebrow: string, items: DigestItem[], color: string) => {
    if (items.length === 0) return "";
    const rows = items
      .map(
        (it) =>
          `<tr><td style="padding:8px 0;border-top:1px solid #ece4d4;"><div style="font-family:'SF Mono',Menlo,monospace;font-size:10px;letter-spacing:0.18em;text-transform:uppercase;color:#8a7f6e;">${fmtTime(it.time, p.tz)}</div><div style="font-size:15px;color:#1a1714;margin-top:2px;">${escapeHtml(it.title)}</div>${it.location ? `<div style="font-size:12px;color:#8a7f6e;margin-top:2px;">${escapeHtml(it.location)}</div>` : ""}</td></tr>`,
      )
      .join("");
    return `<tr><td style="padding:24px 36px 4px 36px;"><div style="display:inline-block;width:8px;height:8px;background:${color};border-radius:2px;margin-right:8px;vertical-align:middle;"></div><span style="font-family:'SF Mono',Menlo,monospace;font-size:10px;letter-spacing:0.22em;text-transform:uppercase;color:#8a7f6e;">${eyebrow} · ${items.length}</span></td></tr><tr><td style="padding:0 36px;"><table width="100%" cellpadding="0" cellspacing="0">${rows}</table></td></tr>`;
  };

  const extractedBlock = p.pendingExtracted > 0
    ? `<tr><td style="padding:24px 36px 4px 36px;"><div style="display:inline-block;width:8px;height:8px;background:#0fb5ba;border-radius:2px;margin-right:8px;vertical-align:middle;"></div><span style="font-family:'SF Mono',Menlo,monospace;font-size:10px;letter-spacing:0.22em;text-transform:uppercase;color:#8a7f6e;">from your inbox · ${p.pendingExtracted}</span></td></tr><tr><td style="padding:6px 36px 0 36px;font-size:14px;color:#3a342c;">${p.pendingExtracted} thing${p.pendingExtracted === 1 ? "" : "s"} waiting for review. <a href="${p.appUrl}/inbox/extracted" style="color:#1a1714;">open inbox →</a></td></tr>`
    : "";

  return `<!doctype html>
<html><body style="margin:0;padding:0;background:#f6f1e7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1a1714;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f6f1e7;padding:32px 16px;">
<tr><td align="center">
<table role="presentation" width="540" cellpadding="0" cellspacing="0" border="0" style="max-width:540px;width:100%;background:#fbf7ee;border:1px solid #e5dccb;border-radius:8px;">
<tr><td style="padding:32px 36px 4px 36px;"><div style="font-family:'SF Mono',Menlo,monospace;font-size:10px;letter-spacing:0.22em;text-transform:uppercase;color:#8a7f6e;">today's shape</div></td></tr>
<tr><td style="padding:6px 36px 0 36px;"><h1 style="margin:0;font-family:Georgia,serif;font-weight:500;font-size:28px;line-height:1.15;letter-spacing:-0.01em;color:#1a1714;">${escapeHtml(p.greeting)}</h1></td></tr>
${section("calendar", p.events, "#d89a3f")}
${section("tasks", p.tasks, "#3753d3")}
${section("reminders", p.reminders, "#e96952")}
${extractedBlock}
<tr><td style="padding:28px 36px 32px 36px;"><a href="${p.appUrl}/today" style="display:inline-block;background:#1a1714;color:#fbf7ee;text-decoration:none;font-size:13px;font-weight:500;padding:11px 18px;border-radius:6px;">Open today →</a></td></tr>
<tr><td style="padding:0 36px 28px 36px;border-top:1px solid #e5dccb;"><p style="margin:20px 0 0 0;font-size:12px;color:#8a7f6e;">— Ru<br/><a href="${p.appUrl}/settings/connections" style="color:#8a7f6e;text-decoration:underline;">manage digest</a></p></td></tr>
</table></td></tr></table></body></html>`;
}

function renderDigestText(p: { greeting: string; tasks: string[]; reminders: string[]; events: string[]; pendingExtracted: number; appUrl: string }): string {
  const lines: string[] = [p.greeting, ""];
  if (p.events.length) {
    lines.push(`CALENDAR · ${p.events.length}`);
    p.events.forEach((e) => lines.push(`  · ${e}`));
    lines.push("");
  }
  if (p.tasks.length) {
    lines.push(`TASKS · ${p.tasks.length}`);
    p.tasks.forEach((t) => lines.push(`  · ${t}`));
    lines.push("");
  }
  if (p.reminders.length) {
    lines.push(`REMINDERS · ${p.reminders.length}`);
    p.reminders.forEach((r) => lines.push(`  · ${r}`));
    lines.push("");
  }
  if (p.pendingExtracted) {
    lines.push(`FROM YOUR INBOX · ${p.pendingExtracted} waiting`);
    lines.push("");
  }
  lines.push(`Open: ${p.appUrl}/today`);
  return lines.join("\n");
}
