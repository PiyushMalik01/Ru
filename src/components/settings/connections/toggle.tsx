"use client";

// Editorial pill toggle — rounded-full, foreground-on / secondary-off, with
// a small knob that translates. Shared by every per-channel control on the
// connections page so the toggle visual is identical across cards.

import * as React from "react";
import { cn } from "@/lib/utils";

interface Props {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  label?: string;
}

export function Toggle({ checked, onChange, disabled, label }: Props) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full",
        "transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        checked ? "bg-foreground" : "bg-secondary",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "inline-block h-5 w-5 rounded-full bg-background shadow-[0_1px_2px_rgba(0,0,0,0.18)]",
          "transition-transform duration-150 ease-out",
          checked ? "translate-x-[22px]" : "translate-x-[2px]",
        )}
      />
    </button>
  );
}
