"use client";

/**
 * Prosody parser + SSML compiler. Replaces the older `speakable.ts`.
 *
 * Streaming input: assistant text deltas (possibly mid-tag, possibly with
 * markdown leakage). Output: a sequence of SSMLChunk objects whose `ssml`
 * field is a self-contained SSML fragment. The fragments concatenate to a
 * legal SSML document body.
 *
 * Why SSML even though Aura doesn't formally accept it (as of 2026-05):
 * the prosody tag translation is still useful — it strips `[pause]` /
 * `[soft]` etc. so Aura never reads them literally. The TTS layer
 * (`tts.ts`) gracefully degrades by stripping SSML tags before sending to
 * Aura, leaving the natural prose only. If/when Aura ships SSML support
 * the same chunks flow through unchanged.
 *
 * playedUpToChar() returns a running count of characters that have been
 * emitted (post-markdown-strip, post-tag-translation — the actual
 * speakable text length). Phase 4 barge-in uses this to truncate the
 * stored assistant message at the exact byte the user interrupted.
 */

export interface SSMLChunk {
  /** Self-contained SSML fragment. May be empty if delta was all markup. */
  ssml: string;
  /** True if the chunk ends with sentence-terminating punctuation. */
  sentenceComplete: boolean;
}

export interface ProsodyStream {
  push(delta: string): SSMLChunk[];
  flush(): SSMLChunk[];
  /** Running count of speakable characters emitted so far. */
  playedUpToChar(): number;
}

const SENTENCE_BOUNDARY = /([.!?]+)(\s|$)/;

function stripMarkdown(text: string): string {
  let out = text;
  // Code fences — drop entirely (the spoken version doesn't read code well)
  out = out.replace(/```[\s\S]*?```/g, " ");
  out = out.replace(/```/g, " ");
  // Inline code — keep the contents
  out = out.replace(/`([^`]+)`/g, "$1");
  // Headings
  out = out.replace(/(^|\n)#{1,6}\s+/g, "$1");
  // Bold/italic markers
  out = out.replace(/\*\*([^*]+)\*\*/g, "$1");
  out = out.replace(/__([^_]+)__/g, "$1");
  out = out.replace(/\*([^*]+)\*/g, "$1");
  out = out.replace(/_([^_]+)_/g, "$1");
  // Stray markers
  out = out.replace(/\*+/g, "");
  out = out.replace(/_{2,}/g, "");
  // Stray backticks (mid-stream inline code with no closing pair)
  out = out.replace(/`+/g, "");
  // List bullets
  out = out.replace(/(^|\n)[\-*+]\s+/g, "$1");
  out = out.replace(/(^|\n)\d+\.\s+/g, "$1");
  // Blockquote markers
  out = out.replace(/(^|\n)>\s+/g, "$1");
  // Horizontal rules
  out = out.replace(/(^|\n)[-*_]{3,}\s*(\n|$)/g, "$1");
  // Links / images
  out = out.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
  out = out.replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1");
  return out;
}

function translateTags(text: string): string {
  let out = text;
  out = out.replace(/\[pause:(\d+)(?:ms)?\]/gi, '<break time="$1ms"/>');
  out = out.replace(/\[pause\]/gi, '<break time="300ms"/>');
  out = out.replace(
    /\[soft\]([\s\S]*?)\[\/soft\]/gi,
    '<prosody volume="soft">$1</prosody>'
  );
  out = out.replace(
    /\[emphasized\]([\s\S]*?)\[\/emphasized\]/gi,
    '<emphasis level="strong">$1</emphasis>'
  );
  out = out.replace(
    /\[warm\]([\s\S]*?)\[\/warm\]/gi,
    '<prosody pitch="-5%" rate="0.95">$1</prosody>'
  );
  out = out.replace(/\[laughs\]/gi, '<break time="200ms"/>');
  // Strip any unknown / leftover tags silently so Aura never reads them.
  out = out.replace(/\[[a-zA-Z/][^\]]*\]/g, "");
  return out;
}

/**
 * Approximate the speakable character count for cursor tracking. Counts the
 * post-strip, post-translate text length, excluding SSML markup.
 */
function speakableCharCount(ssml: string): number {
  // Strip all <...> tags
  const stripped = ssml.replace(/<[^>]+>/g, "");
  return stripped.length;
}

export function createProsodyStream(): ProsodyStream {
  let carry = "";
  let playedChars = 0;

  function emit(text: string): SSMLChunk[] {
    if (!text) return [];
    const stripped = stripMarkdown(text);
    const ssml = translateTags(stripped);
    playedChars += speakableCharCount(ssml);
    const sentenceComplete = SENTENCE_BOUNDARY.test(stripped);
    return [{ ssml, sentenceComplete }];
  }

  return {
    push(delta) {
      const combined = carry + delta;

      // Hold back any open prosody tag — if we see '[' without a matching ']'
      // later in the buffer, the tag might still be streaming in.
      const lastOpen = combined.lastIndexOf("[");
      const lastClose = combined.lastIndexOf("]");
      if (lastOpen > lastClose) {
        const safe = combined.slice(0, lastOpen);
        carry = combined.slice(lastOpen);
        return emit(safe);
      }

      // Also hold back trailing chars that could be the start of a markdown
      // marker or a new prosody tag (`[`). Same logic as the old speakable.
      const TAIL = new Set(["*", "_", "`", "!", "[", "\\"]);
      let n = combined.length;
      while (n > 0 && TAIL.has(combined[n - 1])) n--;
      const safe = combined.slice(0, n);
      carry = combined.slice(n);
      return emit(safe);
    },
    flush() {
      const tail = emit(carry);
      carry = "";
      return tail;
    },
    playedUpToChar() {
      return playedChars;
    },
  };
}
