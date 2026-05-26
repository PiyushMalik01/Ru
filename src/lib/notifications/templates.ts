import type { DispatchInput } from "./types";

/**
 * Editorial email template — matches the in-app design language. One layout,
 * tone tuned by notification kind. Plain-text fallback handcrafted for each.
 */

interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

export function renderEmail(input: DispatchInput, appUrl: string): RenderedEmail {
  const cta = input.url ? `${appUrl}${input.url}` : appUrl;
  const ctaLabel = ctaLabelFor(input.kind);
  const eyebrow = eyebrowFor(input.kind);
  const subject = subjectFor(input);

  const html = baseTemplate({
    eyebrow,
    title: input.title,
    body: input.body ?? "",
    cta,
    ctaLabel,
    footerLink: `${appUrl}/settings/connections`,
  });
  const text = `${eyebrow.toUpperCase()}\n\n${input.title}\n\n${input.body ?? ""}\n\n${ctaLabel}: ${cta}\n\n— Ru\nManage notifications: ${appUrl}/settings/connections`;
  return { subject, html, text };
}

function subjectFor(input: DispatchInput): string {
  switch (input.kind) {
    case "daily_digest":
      return input.title;
    case "task_overdue":
      return `Overdue · ${input.title}`;
    case "task_due_soon":
      return `Due soon · ${input.title}`;
    case "reminder_due":
      return `Reminder · ${input.title}`;
    case "routine_missed":
      return `Routine · ${input.title}`;
    case "streak_milestone":
      return input.title;
    case "plan_deadline":
      return `Plan · ${input.title}`;
    case "suggestion_urgent":
      return `Ru noticed · ${input.title}`;
    case "gmail_extracted":
      return `Ru caught something in your inbox`;
    case "calendar_event_soon":
      return `Coming up · ${input.title}`;
    default:
      return input.title;
  }
}

function eyebrowFor(kind: DispatchInput["kind"]): string {
  switch (kind) {
    case "daily_digest": return "today";
    case "reminder_due": return "reminder";
    case "task_due_soon":
    case "task_overdue": return "task";
    case "routine_missed":
    case "streak_milestone": return "routine";
    case "plan_deadline": return "plan";
    case "suggestion_urgent": return "ru noticed";
    case "gmail_extracted": return "from your inbox";
    case "calendar_event_soon": return "calendar";
    default: return "ru";
  }
}

function ctaLabelFor(kind: DispatchInput["kind"]): string {
  switch (kind) {
    case "gmail_extracted": return "Review →";
    case "daily_digest": return "Open today →";
    case "calendar_event_soon": return "Open calendar →";
    default: return "Open in Ru →";
  }
}

interface TemplateParams {
  eyebrow: string;
  title: string;
  body: string;
  cta: string;
  ctaLabel: string;
  footerLink: string;
}

/**
 * Inline-styles only (no <style> blocks survive Gmail). Palette tuned to
 * match the in-app warm-editorial language: cream paper, ink text,
 * cobalt accent. Display font is system serif (Georgia) as a safe fallback
 * for Fraunces — most clients won't pull a custom font.
 */
function baseTemplate({ eyebrow, title, body, cta, ctaLabel, footerLink }: TemplateParams): string {
  const safeBody = escapeHtml(body).replace(/\n/g, "<br/>");
  return `<!doctype html>
<html>
<body style="margin:0;padding:0;background:#f6f1e7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1a1714;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f6f1e7;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="540" cellpadding="0" cellspacing="0" border="0" style="max-width:540px;width:100%;background:#fbf7ee;border:1px solid #e5dccb;border-radius:8px;">
          <tr>
            <td style="padding:32px 36px 8px 36px;">
              <div style="font-family:'SF Mono',Menlo,Monaco,Consolas,monospace;font-size:10px;letter-spacing:0.22em;text-transform:uppercase;color:#8a7f6e;">
                ${escapeHtml(eyebrow)}
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 36px 4px 36px;">
              <h1 style="margin:0;font-family:Georgia,'Times New Roman',serif;font-weight:500;font-size:28px;line-height:1.15;letter-spacing:-0.01em;color:#1a1714;">
                ${escapeHtml(title)}
              </h1>
            </td>
          </tr>
          ${
            body
              ? `<tr><td style="padding:14px 36px 0 36px;font-size:15px;line-height:1.55;color:#3a342c;">${safeBody}</td></tr>`
              : ""
          }
          <tr>
            <td style="padding:28px 36px 36px 36px;">
              <a href="${cta}" style="display:inline-block;background:#1a1714;color:#fbf7ee;text-decoration:none;font-size:13px;font-weight:500;padding:11px 18px;border-radius:6px;letter-spacing:0.01em;">
                ${escapeHtml(ctaLabel)}
              </a>
            </td>
          </tr>
          <tr>
            <td style="padding:0 36px 28px 36px;border-top:1px solid #e5dccb;">
              <p style="margin:20px 0 0 0;font-size:12px;line-height:1.5;color:#8a7f6e;">
                — Ru<br/>
                <a href="${footerLink}" style="color:#8a7f6e;text-decoration:underline;">manage notifications</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
