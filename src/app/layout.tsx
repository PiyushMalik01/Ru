import type { Metadata } from "next";
import { Bricolage_Grotesque, Fraunces } from "next/font/google";
import { Providers } from "@/components/providers";
import { PRE_HYDRATION_SCRIPT } from "@/lib/theme";
import "./globals.css";

// Type system v2: TWO faces, max. Bricolage Grotesque does the work; Fraunces
// is the editorial accent.
//
// Bricolage Grotesque — variable workhorse. Carries body, UI, labels,
// navigation, and the chunky lowercase display headlines. Variable axes
// give us wght 200-800, wdth 75-100, opsz 12-96 — enough range to handle
// 11px labels and 96px posters from one font file.
const bricolage = Bricolage_Grotesque({
  subsets: ["latin"],
  variable: "--font-bricolage",
  display: "swap",
  axes: ["opsz", "wdth"],
});

// Fraunces — editorial accent serif. Reserved for the brand mark, big
// numeric stats inside cards, and the rare italic editorial aside. Not
// for every heading. The "italic last word + trailing period" formula
// is retired.
const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  display: "swap",
  axes: ["SOFT", "WONK", "opsz"],
});

export const metadata: Metadata = {
  title: "Ru",
  description: "Just talk. Your life gets organized.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Pre-hydration theme setter — runs before React mounts so the
            page renders with the correct theme class on first paint (no
            FOUC, no light-flash before switching to dark). Rendered inside
            <head> so React 19 doesn't flag it as an in-tree script. */}
        <script dangerouslySetInnerHTML={{ __html: PRE_HYDRATION_SCRIPT }} />
      </head>
      <body
        className={`${bricolage.variable} ${fraunces.variable} font-sans antialiased`}
      >
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
