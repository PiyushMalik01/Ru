"use client";

// Notification email — autosaves on blur. Empty value clears the column so
// ru falls back to the auth account email. The placeholder shows the
// authenticated email so the user knows what "leave blank" resolves to.

import * as React from "react";
import { setNotifyEmail } from "@/app/(app)/settings/connections/actions";
import { cn } from "@/lib/utils";

interface Props {
  value: string | null;
  placeholder: string;
}

export function EmailInput({ value, placeholder }: Props) {
  const [current, setCurrent] = React.useState(value ?? "");
  const [savedAt, setSavedAt] = React.useState<number | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [, startTransition] = React.useTransition();
  const lastSavedRef = React.useRef(value ?? "");

  const handleBlur = () => {
    const trimmed = current.trim();
    if (trimmed === lastSavedRef.current) return;
    setError(null);
    startTransition(async () => {
      try {
        await setNotifyEmail(trimmed.length === 0 ? null : trimmed);
        lastSavedRef.current = trimmed;
        setSavedAt(Date.now());
      } catch {
        setError("couldn't save");
      }
    });
  };

  React.useEffect(() => {
    if (!savedAt) return;
    const t = setTimeout(() => setSavedAt(null), 1200);
    return () => clearTimeout(t);
  }, [savedAt]);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-3">
        <input
          type="email"
          inputMode="email"
          autoComplete="email"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          onBlur={handleBlur}
          placeholder={placeholder}
          className={cn(
            "h-10 w-full max-w-sm rounded-xl border border-[var(--hairline)] bg-[var(--card)] px-3.5",
            "font-mono text-[12.5px] text-foreground placeholder:text-muted-foreground/70",
            "transition-colors focus:outline-none focus:border-[var(--entity-task)]",
          )}
        />
        {savedAt && (
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">saved</span>
        )}
      </div>
      <p className="text-[12.5px] text-muted-foreground" style={{ fontVariationSettings: "'wght' 460" }}>
        leave blank to use your account email.
      </p>
      {error && (
        <p className="text-[12px]" style={{ color: "var(--error, #a3341a)" }} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
