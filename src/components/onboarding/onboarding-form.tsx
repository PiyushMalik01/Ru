"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { saveProfile, completeOnboarding } from "@/app/onboarding/actions";
import { TimezonePicker } from "./timezone-picker";

type Step = "profile" | "ai";

interface Props {
  initialName: string;
  initialTimezone: string;
  hasAiProvider: boolean;
}

export function OnboardingForm({ initialName, initialTimezone, hasAiProvider }: Props) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("profile");
  const [name, setName] = useState(initialName);
  const [timezone, setTimezone] = useState(initialTimezone);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!timezone) {
      try {
        setTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC");
      } catch {
        setTimezone("UTC");
      }
    }
  }, [timezone]);

  function submitProfile(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await saveProfile({ displayName: name, timezone });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setStep("ai");
    });
  }

  function finish() {
    setError(null);
    startTransition(async () => {
      await completeOnboarding();
    });
  }

  return (
    <div>
      <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
        getting set up · {step === "profile" ? "1 of 2" : "2 of 2"}
      </div>

      {step === "profile" ? (
        <form onSubmit={submitProfile} className="mt-6">
          <h1 className="font-display text-[36px] leading-[1.02] tracking-tight text-foreground sm:text-[42px]">
            Welcome to Ru.
          </h1>
          <p
            className="mt-4 max-w-[52ch] text-[15px] text-muted-foreground"
            style={{ lineHeight: 1.65 }}
          >
            Tell me what to call you and where you are. Two fields — then we&rsquo;re done with
            forms forever.
          </p>

          <div className="mt-10 space-y-6">
            <Field
              label="Your name"
              hint="What I should call you in conversation."
              input={
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Ateeb"
                  autoFocus
                  className="w-full bg-transparent text-[18px] font-medium tracking-tight text-foreground placeholder:text-[rgba(255,255,255,0.18)] focus:outline-none"
                />
              }
            />
            <Field
              label="Timezone"
              hint="Detected from your browser. Pick a different one if it's wrong."
              input={<TimezonePicker value={timezone} onChange={setTimezone} />}
            />
          </div>

          {error && (
            <p className="mt-6 text-[13px] text-error" role="alert">
              {error}
            </p>
          )}

          <div className="mt-10">
            <button
              type="submit"
              disabled={pending || !name.trim()}
              className={cn(
                "inline-flex items-center gap-2 rounded-md bg-foreground px-5 py-2.5 text-[14px] font-medium text-background transition-opacity",
                "hover:opacity-90 disabled:opacity-40"
              )}
            >
              {pending ? "Saving…" : "Continue"}
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </form>
      ) : (
        <div className="mt-6">
          <h1 className="font-display text-[36px] leading-[1.02] tracking-tight text-foreground sm:text-[42px]">
            Connect Ru to an AI.
          </h1>
          <p
            className="mt-4 max-w-[52ch] text-[15px] text-muted-foreground"
            style={{ lineHeight: 1.65 }}
          >
            Ru runs on your ChatGPT account by default — no API keys to manage. You can also
            bring your own OpenAI / Anthropic / Google key.
          </p>

          {hasAiProvider ? (
            <div className="mt-10 inline-flex items-center gap-2 rounded-full border border-border bg-secondary px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.14em] text-foreground">
              <span className="h-1.5 w-1.5 rounded-full bg-success" />
              Connected
            </div>
          ) : (
            <div className="mt-10 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => router.push("/settings")}
                className="inline-flex items-center gap-2 rounded-md bg-foreground px-5 py-2.5 text-[14px] font-medium text-background transition-opacity hover:opacity-90"
              >
                Go to settings
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={finish}
                className="inline-flex items-center gap-2 rounded-md border border-border px-5 py-2.5 text-[14px] font-medium text-foreground transition-colors hover:bg-secondary"
              >
                Skip for now
              </button>
            </div>
          )}

          {hasAiProvider && (
            <div className="mt-10">
              <button
                type="button"
                onClick={finish}
                disabled={pending}
                className={cn(
                  "inline-flex items-center gap-2 rounded-md bg-foreground px-5 py-2.5 text-[14px] font-medium text-background transition-opacity",
                  "hover:opacity-90 disabled:opacity-40"
                )}
              >
                {pending ? "Finishing…" : "Start talking to Ru"}
                <Check className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          {error && (
            <p className="mt-6 text-[13px] text-error" role="alert">
              {error}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function Field({ label, hint, input }: { label: string; hint: string; input: React.ReactNode }) {
  return (
    <label className="block border-b border-border pb-3">
      <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </span>
      <div className="mt-2">{input}</div>
      <span className="mt-2 block text-[12px] text-muted-foreground">{hint}</span>
    </label>
  );
}
