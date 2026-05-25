import { ChatGPTConnection } from "@/components/settings/chatgpt-connection";
import { BYOKForm } from "@/components/settings/byok-form";
import { AnticipationControl } from "@/components/settings/anticipation-control";
import { getCurrentProvider } from "./actions";
import { createClient } from "@/lib/supabase/server";
import { getChatGPTStatus } from "@/lib/ai/openai-connection";
import { HeroBand } from "@/components/editorial/hero-band";
import { SectionHead } from "@/components/editorial/section-head";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { Database } from "@/types/database";

export const dynamic = "force-dynamic";

type AnticipationLevel = Database["public"]["Enums"]["anticipation_level_type"];

export default async function SettingsPage() {
  const currentProvider = await getCurrentProvider();
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const chatgptStatus = user
    ? await getChatGPTStatus(supabase, user.id)
    : { connected: false as const };

  let anticipationLevel: AnticipationLevel = "balanced";
  let displayName: string | null = null;
  let timezone: string | null = null;
  let memoryEnabled = true;
  if (user) {
    const { data: profileRow } = await supabase
      .from("profiles")
      .select("anticipation_level, display_name, timezone, memory_enabled")
      .eq("id", user.id)
      .single();
    if (profileRow?.anticipation_level) {
      anticipationLevel = profileRow.anticipation_level;
    }
    displayName = profileRow?.display_name ?? null;
    timezone = profileRow?.timezone ?? null;
    memoryEnabled = profileRow?.memory_enabled ?? true;
  }

  const connectionLabel = chatgptStatus.connected
    ? "chatgpt"
    : currentProvider === "openai"
      ? "openai · byok"
      : currentProvider === "anthropic"
        ? "anthropic · byok"
        : currentProvider === "gemini"
          ? "google · byok"
          : "not connected";

  return (
    <div className="mx-auto w-full max-w-5xl px-4 pt-8 pb-32 sm:px-6 sm:pt-10">
      <HeroBand
        eyebrow="settings · ru's brain"
        title="the back room."
        subtitle="the levers that change how ru thinks for you — which model is on, how often it speaks first, and what it remembers."
      />

      <div className="mt-7 grid grid-cols-3 gap-2.5 sm:gap-3">
        <Ledger label="model" value={connectionLabel} />
        <Ledger label="anticipation" value={anticipationLevel} />
        <Ledger label="memory" value={memoryEnabled ? "on" : "off"} />
      </div>

      <div className="mt-12 flex flex-col gap-12">
        <section>
          <SectionHead
            eyebrow="ai connection"
            sublabel="which model ru runs on"
            count={chatgptStatus.connected || currentProvider ? 1 : 0}
            accent="var(--entity-insight)"
          />
          <div className="mt-5 flex flex-col gap-5">
            <ChatGPTConnection initialStatus={chatgptStatus} />

            <div className="flex items-center gap-3">
              <span className="h-px flex-1 bg-[var(--hairline-soft)]" />
              <span
                className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground"
                style={{ fontVariationSettings: "'wght' 580, 'wdth' 100" }}
              >
                or bring your own key
              </span>
              <span className="h-px flex-1 bg-[var(--hairline-soft)]" />
            </div>

            <div className="rounded-2xl border border-[var(--hairline)] bg-[var(--card)] p-6 md:p-7">
              <BYOKForm currentProvider={currentProvider} />
            </div>
          </div>
        </section>

        {user && (
          <section>
            <SectionHead
              eyebrow="anticipation"
              sublabel="how often ru speaks first"
              count={1}
              accent="var(--entity-routine)"
            />
            <div className="mt-5 rounded-2xl border border-[var(--hairline)] bg-[var(--card)] p-6 md:p-7">
              <AnticipationControl userId={user.id} initialLevel={anticipationLevel} />
            </div>
          </section>
        )}

        {user && (
          <section>
            <SectionHead
              eyebrow="memory"
              sublabel="what ru holds onto"
              count={memoryEnabled ? 1 : 0}
              accent="var(--entity-insight)"
            />
            <div className="mt-5 flex flex-col gap-3">
              <SettingsRow
                label="memory"
                value={memoryEnabled ? "on — ru remembers across chats" : "off — each chat starts fresh"}
              />
              <Link
                href="/settings/memory"
                className="group flex items-center justify-between gap-4 rounded-2xl border border-[var(--hairline)] bg-[var(--card)] px-5 py-4 transition-colors hover:border-[var(--entity-insight)]"
              >
                <div className="flex flex-col gap-0.5">
                  <span
                    className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground"
                    style={{ fontVariationSettings: "'wght' 600, 'wdth' 100" }}
                  >
                    what ru remembers
                  </span>
                  <span className="text-[15px] text-foreground">
                    profile sections, episodes, audit log
                  </span>
                </div>
                <ChevronRight
                  className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5"
                  aria-hidden
                />
              </Link>
            </div>
          </section>
        )}

        {user && (
          <section>
            <SectionHead
              eyebrow="profile"
              sublabel="how ru addresses you"
              count={2}
              accent="var(--entity-task)"
            />
            <div className="mt-5 flex flex-col gap-3">
              <SettingsRow label="display name" value={displayName?.trim() || "—"} mono={false} />
              <SettingsRow label="timezone" value={timezone?.trim() || "UTC"} mono />
              <SettingsRow label="account" value={user.email ?? "—"} mono />
            </div>
            <p className="mt-3 text-[13px] italic text-muted-foreground" style={{ fontFamily: "var(--font-serif)" }}>
              edit these from the mobile app for now.
            </p>
          </section>
        )}
      </div>
    </div>
  );
}

function Ledger({ label, value }: { label: string; value: string | number }) {
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

function SettingsRow({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-2xl border border-[var(--hairline)] bg-[var(--card)] px-5 py-4">
      <span
        className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground"
        style={{ fontVariationSettings: "'wght' 600, 'wdth' 100" }}
      >
        {label}
      </span>
      <span
        className={
          mono
            ? "font-mono text-[13px] text-foreground"
            : "text-[15px] text-foreground"
        }
      >
        {value}
      </span>
    </div>
  );
}
