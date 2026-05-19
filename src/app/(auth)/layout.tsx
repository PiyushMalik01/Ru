import { DM_Serif_Display, DM_Sans } from "next/font/google";
import { AuthDecor } from "@/components/auth/auth-decor";

// Same fonts as the landing page so the auth surface reads as part of the
// same world, not a generic SaaS login.
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

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div
      className={`${serif.variable} ${sans.variable} relative min-h-screen overflow-hidden`}
      style={{
        background: "#f4ecf2",
        fontFamily: "var(--font-body), system-ui, sans-serif",
        color: "#2d2a26",
      }}
    >
      {/* Faint paper grain + warm vignette so the cream surface has weight */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            "radial-gradient(circle at 50% 0%, rgba(26,86,50,0.06), transparent 60%), radial-gradient(circle at 100% 100%, rgba(217,251,96,0.08), transparent 55%)",
        }}
      />

      <div className="relative grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
        {/* Decorative half — only renders on lg+ (form takes the full screen on mobile) */}
        <AuthDecor />

        {/* Form half */}
        <div className="flex items-center justify-center px-5 py-12 lg:px-10">
          {children}
        </div>
      </div>
    </div>
  );
}
