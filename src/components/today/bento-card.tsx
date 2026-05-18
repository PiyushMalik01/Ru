// Bento tile — the structural unit of /today.
//
// Each tile carries an entity color identity expressed as a 4px left-strip.
// The card itself is flat — bg-card, hairline frame, generous padding. The
// strip is the only chromatic element; everything else (titles, numbers,
// counters) renders in foreground / muted tokens so the color hits hard.
//
// Hover lifts the tile 1px and widens the strip 4→6px in 150ms. Add
// `static` to disable the lift (use on non-interactive tiles).

import Link from "next/link";
import { cn } from "@/lib/utils";
import { ENTITY_COLOR_VAR, type EntityKind } from "@/components/app-shell/primitives";

interface BaseProps {
  tint: EntityKind;
  /** Small uppercase mono label at top-left, e.g. "now", "streak". */
  eyebrow?: string;
  /** Optional right-aligned mono caption in the header (e.g. count, status). */
  caption?: React.ReactNode;
  /** Tailwind grid placement classes — col-span / row-span etc. */
  className?: string;
  /** Inner content. */
  children: React.ReactNode;
  /** Disable hover-lift (for purely informational, non-clickable tiles). */
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
  const { tint, eyebrow, caption, className, children, staticTile } = props;
  const style = { ["--bento-color" as string]: ENTITY_COLOR_VAR[tint] };

  const inner = (
    <>
      {(eyebrow || caption) && (
        <div className="flex items-baseline justify-between gap-3 pl-5 pr-5 pt-4">
          {eyebrow ? (
            <span
              className="font-mono text-[10px] uppercase tracking-[0.18em]"
              style={{ color: ENTITY_COLOR_VAR[tint] }}
            >
              {eyebrow}
            </span>
          ) : (
            <span />
          )}
          {caption ? (
            <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground/70">
              {caption}
            </span>
          ) : null}
        </div>
      )}
      <div className="px-5 pb-5 pt-2">{children}</div>
    </>
  );

  if ("href" in props && props.href) {
    return (
      <Link
        href={props.href}
        data-static={staticTile ? "true" : undefined}
        className={cn("ru-bento flex flex-col group", className)}
        style={style}
      >
        {inner}
      </Link>
    );
  }

  return (
    <div
      data-static={staticTile ? "true" : undefined}
      className={cn("ru-bento flex flex-col", className)}
      style={style}
    >
      {inner}
    </div>
  );
}
