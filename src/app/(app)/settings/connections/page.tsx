// Settings → Connections.
//
// Outside-in surface: Google account hookup (gmail + calendar) plus the
// notification preferences that gate everything ru sends. Mirrors the
// canonical settings page layout — HeroBand, 3-tile Ledger, then a sequence
// of SectionHead-delimited blocks.

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { HeroBand } from "@/components/editorial/hero-band";
import { SectionHead } from "@/components/editorial/section-head";
import { GmailCard } from "@/components/settings/connections/gmail-card";
import { CalendarCard } from "@/components/settings/connections/calendar-card";
import { ChannelsRow } from "@/components/settings/connections/channels-row";
import { QuietHours } from "@/components/settings/connections/quiet-hours";
import { DigestControl } from "@/components/settings/connections/digest-control";
import { EmailInput } from "@/components/settings/connections/email-input";

export const dynamic = "force-dynamic";

interface SearchParams {
  ok?: string;
  err?: string;
}

export default async function ConnectionsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const params = await searchParams;

  const { data: integration } = await supabase
    .from("google_integrations")
    .select(
      "email, gmail_extraction_enabled, calendar_sync_enabled, last_gmail_sync_at, last_calendar_sync_at",
    )
    .eq("user_id", user.id)
    .maybeSingle();

  const { data: profile } = await supabase
    .from("profiles")
    .select(
      "notify_email_enabled, notify_push_enabled, notify_inapp_enabled, notify_quiet_start, notify_quiet_end, notify_digest_enabled, notify_digest_hour, notify_email_address",
    )
    .eq("id", user.id)
    .single();

  const gmailConnected = Boolean(integration);
  const calendarConnected = Boolean(integration);

  // Ledger string for the digest tile — collapses to "off" when disabled,
  // otherwise reads as "on @ 8am" so it scans at a glance.
  const digestEnabled = profile?.notify_digest_enabled ?? false;
  const digestHour = profile?.notify_digest_hour ?? 8;
  const digestLabel = digestEnabled
    ? `on @ ${formatLedgerHour(digestHour)}`
    : "off";

  return (
    <div className="mx-auto w-full max-w-5xl px-4 pt-8 pb-32 sm:px-6 sm:pt-10">
      <Banner ok={params.ok} err={params.err} />

      <HeroBand
        eyebrow="settings · connections"
        title="outside in."
        subtitle="let ru read your inbox and calendar — it'll suggest tasks, pull events into today, and never send anything on your behalf."
      />

      <div className="mt-7 grid grid-cols-3 gap-2.5 sm:gap-3">
        <Ledger label="gmail" value={gmailConnected && integration?.gmail_extraction_enabled !== false ? "connected" : gmailConnected ? "paused" : "off"} />
        <Ledger label="calendar" value={calendarConnected && integration?.calendar_sync_enabled !== false ? "connected" : calendarConnected ? "paused" : "off"} />
        <Ledger label="email digest" value={digestLabel} />
      </div>

      <div className="mt-12 flex flex-col gap-12">
        <section>
          <SectionHead
            eyebrow="google"
            sublabel="inbox + calendar"
            count={(integration?.gmail_extraction_enabled ? 1 : 0) + (integration?.calendar_sync_enabled ? 1 : 0)}
            accent="var(--entity-insight)"
          />
          <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-5">
            <GmailCard
              connected={gmailConnected}
              email={integration?.email ?? null}
              extractionEnabled={integration?.gmail_extraction_enabled ?? false}
              lastSyncedAt={integration?.last_gmail_sync_at ?? null}
            />
            <CalendarCard
              connected={calendarConnected}
              syncEnabled={integration?.calendar_sync_enabled ?? false}
              lastSyncedAt={integration?.last_calendar_sync_at ?? null}
            />
          </div>
        </section>

        <section>
          <SectionHead
            eyebrow="notifications"
            sublabel="where ru reaches you"
            count={
              [
                profile?.notify_inapp_enabled,
                profile?.notify_push_enabled,
                profile?.notify_email_enabled,
              ].filter(Boolean).length
            }
            accent="var(--entity-task)"
          />
          <div className="mt-5 flex flex-col gap-3">
            <SubCard eyebrow="channels" hint="pick the surfaces ru can use">
              <ChannelsRow
                inapp={profile?.notify_inapp_enabled ?? true}
                push={profile?.notify_push_enabled ?? true}
                email={profile?.notify_email_enabled ?? true}
              />
            </SubCard>

            <SubCard eyebrow="quiet hours" hint="when ru should hush">
              <QuietHours
                start={profile?.notify_quiet_start ?? null}
                end={profile?.notify_quiet_end ?? null}
              />
            </SubCard>

            <SubCard eyebrow="daily digest" hint="the morning brief">
              <DigestControl
                enabled={profile?.notify_digest_enabled ?? false}
                hour={profile?.notify_digest_hour ?? 8}
              />
            </SubCard>

            <SubCard eyebrow="notification email" hint="where mail lands">
              <EmailInput
                value={profile?.notify_email_address ?? null}
                placeholder={user.email ?? "you@example.com"}
              />
            </SubCard>
          </div>
        </section>
      </div>
    </div>
  );
}

