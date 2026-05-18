"use client";

import { useEffect, useState } from "react";
import { Bell, X } from "lucide-react";
import { cn } from "@/lib/utils";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i);
  return output;
}

type State = "checking" | "hidden" | "available" | "dismissed" | "enabling" | "done" | "denied";

const VAPID = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
const STORAGE_KEY = "ru-push-prompt-dismissed";

export function PushPrompt() {
  const [state, setState] = useState<State>("checking");

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!VAPID) { setState("hidden"); return; }
    if (!("Notification" in window) || !("serviceWorker" in navigator)) { setState("hidden"); return; }
    if (Notification.permission === "granted") { setState("done"); return; }
    if (Notification.permission === "denied") { setState("denied"); return; }
    if (localStorage.getItem(STORAGE_KEY) === "1") { setState("dismissed"); return; }
    setState("available");
  }, []);

  async function enable() {
    if (!VAPID) return;
    setState("enabling");
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "denied" : "available");
        return;
      }
      const reg = await navigator.serviceWorker.register("/sw.js");
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID).buffer as ArrayBuffer,
      });
      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(sub.toJSON()),
      });
      if (!res.ok) throw new Error(await res.text());
      setState("done");
    } catch (e) {
      console.error("push enable failed", e);
      setState("available");
    }
  }

  function dismiss() {
    localStorage.setItem(STORAGE_KEY, "1");
    setState("dismissed");
  }

  if (state !== "available" && state !== "enabling") return null;

  return (
    <div className="mx-auto mt-3 w-full max-w-5xl px-4">
      <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-secondary px-4 py-2.5">
        <div className="flex min-w-0 items-center gap-2.5">
          <Bell className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <span className="truncate text-[13px] text-foreground">
            Let Ru send you reminders and nudges in the background.
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={enable}
            disabled={state === "enabling"}
            className={cn(
              "rounded-md bg-foreground px-3 py-1.5 text-[12px] font-medium text-background transition-opacity",
              "hover:opacity-90 disabled:opacity-50"
            )}
          >
            {state === "enabling" ? "Enabling…" : "Enable"}
          </button>
          <button
            type="button"
            onClick={dismiss}
            aria-label="Dismiss"
            className="rounded-md p-1 text-muted-foreground transition-colors hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
