import { DM_Serif_Display, DM_Sans } from "next/font/google";

const serif = DM_Serif_Display({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-serif",
  display: "swap",
});

const sans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-body",
  display: "swap",
});

export default function LandingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className={`${serif.variable} ${sans.variable}`} style={{ fontFamily: "var(--font-body), system-ui, sans-serif" }}>
      {children}
    </div>
  );
}
