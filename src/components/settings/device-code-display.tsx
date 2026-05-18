"use client";

import { useEffect, useState } from "react";
import { Check, Copy } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  userCode: string;
  verificationUrl: string;
  expiresIn: number;
}

export function DeviceCodeDisplay({ userCode, verificationUrl, expiresIn }: Props) {
  const [copied, setCopied] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(expiresIn);

  useEffect(() => {
    if (!navigator.clipboard) return;
    navigator.clipboard.writeText(userCode).catch(() => {});
  }, [userCode]);

  useEffect(() => {
    const interval = setInterval(() => {
      setSecondsLeft((prev) => (prev <= 0 ? 0 : prev - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const handleCopy = () => {
    navigator.clipboard.writeText(userCode).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  const m = Math.floor(secondsLeft / 60);
  const s = secondsLeft % 60;

  return (
    <div className="flex flex-col items-start gap-5 rounded-xl border border-border bg-card p-5">
      <p className="text-[13px] text-muted-foreground">
        Enter this code on the OpenAI verification page to authorize Ru.
      </p>

      <div className="flex items-center gap-2">
        <code className="rounded-md bg-secondary px-4 py-3 font-mono text-[26px] font-medium tracking-[0.18em] text-foreground">
          {userCode}
        </code>
        <button
          type="button"
          onClick={handleCopy}
          aria-label="Copy code"
          className={cn(
            "flex h-9 w-9 items-center justify-center rounded-md border border-border bg-secondary text-muted-foreground transition-colors",
            "hover:text-foreground"
          )}
        >
          {copied ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
        </button>
      </div>

      <div className="flex w-full items-center justify-between">
        <a
          href={verificationUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center rounded-md bg-foreground px-4 py-2 text-[13px] font-medium text-background transition-opacity hover:opacity-90"
        >
          Open verification page
        </a>
        <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
          expires in {m}:{s.toString().padStart(2, "0")}
        </span>
      </div>
    </div>
  );
}
