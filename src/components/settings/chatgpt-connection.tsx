"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { DeviceCodeDisplay } from "./device-code-display";
import { cn } from "@/lib/utils";

export interface ChatGPTStatus {
  connected: boolean;
  authMethod?: "oauth-device";
  email?: string;
  planType?: string;
  tokenExpiresAt?: string;
}

interface DeviceCode {
  userCode: string;
  verificationUrl: string;
  expiresIn: number;
}

export function ChatGPTConnection({ initialStatus }: { initialStatus: ChatGPTStatus }) {
  const router = useRouter();
  const [status, setStatus] = useState<ChatGPTStatus>(initialStatus);
  const [deviceCode, setDeviceCode] = useState<DeviceCode | null>(null);
  const [polling, setPolling] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Polling is driven by a self-rescheduling timeout (not setInterval) so
  // a single in-flight poll is never overlapped by the next tick. The
  // previous setInterval approach raced: if /poll took >5s (which it does
  // on the success path because the server is exchanging code for tokens),
  // the next tick fired in parallel, hit a consumed session, and the
  // duplicate failure wiped the UI even though the first poll had
  // successfully connected.
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelledRef = useRef(false);

  useEffect(() => {
    return () => {
      cancelledRef.current = true;
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  function stopPolling() {
    cancelledRef.current = true;
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    setPolling(false);
  }

  async function handleConnect() {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/auth/openai", { method: "POST" });
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as DeviceCode;
      setDeviceCode(data);
      setPolling(true);
      cancelledRef.current = false;

      // Open the verification page in a new tab; code is already in their clipboard
      window.open(data.verificationUrl, "_blank", "noopener,noreferrer");

      const runPoll = async () => {
        if (cancelledRef.current) return;
        try {
          const r = await fetch("/api/auth/openai/poll", { method: "POST" });
          if (cancelledRef.current) return;
          if (!r.ok) throw new Error(await r.text());
          const result = (await r.json()) as {
            authorized: boolean;
            email?: string;
            planType?: string;
          };
          if (result.authorized) {
            stopPolling();
            setDeviceCode(null);
            setStatus({
              connected: true,
              authMethod: "oauth-device",
              email: result.email,
              planType: result.planType,
            });
            router.refresh();
            return;
          }
          if (!cancelledRef.current) {
            timeoutRef.current = setTimeout(runPoll, 5000);
          }
        } catch (e) {
          if (cancelledRef.current) return;
          stopPolling();
          setDeviceCode(null);
          setError(e instanceof Error ? e.message : "Authorization failed");
        }
      };

      timeoutRef.current = setTimeout(runPoll, 5000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start ChatGPT connection");
    } finally {
      setBusy(false);
    }
  }

  function handleCancel() {
    stopPolling();
    setDeviceCode(null);
  }

  async function handleDisconnect() {
    setBusy(true);
    try {
      await fetch("/api/auth/openai/disconnect", { method: "POST" });
      setStatus({ connected: false });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-2xl border border-border bg-card p-6 md:p-7">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            recommended
          </div>
          <h2 className="mt-2 text-[22px] font-medium tracking-tight">Connect ChatGPT</h2>
          <p
            className="mt-2 max-w-[52ch] text-[14px] text-muted-foreground"
            style={{ lineHeight: 1.6 }}
          >
            Sign in with your ChatGPT account. Ru runs on{" "}
            <span className="font-mono text-foreground">gpt-5.4</span> using your existing plan —
            no API keys to manage, no extra billing.
          </p>
        </div>
        <StatusBadge status={status} />
      </div>

      <div className="mt-6">
        {status.connected ? (
          <ConnectedView status={status} onDisconnect={handleDisconnect} busy={busy} />
        ) : deviceCode ? (
          <div className="flex flex-col gap-4">
            <DeviceCodeDisplay
              userCode={deviceCode.userCode}
              verificationUrl={deviceCode.verificationUrl}
              expiresIn={deviceCode.expiresIn}
            />
            {polling && (
              <div className="flex items-center justify-between">
                <span className="inline-flex items-center gap-2 text-[13px] text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Waiting for authorization…
                </span>
                <button
                  type="button"
                  onClick={handleCancel}
                  className="text-[13px] text-muted-foreground transition-colors hover:text-foreground"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        ) : (
          <button
            type="button"
            onClick={handleConnect}
            disabled={busy}
            className={cn(
              "inline-flex items-center rounded-md bg-foreground px-4 py-2.5 text-[14px] font-medium text-background transition-opacity",
              "hover:opacity-90 disabled:opacity-50"
            )}
          >
            {busy ? "Starting…" : "Connect ChatGPT"}
          </button>
        )}

        {error && (
          <p className="mt-3 text-[12px] text-error" role="alert">
            {error}
          </p>
        )}
      </div>
    </section>
  );
}

function StatusBadge({ status }: { status: ChatGPTStatus }) {
  if (!status.connected) {
    return (
      <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border bg-secondary px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
        <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground" />
        Disconnected
      </span>
    );
  }
  return (
    <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border bg-secondary px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-foreground">
      <span className="h-1.5 w-1.5 rounded-full bg-success" />
      Connected
    </span>
  );
}

function ConnectedView({
  status,
  onDisconnect,
  busy,
}: {
  status: ChatGPTStatus;
  onDisconnect: () => void;
  busy: boolean;
}) {
  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-1 gap-y-2 text-[13px] sm:grid-cols-[auto_1fr] sm:gap-x-6">
        {status.email && (
          <>
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground sm:pt-0.5">
              account
            </span>
            <span className="font-mono text-foreground">{status.email}</span>
          </>
        )}
        {status.planType && (
          <>
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground sm:pt-0.5">
              plan
            </span>
            <span className="font-mono text-foreground">{status.planType}</span>
          </>
        )}
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground sm:pt-0.5">
          model
        </span>
        <span className="font-mono text-foreground">gpt-5.4</span>
      </div>

      <button
        type="button"
        onClick={onDisconnect}
        disabled={busy}
        className={cn(
          "self-start text-[13px] text-muted-foreground underline-offset-4 transition-colors",
          "hover:text-error hover:underline disabled:opacity-50"
        )}
      >
        {busy ? "Disconnecting…" : "Disconnect ChatGPT"}
      </button>
    </div>
  );
}
