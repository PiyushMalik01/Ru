"use client";

/**
 * Convert streaming markdown deltas into speech-safe text without breaking the
 * stream. Strips markers Aura would otherwise read literally ("dot", "star",
 * "hash") while preserving the words between them.
 *
 * Stateful: keeps a small carry buffer so a marker split across two deltas
 * (e.g. "*" then "*hello**") still gets stripped cleanly.
 */
export function createSpeakableStream() {
  let carry = "";

  return {
    /** Feed an incoming delta; returns the speech-safe slice (may be empty). */
    push(delta: string): string {
      const combined = carry + delta;

      // Keep the last 2 chars in carry — that's enough to recognize "**", "__",
      // "```" boundaries that might be split across deltas.
      const safeUntil = Math.max(0, combined.length - 2);
      const head = combined.slice(0, safeUntil);
      carry = combined.slice(safeUntil);

      return strip(head);
    },
    /** Flush whatever's left in the carry buffer (call at end-of-stream). */
    flush(): string {
      const tail = strip(carry);
      carry = "";
      return tail;
    },
  };
}

/**
 * Remove the common markdown noise so a TTS engine reads natural prose.
 * Designed to be idempotent and safe on partial input.
 */
function strip(text: string): string {
  if (!text) return text;

  let out = text;

  // Code fences — drop entirely (the spoken version doesn't read code well)
  out = out.replace(/```[\s\S]*?```/g, " ");
  out = out.replace(/```/g, " ");
  // Inline code — keep the contents, drop the backticks
  out = out.replace(/`([^`]+)`/g, "$1");

  // Headings — drop leading #s on a new line
  out = out.replace(/(^|\n)#{1,6}\s+/g, "$1");

  // Bold/italic markers
  out = out.replace(/\*\*([^*]+)\*\*/g, "$1");
  out = out.replace(/__([^_]+)__/g, "$1");
  out = out.replace(/\*([^*]+)\*/g, "$1");
  out = out.replace(/_([^_]+)_/g, "$1");
  // Stray markers left over (open-ended bold mid-stream)
  out = out.replace(/\*+/g, "");
  out = out.replace(/_{2,}/g, "");

  // List bullets at line start — drop the marker, keep a comma so prosody pauses
  out = out.replace(/(^|\n)[\-*+]\s+/g, "$1");
  // Numbered lists "1. " etc — drop the number+dot
  out = out.replace(/(^|\n)\d+\.\s+/g, "$1");

  // Blockquote markers
  out = out.replace(/(^|\n)>\s+/g, "$1");

  // Horizontal rules
  out = out.replace(/(^|\n)[-*_]{3,}\s*(\n|$)/g, "$1");

  // Links: [text](url) → text
  out = out.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
  // Images: ![alt](url) → alt
  out = out.replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1");

  return out;
}
