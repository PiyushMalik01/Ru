"use client";

import { useEffect, useRef } from "react";

/**
 * Global push-to-talk handler.
 *
 * Hold the space bar anywhere on the page → `onStart` fires once.
 * Release space → `onStop` fires once.
 *
 * Suppressed when the user is typing in an input/textarea/contenteditable so
 * space remains a regular character there. Modifier keys (shift/ctrl/meta/alt)
 * disable the shortcut so accessibility chords still work as normal.
 */
export function usePushToTalk(opts: {
  onStart: () => void;
  onStop: () => void;
  /** Default true. Set false to disable temporarily (e.g. while a modal is open). */
  enabled?: boolean;
}) {
  const activeRef = useRef(false);
  const onStartRef = useRef(opts.onStart);
  const onStopRef = useRef(opts.onStop);

  // Keep refs current so consumers don't need to memoize their callbacks.
  useEffect(() => {
    onStartRef.current = opts.onStart;
    onStopRef.current = opts.onStop;
  });

  const enabled = opts.enabled ?? true;

  useEffect(() => {
    if (!enabled) return;

    const isTypingTarget = (t: EventTarget | null): boolean => {
      const el = t as HTMLElement | null;
      if (!el) return false;
      if (el.isContentEditable) return true;
      const tag = el.tagName;
      return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code !== "Space") return;
      if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
      if (e.repeat) return;
      if (isTypingTarget(e.target)) return;
      if (activeRef.current) return;
      e.preventDefault();
      activeRef.current = true;
      onStartRef.current();
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code !== "Space") return;
      if (!activeRef.current) return;
      e.preventDefault();
      activeRef.current = false;
      onStopRef.current();
    };

    // If the window loses focus mid-hold, release the lock so we don't
    // strand the mic in "listening forever" mode.
    const onBlur = () => {
      if (activeRef.current) {
        activeRef.current = false;
        onStopRef.current();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
    };
  }, [enabled]);
}
