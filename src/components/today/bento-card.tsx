// Bento tile — v2: full saturated tile backgrounds.
//
// Each tile picks one variant. Variants control both the background color
// AND the foreground text color so contrast is automatic. Type inside the
// tile inherits the chosen foreground; opacity utilities (text-current/60)
// give muted captions without leaving the palette.
//
// Variants:
//   task      → cobalt bg, white type
//   routine   → lime bg, black type
//   reminder  → coral bg, dark type
//   activity  → magenta bg, white type
//   plan      → ochre bg, dark type
//   insight   → teal bg, dark type
//   charcoal  → near-black bg, cream type (for variety / heroes)
//   cream     → cream/white bg, dark type (neutral breathing-room tile)
//
// Hover lifts the tile 2px with a soft shadow. Mark `staticTile` to disable.

import Link from "next/link";
import { cn } from "@/lib/utils";

export type BentoVariant =
  | "task"
  | "routine"
  | "reminder"
  | "activity"
  | "plan"
  | "insight"
  | "charcoal"
  | "cream";

const VARIANT_BG: Record<BentoVariant, string> = {
  task:     "var(--entity-task)",
  routine:  "var(--entity-routine)",
  reminder: "var(--entity-reminder)",
  activity: "var(--entity-activity)",
  plan:     "var(--entity-plan)",
  insight:  "var(--entity-insight)",
  charcoal: "var(--entity-charcoal)",
  cream:    "var(--card)",
};

const VARIANT_FG: Record<BentoVariant, string> = {
  task:     "var(--entity-task-fg)",
  routine:  "var(--entity-routine-fg)",
  reminder: "var(--entity-reminder-fg)",
  activity: "var(--entity-activity-fg)",
  plan:     "var(--entity-plan-fg)",
  insight:  "var(--entity-insight-fg)",
  charcoal: "var(--entity-charcoal-fg)",
  cream:    "var(--card-foreground)",
};

interface BaseProps {
  variant: BentoVariant;
  /** Tailwind grid placement classes (col-span / row-span). */
  className?: string;
  /** Optional small uppercase mono eyebrow at the top of the tile. */
  eyebrow?: string;
  /** Inner content. */
  children: React.ReactNode;
  /** Disable hover lift (use for non-interactive informational tiles). */
  staticTile?: boolean;
}

interface AsLink extends BaseProps {
  href: string;
}

interface AsDiv extends BaseProps {
  href?: undefined;
}

type Props = AsLink | AsDiv;

export function BentoCard(props: Props) {
  const { variant, className, eyebrow, children, staticTile } = props;
  const style = {
    ["--bento-bg" as string]: VARIANT_BG[variant],
    ["--bento-fg" as string]: VARIANT_FG[variant],
  };

  const inner = (
    <div className="flex h-full flex-col p-6">
      {eyebrow && (
        <div className="mb-4 font-mono text-[10px] font-semibold uppercase tracking-[0.18em] opacity-70">
          {eyebrow}
        </div>
      )}
      <div className="flex-1">{children}</div>
    </div>
  );

  if ("href" in props && props.href) {
    return (
      <Link
        href={props.href}
        data-static={staticTile ? "true" : undefined}
        className={cn("ru-bento group block", className)}
        style={style}
      >
        {inner}
      </Link>
    );
  }

  return (
    <div
      data-static={staticTile ? "true" : undefined}
      className={cn("ru-bento", className)}
      style={style}
    >
      {inner}
    </div>
  );
}
