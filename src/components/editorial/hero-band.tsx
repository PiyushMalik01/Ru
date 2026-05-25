// Editorial hero band — eyebrow · Fraunces title with period · subtitle.
// Directly modeled on the Flutter `HeroBand` widget in
// `F:/ru/mobile/lib/core/widgets/hero_band.dart` so the two apps read as
// the same magazine.

import { cn } from "@/lib/utils";

interface Props {
  eyebrow: string;
  title: string;
  subtitle?: string;
  trailing?: React.ReactNode;
}

export function HeroBand({ eyebrow, title, subtitle, trailing }: Props) {
  return (
    <header className="flex flex-col gap-2.5">
      <div
        className={cn(
          "font-mono text-[11px] uppercase tracking-[0.22em] text-muted-foreground",
        )}
        style={{ fontVariationSettings: "'wght' 580, 'wdth' 100" }}
      >
        {eyebrow}
      </div>
      <div className="flex items-end justify-between gap-4">
        <h1
          className="font-display lowercase leading-[0.95] text-foreground"
          style={{
            fontSize: "clamp(36px, 5.6vw, 56px)",
            fontVariationSettings: "'wght' 580, 'opsz' 96",
            letterSpacing: "-0.03em",
          }}
        >
          {title}
        </h1>
        {trailing && <div className="shrink-0">{trailing}</div>}
      </div>
      {subtitle && (
        <p
          className="max-w-[60ch] text-[14px] leading-[1.45] text-muted-foreground"
          style={{ fontVariationSettings: "'wght' 460, 'wdth' 96" }}
        >
          {subtitle}
        </p>
      )}
    </header>
  );
}
