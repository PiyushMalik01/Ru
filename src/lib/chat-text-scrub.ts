/**
 * Defense-in-depth scrubber for assistant chat text.
 *
 * The system prompt forbids the model from emitting JSON, tool-call syntax,
 * or function-name slashes in its prose. The model usually complies, but
 * sometimes it slips — especially across providers + model sizes. This
 * scrubber catches the common leak patterns at render time so the user
 * never sees a half-written `{"name":"create_task"…}` blob.
 *
 * Conservative on purpose: false positives (eating real content) are worse
 * than false negatives (occasional leak slipping through). The patterns
 * here only fire on shapes that are unambiguously tool-call-shaped — a
 * legitimate user-facing message would never contain `"arguments":` or a
 * `<function_call>` tag.
 */

/**
 * JSON code-fence blocks whose body contains tool-call signatures. We don't
 * try to parse the JSON — a regex match on the shape ("name" + "arguments"
 * or "tool_use") inside a ```json fence is enough to be confident.
 */
const JSON_FENCE_TOOL_CALL =
  /```json\s*\n[\s\S]*?"(?:name|tool|function_name|tool_name)"\s*:[\s\S]*?"(?:arguments|args|input|parameters)"\s*:[\s\S]*?```/gi;

/**
 * XML-style function call / tool use tags. Some Claude variants emit these
 * when they think they're talking to a non-tool-aware client.
 */
const FUNCTION_TAG = /<function_call\b[\s\S]*?<\/function_call>/gi;
const TOOL_USE_TAG = /<tool_use\b[\s\S]*?<\/tool_use>/gi;

/**
 * Naked JSON objects with tool-call shape. Must contain BOTH "name" and
 * either "arguments" / "args" / "input" / "parameters" to match — so a
 * plain object the user is discussing doesn't get nuked.
 *
 * Real tool-call JSON typically has a nested object for arguments
 * (`"arguments": {...}`), so the inner-character class allows one level
 * of nested `{...}`.
 */
const NAKED_TOOL_CALL_JSON =
  /\{(?:[^{}]|\{[^{}]*\}){0,2000}?"(?:name|tool|function_name|tool_name)"\s*:(?:[^{}]|\{[^{}]*\}){0,2000}?"(?:arguments|args|input|parameters)"\s*:(?:[^{}]|\{[^{}]*\}){0,2000}?\}/g;

/**
 * Slash-command / pseudo-CLI tool references. We match the strict shape
 * `create_task /title=...` or `/create_task title=...` — verb-token plus
 * a slash plus key=value. Doesn't catch every variant the model can
 * invent but takes out the most common ones the user reported.
 */
const SLASH_CMD_LINE = /^\s*\/?[a-z_]+(?:\.[a-z_]+)?\s*\/(?:[a-z_]+=[^\s].*?)\s*$/gim;

/**
 * Entity-data JSON leaks. Real leak observed in a user chat:
 *   {"tracker":"Open Source Contributions","values":{"org":"Jenkins",...},"notes":"..."}
 * Pattern: a JSON object whose top-level keys are entity-data words
 * (tracker, task, routine, reminder, activity, workspace, plan) plus
 * "values" / "notes" / "details". Different shape from a tool-call
 * (no "name" / "arguments"), so the original scrubber missed it.
 */
const ENTITY_DATA_JSON =
  /\{(?:[^{}]|\{[^{}]*\}){0,2000}?"(?:tracker|task|routine|reminder|activity|workspace|plan|entity)"\s*:(?:[^{}]|\{[^{}]*\}){0,2000}?"(?:values|notes|details|status|fields|data)"\s*:(?:[^{}]|\{[^{}]*\}){0,2000}?\}/gi;

/**
 * Voice prosody tags — `[warm]…[/warm]`, `[soft]…[/soft]`, `[emphasized]…`,
 * `[pause]`, `[pause:300ms]`, `[laughs]`. These are valid prosody markup
 * for Aura TTS in voice mode but should NEVER appear in text-mode replies
 * (the model occasionally bleeds them through when the conversation
 * touches both modes). Strip both the wrapping tags AND keep the inner
 * content visible.
 */
const PROSODY_PAIRED = /\[(warm|soft|emphasized|emphasize|bright|slow|fast)\]([\s\S]*?)\[\/\1\]/gi;
const PROSODY_SOLO = /\[(pause(?::\d+m?s?)?|laughs|sigh|breath|click)\]/gi;

export function scrubAssistantText(input: string): string {
  if (!input) return input;
  let out = input;
  out = out.replace(JSON_FENCE_TOOL_CALL, "");
  out = out.replace(FUNCTION_TAG, "");
  out = out.replace(TOOL_USE_TAG, "");
  out = out.replace(NAKED_TOOL_CALL_JSON, "");
  out = out.replace(ENTITY_DATA_JSON, "");
  out = out.replace(SLASH_CMD_LINE, "");
  // Prosody tags: unwrap paired (keep inner text), strip solo.
  out = out.replace(PROSODY_PAIRED, "$2");
  out = out.replace(PROSODY_SOLO, "");
  // Collapse any 3+ consecutive newlines left behind by the deletions so
  // we don't leave huge gaps mid-prose.
  out = out.replace(/\n{3,}/g, "\n\n");
  return out;
}
