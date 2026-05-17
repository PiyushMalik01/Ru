"use client";

import { useState, useRef } from "react";
import { Mic, Square, Send } from "lucide-react";
import { cn } from "@/lib/utils";

type PillState = "idle" | "typing" | "listening";

export function FloatingPill() {
  const [state, setState] = useState<PillState>("idle");
  const [voiceOnly, setVoiceOnly] = useState(false);
  const [input, setInput] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  function handleMicClick() {
    if (state === "listening") {
      setState("idle");
      return;
    }
    setState("listening");
  }

  function handleSubmit() {
    if (!input.trim()) return;
    // Will be wired to chat API in Plan 2
    setInput("");
    setState("idle");
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 flex justify-center p-4">
      <div className="w-full max-w-xl">
        <div
          className={cn(
            "flex items-center gap-2 rounded-full border bg-elevated px-5 py-1.5 transition-all",
            state === "listening"
              ? "border-[rgba(255,255,255,0.12)]"
              : "border-[rgba(255,255,255,0.08)]"
          )}
        >
          {state === "listening" ? (
            <WaveformBars />
          ) : voiceOnly ? (
            <button
              onClick={handleMicClick}
              className="flex-1 py-2 text-left text-sm text-muted-foreground"
            >
              Tap to speak
            </button>
          ) : (
            <input
              ref={inputRef}
              type="text"
              placeholder="Talk to Ru..."
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                setState(e.target.value ? "typing" : "idle");
              }}
              onKeyDown={handleKeyDown}
              className="flex-1 bg-transparent py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
            />
          )}

          {state === "typing" && input.trim() && (
            <button
              onClick={handleSubmit}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-foreground text-background transition-colors hover:bg-foreground/90"
            >
              <Send className="h-3.5 w-3.5" />
            </button>
          )}

          <button
            onClick={() => setVoiceOnly(!voiceOnly)}
            className={cn(
              "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] transition-colors",
              voiceOnly
                ? "border-transparent bg-foreground text-background"
                : "border-[rgba(255,255,255,0.06)] bg-[rgba(255,255,255,0.04)] text-muted-foreground"
            )}
          >
            <span
              className={cn(
                "h-1.5 w-1.5 rounded-full",
                voiceOnly ? "bg-background" : "bg-muted-foreground"
              )}
            />
            Voice only
          </button>

          <button
            onClick={handleMicClick}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-foreground text-background transition-colors hover:bg-foreground/90"
          >
            {state === "listening" ? (
              <Square className="h-3 w-3" />
            ) : (
              <Mic className="h-4 w-4" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

function WaveformBars() {
  const bars = [
    { h: 8, d: "0s" }, { h: 16, d: "0.05s" }, { h: 22, d: "0.1s" },
    { h: 12, d: "0.15s" }, { h: 20, d: "0.2s" }, { h: 8, d: "0.25s" },
    { h: 14, d: "0.3s" }, { h: 18, d: "0.35s" }, { h: 6, d: "0.4s" },
    { h: 16, d: "0.45s" }, { h: 22, d: "0.5s" }, { h: 10, d: "0.55s" },
  ];

  return (
    <div className="flex flex-1 items-center gap-[3px] py-2">
      {bars.map((bar, i) => (
        <div
          key={i}
          className="w-[3px] animate-pulse rounded-full bg-foreground"
          style={{
            height: `${bar.h}px`,
            opacity: 0.3 + (bar.h / 22) * 0.7,
            animationDelay: bar.d,
            animationDuration: `${0.6 + (i % 3) * 0.2}s`,
          }}
        />
      ))}
    </div>
  );
}