function Ledger({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1.5 rounded-2xl border border-[var(--hairline)] bg-[var(--card)] px-4 py-3 sm:px-5 sm:py-4">
      <span
        className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground"
        style={{ fontVariationSettings: "'wght' 600, 'wdth' 100" }}
      >
        {label}
      </span>
      <span
        className="font-display lowercase leading-[1.05] text-foreground"
        style={{
          fontSize: "clamp(18px, 2.4vw, 24px)",
          fontVariationSettings: "'wght' 560, 'opsz' 48",
          letterSpacing: "-0.02em",
        }}
      >
        {value}
      </span>
    </div>
  );
}

function SubCard({
  eyebrow,
  hint,
  children,
}: {
  eyebrow: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-[var(--hairline)] bg-[var(--card)] p-5 md:p-6">
      <div className="mb-4 flex items-baseline gap-3">
        <span
          className="font-mono text-[10px] uppercase tracking-[0.2em] text-foreground"
          style={{ fontVariationSettings: "'wght' 640" }}
        >
          {eyebrow}
        </span>
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground/70">
          {hint}
        </span>
      </div>
      {children}
    </div>
  );
}

function Banner({ ok, err }: { ok?: string; err?: string }) {
  if (!ok && !err) return null;
  const isOk = Boolean(ok && !err);
  const message = isOk
    ? "google connected — ru can read your inbox and calendar now."
    : err === "not_configured"
      ? "google oauth isn't set up on this deployment."
      : err === "missing_code"
        ? "the google sign-in was canceled."
        : err === "invalid_state"
          ? "that sign-in attempt expired — try again."
          : err === "exchange_failed"
            ? "couldn't finish the google handshake."
            : err === "access_denied"
              ? "ru needs the gmail + calendar scopes to read your inbox."
              : "something went wrong connecting google.";
  return (
    <div
      role="status"
      className="mb-5 flex items-start gap-3 rounded-xl border px-4 py-3"
      style={{
        background: isOk
          ? "color-mix(in oklch, var(--entity-insight), transparent 90%)"
          : "color-mix(in oklch, var(--entity-reminder), transparent 88%)",
        borderColor: isOk ? "var(--entity-insight)" : "var(--entity-reminder)",
      }}
    >
      <span
        aria-hidden
        className="mt-[6px] h-2 w-2 shrink-0 rounded-[2px]"
        style={{ background: isOk ? "var(--entity-insight)" : "var(--entity-reminder)" }}
      />
      <p className="text-[13.5px] text-foreground" style={{ fontVariationSettings: "'wght' 480" }}>
        {message}
      </p>
    </div>
  );
}

function formatLedgerHour(h: number): string {
  if (h === 0) return "12am";
  if (h === 12) return "12pm";
  if (h < 12) return `${h}am`;
  return `${h - 12}pm`;
}
