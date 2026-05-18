"use client";

import { useState, useTransition } from "react";
import { Eye, EyeOff, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { saveBYOK } from "@/app/(app)/settings/actions";

type Provider = "openai" | "anthropic" | "gemini";
type Status = "idle" | "saving" | "saved" | "error";

const providers: { id: Provider; label: string; modelPlaceholder: string }[] = [
  { id: "openai", label: "OpenAI", modelPlaceholder: "gpt-4o-mini" },
  { id: "anthropic", label: "Anthropic", modelPlaceholder: "claude-sonnet-4-6" },
  { id: "gemini", label: "Google", modelPlaceholder: "gemini-2.5-flash" },
];

export function BYOKForm({ currentProvider }: { currentProvider: Provider | null }) {
  const [provider, setProvider] = useState<Provider>(currentProvider ?? "openai");
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("");
  const [show, setShow] = useState(false);
  const [status, setStatus] = useState<Status>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const currentMeta = providers.find((p) => p.id === provider)!;

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!apiKey || apiKey.length < 8) {
      setStatus("error");
      setErrorMsg("That key looks too short.");
      return;
    }
    setStatus("saving");
    setErrorMsg(null);
    startTransition(async () => {
      const res = await saveBYOK({
        provider,
        apiKey,
        model: model.trim() || undefined,
      });
      if (res.error) {
        setStatus("error");
        setErrorMsg(res.error);
      } else {
        setStatus("saved");
        setApiKey("");
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="max-w-xl space-y-7">
      {currentProvider && (
        <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1">
          <span className="h-1.5 w-1.5 rounded-full bg-success" aria-hidden />
          <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
            active · {providers.find((p) => p.id === currentProvider)?.label}
          </span>
        </div>
      )}

      {/* Segmented control */}
      <div className="space-y-2.5">
        <label className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
          Provider
        </label>
        <div className="inline-flex items-center gap-0.5 rounded-lg border border-border bg-card p-0.5">
          {providers.map((p) => {
            const active = provider === p.id;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => setProvider(p.id)}
                className={cn(
                  "rounded-md px-4 py-1.5 text-[13px] transition-colors",
                  active
                    ? "bg-elevated text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {p.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* API Key */}
      <div className="space-y-2.5">
        <label
          htmlFor="byok-key"
          className="block font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground"
        >
          API key
        </label>
        <div className="relative">
          <input
            id="byok-key"
            type={show ? "text" : "password"}
            value={apiKey}
            onChange={(e) => {
              setApiKey(e.target.value);
              if (status !== "idle") setStatus("idle");
            }}
            placeholder={
              provider === "openai"
                ? "sk-..."
                : provider === "anthropic"
                  ? "sk-ant-..."
                  : "AIza..."
            }
            autoComplete="off"
            spellCheck={false}
            className={cn(
              "h-11 w-full rounded-lg border border-border bg-card px-3.5 pr-11",
              "font-mono text-[13px] tracking-tight text-foreground",
              "placeholder:text-muted-foreground/60",
              "focus:border-[rgba(255,255,255,0.2)] focus:outline-none"
            )}
          />
          <button
            type="button"
            onClick={() => setShow((v) => !v)}
            aria-label={show ? "Hide key" : "Show key"}
            className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
          >
            {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {/* Model override */}
      <div className="space-y-2.5">
        <label
          htmlFor="byok-model"
          className="block font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground"
        >
          Model <span className="ml-1 normal-case tracking-normal text-muted-foreground/70">— optional</span>
        </label>
        <input
          id="byok-model"
          type="text"
          value={model}
          onChange={(e) => setModel(e.target.value)}
          placeholder={currentMeta.modelPlaceholder}
          autoComplete="off"
          spellCheck={false}
          className={cn(
            "h-11 w-full rounded-lg border border-border bg-card px-3.5",
            "font-mono text-[13px] tracking-tight text-foreground",
            "placeholder:text-muted-foreground/60",
            "focus:border-[rgba(255,255,255,0.2)] focus:outline-none"
          )}
        />
      </div>

      <div className="flex items-center gap-4 pt-1">
        <button
          type="submit"
          disabled={status === "saving"}
          className={cn(
            "h-10 rounded-lg bg-foreground px-5 text-[13px] font-medium text-background transition-all",
            "hover:bg-foreground/90 disabled:opacity-60"
          )}
        >
          {status === "saving" ? "Saving…" : "Save key"}
        </button>

        <StatusLine status={status} error={errorMsg} />
      </div>
    </form>
  );
}

function StatusLine({ status, error }: { status: Status; error: string | null }) {
  if (status === "saved") {
    return (
      <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
        <ShieldCheck className="h-3.5 w-3.5 text-success" aria-hidden />
        <span>
          Saved. Encrypted with AES-256-GCM — we never read your key.
        </span>
      </div>
    );
  }
  if (status === "error") {
    return (
      <div className="text-[12px] text-error">
        {error ?? "Could not save your key."}
      </div>
    );
  }
  if (status === "idle") {
    return (
      <div className="font-mono text-[11px] uppercase tracking-wide text-muted-foreground/70">
        encrypted at rest · aes-256-gcm
      </div>
    );
  }
  return null;
}
