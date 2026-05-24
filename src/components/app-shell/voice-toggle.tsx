"use client";

import { Type } from "lucide-react";
import { cn } from "@/lib/utils";
import { MiniOrb } from "./mini-orb";

type Props = {
  on: boolean;
  onChange: (next: boolean) => void;
  className?: string;
};

/**
 * Two-state switch that replaces the headphones icon. When OFF the thumb shows
 * a small "Aa" type glyph on white; when ON the thumb slides right, its
 * background goes dark, and the orb itself takes over the thumb — same wave-
 * ring creature that lives at the center of the collapsed pill.
 */
export function VoiceToggle({ on, onChange, className }: Props) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={on ? "Switch to text mode" : "Switch to voice mode"}
      title={on ? "Voice mode · tap to switch back" : "Switch to voice mode"}
      onClick={() => onChange(!on)}
      className={cn(
        "relative inline-flex h-7 w-[52px] shrink-0 cursor-pointer items-center rounded-full transition-colors duration-300",
        on
          ? "bg-[var(--entity-routine,#84cc16)]"
          : "bg-[var(--secondary,rgba(0,0,0,0.06))]",
        className,
      )}
    >
      <span
        className={cn(
          "absolute top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center overflow-hidden rounded-full shadow-[0_2px_6px_-1px_rgba(0,0,0,0.25)] transition-all duration-300 ease-out",
          on
            ? "translate-x-[24px] bg-[#0a0a0e]"
            : "translate-x-[2px] bg-white",
        )}
      >
        {on ? (
          <MiniOrb size={20} />
        ) : (
          <Type className="h-[11px] w-[11px] text-[#6b6b6b]" strokeWidth={2.5} />
        )}
      </span>
    </button>
  );
}
