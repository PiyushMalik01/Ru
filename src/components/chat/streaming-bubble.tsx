"use client";

/**
 * A thin blinking caret rendered as a span — inline with the streamed text.
 * Implemented in CSS via the .ru-caret keyframe in globals.css.
 */
export function StreamingCaret() {
  return <span className="ru-caret" aria-hidden />;
}
