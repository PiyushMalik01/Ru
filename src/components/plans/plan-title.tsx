"use client";

// Click-to-rename plan title, using the existing renameWorkspace server action.

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { renameWorkspace } from "@/app/(app)/chat/workspace-actions";
import { cn } from "@/lib/utils";

export function PlanTitle({ id, initial }: { id: string; initial: string }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(initial);
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) {
      ref.current?.focus();
      ref.current?.select();
    }
  }, [editing]);

  function commit() {
    setEditing(false);
    const trimmed = value.trim();
    if (!trimmed || trimmed === initial) {
      setValue(initial);
      return;
    }
    startTransition(async () => {
      await renameWorkspace(id, trimmed);
      router.refresh();
    });
  }

  return editing ? (
    <input
      ref={ref}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") commit();
        if (e.key === "Escape") {
          setValue(initial);
          setEditing(false);
        }
      }}
      maxLength={120}
      className={cn(
        "w-full bg-transparent text-[36px] font-light leading-[1.1] tracking-[-0.022em] text-foreground focus:outline-none",
        pending && "opacity-60",
      )}
    />
  ) : (
    <button
      type="button"
      onClick={() => setEditing(true)}
      className="group block w-full text-left"
    >
      <h1 className="text-[36px] font-light leading-[1.1] tracking-[-0.022em] text-foreground transition-colors group-hover:text-foreground/95">
        {value}
      </h1>
    </button>
  );
}
