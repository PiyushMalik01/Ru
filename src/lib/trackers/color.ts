// Deterministically assign a palette slot to each tracker so the same tracker
// always shows the same color across pages and sessions. No manual color picker
// — the user explicitly asked us NOT to make color a customization knob.

const PALETTE = [
  { bg: "var(--entity-task)", fg: "var(--entity-task-fg)" }, // cobalt
  { bg: "var(--entity-routine)", fg: "var(--entity-routine-fg)" }, // lime
  { bg: "var(--entity-reminder)", fg: "var(--entity-reminder-fg)" }, // coral
  { bg: "var(--entity-activity)", fg: "var(--entity-activity-fg)" }, // pink
  { bg: "var(--entity-plan)", fg: "var(--entity-plan-fg)" }, // ochre
  { bg: "var(--entity-insight)", fg: "var(--entity-insight-fg)" }, // teal
];

export interface TrackerColor {
  bg: string;
  fg: string;
}

/** Hash a string to a stable non-negative integer. djb2 — small + good spread. */
function djb2(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

export function trackerColor(idOrName: string): TrackerColor {
  return PALETTE[djb2(idOrName) % PALETTE.length];
}
