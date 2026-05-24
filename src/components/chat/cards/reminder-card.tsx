"use client";

import { useState, useTransition } from "react";
import { Repeat, Bell, Check, Clock } from "lucide-react";
import {
  dismissReminderInline,
  snoozeReminderInline,
} from "@/app/(app)/chat/card-actions";
import {
  CardActions,
  CardLabel,
  PrimaryAction,
  SecondaryAction,
  ActionError,
} from "./task-card";

export interface ReminderCardData {
  id: string;
  title: string;
  remind_at?: string | null;
  is_recurring?: boolean;
  status?: "pending" | "dismissed" | string;
}

function formatRemind(t?: string | null): string {
  if (!t) return "";
  const d = new Date(t);
  if (Number.isNaN(d.getTime())) return "";
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  if (sameDay) return time;
  const day = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return `${day} · ${time}`;
}

export function ReminderCard({ data }: { data: ReminderCardData }) {
  const [status, setStatus] = useState<"pending" | "dismissed">(
    data.status === "dismissed" ? "dismissed" : "pending",
  );
  const [remindAt, setRemindAt] = useState<string | null | undefined>(data.remind_at);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function doDismiss() {
    setError(null);
    startTransition(async () => {
      const res = await dismissReminderInline(data.id);
      if (res.ok) setStatus("dismissed");
      else setError(res.error ?? "Couldn't dismiss.");
    });
  }
  function doSnooze(minutes: number) {
    setError(null);
    startTransition(async () => {
      const res = await snoozeReminderInline(data.id, minutes);
      if (res.ok && res.state) setRemindAt(res.state.remind_at);
      else setError(res.error ?? "Couldn't snooze.");
    });
  }

  return (
    <div
      className="block w-full overflow-hidden rounded-2xl transition-transform hover:-translate-y-0.5"
      style={{
        background: "var(--entity-reminder)",
        color: "var(--entity-reminder-fg)",
      }}
    >
      <div className="flex items-center gap-3 px-5 py-4">
        <Bell className="h-3.5 w-3.5 shrink-0" aria-hidden />
        <CardLabel>reminder</CardLabel>
        <div
          className="min-w-0 flex-1 truncate text-[14.5px] leading-tight"
          style={{ fontVariationSettings: "'wght' 580, 'wdth' 96" }}
        >
          {data.title}
        </div>
        {data.is_recurring && (
          <Repeat className="h-3.5 w-3.5 shrink-0 opacity-75" aria-hidden />
        )}
        {remindAt && (
          <span
            className="shrink-0 text-[11px] tabular-nums opacity-85"
            style={{ fontVariationSettings: "'wght' 580, 'wdth' 100" }}
          >
            {formatRemind(remindAt)}
          </span>
        )}
      </div>

      <CardActions>
        {status === "pending" ? (
          <>
            <PrimaryAction onClick={doDismiss} pending={pending}>
              <Check className="h-3 w-3" strokeWidth={3} />
              done
            </PrimaryAction>
            <SecondaryAction onClick={() => doSnooze(10)} pending={pending}>
              <Clock className="h-3 w-3" strokeWidth={2.5} />
              +10m
            </SecondaryAction>
            <SecondaryAction onClick={() => doSnooze(60)} pending={pending}>
              <Clock className="h-3 w-3" strokeWidth={2.5} />
              +1h
            </SecondaryAction>
          </>
        ) : (
          <span
            className="inline-flex items-center gap-1.5 rounded-full bg-black/85 px-3 py-1.5 text-[11.5px] text-white"
            style={{ fontVariationSettings: "'wght' 580, 'wdth' 96" }}
          >
            <Check className="h-3 w-3" strokeWidth={3} />
            dismissed
          </span>
        )}
      </CardActions>
      {error && <ActionError>{error}</ActionError>}
    </div>
  );
}
