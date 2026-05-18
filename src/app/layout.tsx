import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { Fraunces } from "next/font/google";
import { Providers } from "@/components/providers";
import "./globals.css";

// Fraunces — the editorial display serif. Used ONLY for hero numbers
// (streaks / progress / counts), the standfirst, and section openers.
// Variable font, so we load axes for SOFT (warmth), WONK (personality at
// display sizes), and opsz (optical-size compensation).
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
      <body
        className={`${GeistSans.variable} ${GeistMono.variable} ${fraunces.variable} font-sans antialiased`}
      >
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
