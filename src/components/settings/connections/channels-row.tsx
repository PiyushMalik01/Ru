"use client";

// Three-channel row: in-app · push · email. Each toggle pill writes the
// corresponding boolean to `profiles` via the server action. Optimistic UI
// with a quiet revert + small error string on failure.

import * as React from "react";
import { Toggle } from "./toggle";
import { setNotifyChannel } from "@/app/(app)/settings/connections/actions";

interface Props {
  inapp: boolean;
  push: boolean;
  email: boolean;
}

type Channel = "inapp" | "push" | "email";

const ROWS: Array<{ id: Channel; label: string; hint: string }> = [
  { id: "inapp", label: "in-app", hint: "the toast layer and today briefing" },
  { id: "push", label: "push", hint: "browser + mobile push notifications" },
  { id: "email", label: "email", hint: "transactional and digest mail" },
];

export function ChannelsRow({ inapp, push, email }: Props) {
  const [state, setState] = React.useState<Record<Channel, boolean>>({ inapp, push, email });
  const [error, setError] = React.useState<string | null>(null);
  const [, startTransition] = React.useTransition();

  const setOne = (id: Channel, next: boolean) => {
    const previous = state[id];
    setState((s) => ({ ...s, [id]: next }));
    setError(null);
    startTransition(async () => {
      try {
        await setNotifyChannel(id, next);
      } catch {
        setState((s) => ({ ...s, [id]: previous }));
        setError("couldn't save");
      }
    });
  };

  return (
    <div className="flex flex-col gap-2">
      {ROWS.map((row) => (
        <div
          key={row.id}
          className="flex items-center justify-between gap-4 rounded-xl border border-[var(--hairline-soft)] px-4 py-3"
        >
          <div className="flex min-w-0 flex-col gap-0.5">
            <span
              className="font-mono text-[10px] uppercase tracking-[0.2em] text-foreground"
              style={{ fontVariationSettings: "'wght' 600" }}
            >
              {row.label}
            </span>
            <span className="text-[12.5px] text-muted-foreground">{row.hint}</span>
          </div>
          <Toggle checked={state[row.id]} onChange={(next) => setOne(row.id, next)} label={row.label} />
        </div>
      ))}
      {error && (
        <p className="text-[12px]" style={{ color: "var(--error, #a3341a)" }} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
