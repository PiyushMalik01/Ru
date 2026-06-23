"use client";

import { useState, useTransition } from "react";
import { LogOut } from "lucide-react";
import { confirm } from "@/lib/stores/confirm-store";
import { signOut } from "@/app/(app)/settings/actions";
import { cn } from "@/lib/utils";

export function SignOutButton({ email }: { email?: string | null }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setError(null);
    const ok = await confirm({
      title: "Sign out of ru?",
      description: email
        ? `You'll be signed out of ${email}. Sign back in any time.`
        : "You'll be signed out. Sign back in any time.",
      confirmLabel: "Sign out",
      destructive: true,
    });
    if (!ok) return;
    startTransition(async () => {
      try {
        await signOut();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not sign out");
      }
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={handleClick}
        disabled={pending}
        className={cn(
          "group flex items-center justify-between gap-4 rounded-2xl border border-[var(--hairline)] bg-[var(--card)] px-5 py-4 text-left transition-colors",
          "hover:border-destructive disabled:opacity-50",
        )}
      >
        <div className="flex flex-col gap-0.5">
          <span
            className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground"
            style={{ fontVariationSettings: "'wght' 600, 'wdth' 100" }}
          >
            session
          </span>
          <span className="text-[15px] text-foreground">
            {pending ? "signing out…" : "sign out of ru"}
          </span>
        </div>
        <LogOut
          className="h-4 w-4 text-muted-foreground transition-colors group-hover:text-destructive"
          aria-hidden
        />
      </button>
      {error && (
        <p className="text-[12px] text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
