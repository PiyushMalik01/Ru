"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { ScrollReveal } from "./scroll-reveal";
import { joinWaitlist } from "@/app/(landing)/actions";

export function FinalCta() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setStatus("loading");
    const result = await joinWaitlist(email.trim());
    if (result.success) {
      setStatus("success");
      setMessage("You’re on the list. We’ll be in touch.");
      setEmail("");
    } else {
      setStatus("error");
      setMessage(result.error ?? "Something went wrong.");
    }
  }

  return (
    <section id="waitlist" className="relative mx-3 overflow-hidden rounded-[32px] px-5 py-24 md:mx-6 md:rounded-[40px] md:px-12 md:py-40" style={{ background: "#1a5632" }}>
      {/* Hand-drawn pen scribble (replaces dashed circles) */}
      <svg
        aria-hidden="true"
        className="pointer-events-none absolute right-[6%] top-[12%] hidden md:block"
        width="220"
        height="220"
        viewBox="0 0 220 220"
        fill="none"
      >
        <path
          d="M118 18 C 55 16, 18 70, 26 130 C 34 188, 105 198, 158 178 C 202 162, 208 105, 184 65 C 165 30, 115 28, 88 42 C 65 55, 48 80, 46 110"
          stroke="#d9fb60"
          strokeWidth="1.8"
          strokeLinecap="round"
          fill="none"
          opacity="0.35"
        />
      </svg>

      {/* Underline marginalia under the heading on desktop */}
      <div className="relative mx-auto max-w-3xl">
        <ScrollReveal>
          <h2
            className="font-bold leading-tight"
            style={{ fontFamily: "var(--font-serif)", color: "#f5f5f0", fontSize: "clamp(34px, 6vw, 72px)", lineHeight: 1.1 }}
          >
            Your life is complicated{" "}
            <span style={{ position: "relative", display: "inline-block" }}>
              enough.
              <svg
                aria-hidden="true"
                viewBox="0 0 200 14"
                preserveAspectRatio="none"
                style={{
                  position: "absolute",
                  left: 0,
                  bottom: "-0.04em",
                  width: "100%",
                  height: "0.18em",
                  overflow: "visible",
                  pointerEvents: "none",
                }}
              >
                <path
                  d="M3 8 C 40 2, 80 11, 120 5 S 180 9, 197 6"
                  stroke="#d9fb60"
                  strokeWidth="3.5"
                  strokeLinecap="round"
                  fill="none"
                  opacity="0.85"
                />
              </svg>
            </span>
          </h2>
          <p
            className="mt-3"
            style={{ fontFamily: "var(--font-serif)", color: "rgba(217,251,96,0.8)", fontSize: "clamp(24px, 4vw, 48px)", lineHeight: 1.2 }}
          >
            Your organizer shouldn’t be.
          </p>
        </ScrollReveal>

        <ScrollReveal delay={0.15}>
          <div className="mt-10 flex flex-col items-start gap-4">
            {/* Beta status indicator */}
            <div className="flex items-center gap-2">
              <motion.span
                aria-hidden="true"
                className="inline-block h-2 w-2 rounded-full"
                style={{ background: "#d9fb60" }}
                animate={{ opacity: [0.3, 1, 0.3] }}
                transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
              />
              <span
                className="text-xs font-medium tracking-wide"
                style={{ color: "rgba(250,248,245,0.6)" }}
              >
                currently in beta · invites going out monthly
              </span>
            </div>

            {status === "success" ? (
              <motion.p
                initial={{ opacity: 0, y: 8, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ duration: 0.4, ease: "easeOut" }}
                className="text-lg font-semibold"
                style={{ color: "#d9fb60" }}
              >
                {message}
              </motion.p>
            ) : (
              <form
                onSubmit={handleSubmit}
                className="flex w-full max-w-md flex-col gap-2 overflow-hidden rounded-3xl bg-white p-1.5 shadow-xl sm:flex-row sm:items-center sm:rounded-full sm:p-1.5"
                style={{ border: "2px solid #d9fb60" }}
              >
                <input
                  type="email"
                  required
                  placeholder="Your email address"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="flex-1 bg-transparent px-5 py-3 text-sm focus:outline-none sm:px-6 sm:py-4"
                  style={{ color: "#2d2a26" }}
                />
                <motion.button
                  type="submit"
                  disabled={status === "loading"}
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                  className="rounded-full px-6 py-3 text-sm font-bold transition-colors hover:brightness-95 disabled:opacity-60 sm:py-3"
                  style={{ background: "#d9fb60", color: "#1a5632" }}
                >
                  {status === "loading" ? "Joining..." : "Join waitlist"}
                </motion.button>
              </form>
            )}

            {status === "error" && (
              <p className="text-sm font-medium" style={{ color: "rgba(250,248,245,0.85)" }}>{message}</p>
            )}

            <a
              href="#"
              className="text-sm font-medium underline-offset-4 transition-opacity hover:underline"
              style={{ color: "rgba(217,251,96,0.75)" }}
              onMouseEnter={(e) => (e.currentTarget.style.color = "rgba(217,251,96,1)")}
              onMouseLeave={(e) => (e.currentTarget.style.color = "rgba(217,251,96,0.75)")}
            >
              or sign up now →
            </a>
          </div>
        </ScrollReveal>
      </div>
    </section>
  );
}
