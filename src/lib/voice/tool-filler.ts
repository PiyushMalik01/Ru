/**
 * Tool filler phrase bank — Surpass feature #1.
 *
 * When the LLM decides to call a tool during a voice turn, there's a dead
 * gap between "[…thinking…]" and "[…tool result…stream resumes…]". On the
 * wire it's hundreds of ms; with a fuzzy DB lookup or a remote OAuth-ed
 * mutation it can be a second or more. Without something to bridge it, the
 * user hears silence and starts to wonder if Ru froze.
 *
 * The fix: speak a brief, tool-appropriate filler the instant the tool
 * call lands. "On it." / "Adding that now." / "Let me check." Short phrases
 * that buy us cover, give the conversation rhythm, and signal that
 * something is happening. They're tone-appropriate to the action so it
 * doesn't sound generic.
 *
 * Behavior:
 *  - Phrase bank keyed by tool name. Each entry has 1-3 alternates so we
 *    don't sound robotic when the same tool fires twice.
 *  - `getFillerFor(name, { previousFiller })` picks one and avoids
 *    repeating the last one if there's an alternate available.
 *  - Unknown tools fall through to `default` ("One sec." etc.) — graceful
 *    degrade when a new tool ships before this bank gets updated.
 *
 * Some phrases include a short [pause:Nms] tag so the prosody pipeline
 * inserts a natural beat — but callers feed these via `tts.speak(filler,
 * { format: "plain" })` which means the prosody parser still translates
 * the tags into <break/> SSML before they hit Aura. Plain-text fillers
 * with embedded tags are fine; the prosody layer is tag-aware regardless
 * of format flag.
 */

const PHRASE_BANK: Record<string, string[]> = {
  // ─── Memory + episodes ─────────────────────────────────────────────
  note_episode: ["Got it, saving that.", "Mhm, locking that in.", "Alright, I'll remember."],
  update_memory_profile: ["Noting that.", "Got it."],
  forget: ["Okay, letting that go.", "Removing it."],

  // ─── Tasks ─────────────────────────────────────────────────────────
  create_task: ["Adding that now.", "On the list.", "One sec, putting it down."],
  modify_task: ["Updating that.", "One sec."],
  complete_task: ["Done. [pause:200] Nice.", "Got it, marking it done."],
  delete_task: ["Removing it."],

  // ─── Routines ──────────────────────────────────────────────────────
  declare_routine: ["Setting that up.", "Got it, adding the routine."],
  modify_routine: ["Tweaking that now."],
  complete_routine: ["Marked. [pause:150] Nice work.", "Logged for today."],
  delete_routine: ["Removing it."],
  skip_routine_today: ["Skipping for today.", "Got it, rest day."],

  // ─── Activities ────────────────────────────────────────────────────
  log_activity: ["Logged.", "Got it, logging.", "On it."],
  modify_activity: ["Updating that one.", "One sec."],
  delete_activity: ["Scratching it.", "Removing it."],

  // ─── Reminders ─────────────────────────────────────────────────────
  create_reminder: ["Setting the reminder.", "Got it, I'll nudge you."],
  complete_reminder: ["Dismissed."],
  snooze_reminder: ["Pushing it back.", "One sec."],
  modify_reminder: ["Updating that.", "One sec."],
  delete_reminder: ["Removing it."],

  // ─── Trackers ──────────────────────────────────────────────────────
  create_tracker: ["One sec, building the tracker.", "Setting that up."],
  log_tracker_entry: ["Adding that to the tracker.", "Logged."],
  update_tracker: ["Updating the tracker.", "One sec."],
  delete_tracker_entry: ["Scratching the last entry."],

  // ─── Workspaces ────────────────────────────────────────────────────
  open_workspace: ["Let me lay this out…", "One sec, opening it up."],
  close_workspace: ["Closing it out."],
  rename_workspace: ["Renaming it."],
  archive_workspace: ["Tucking it away."],

  // ─── Analytics + history ───────────────────────────────────────────
  query_analytics: ["Let me check.", "Looking that up.", "One sec."],
  get_routine_history: ["Let me check.", "Pulling that up."],

  // ─── Profile + chat ────────────────────────────────────────────────
  update_profile: ["Got it.", "Updated."],
  rename_chat: ["Renaming.", "One sec."],
  archive_chat: ["Tucking it away."],

  // ─── Fallback ──────────────────────────────────────────────────────
  default: ["One sec.", "Hold on.", "Let me grab that."],
};

function pick(arr: string[], previous?: string): string {
  if (arr.length === 1) return arr[0];
  let choice: string;
  let attempts = 0;
  do {
    choice = arr[Math.floor(Math.random() * arr.length)];
    attempts++;
  } while (choice === previous && attempts < 4);
  return choice;
}

export function getFillerFor(
  toolName: string,
  opts?: { previousFiller?: string },
): string {
  const bank = PHRASE_BANK[toolName] ?? PHRASE_BANK.default;
  return pick(bank, opts?.previousFiller);
}
