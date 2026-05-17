"use client";

import { useState } from "react";
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
      setMessage("You're on the list. We'll be in touch.");
      setEmail("");
    } else {
      setStatus("error");
      setMessage(result.error ?? "Something went wrong.");
    }
  }

  return (
    <section className="relative overflow-hidden px-6 py-28 md:px-12 md:py-40" style={{ background: "#e8593c" }}>
      {/* Decorative circles */}
      <svg className="pointer-events-none absolute right-[10%] top-[15%] opacity-[0.1]" width="200" height="200" viewBox="0 0 200 200" fill="none">
        <circle cx="100" cy="100" r="80" stroke="#fff" strokeWidth="1.5" strokeDasharray="6 8" />
        <circle cx="100" cy="100" r="50" stroke="#fff" strokeWidth="1" strokeDasharray="4 6" />
      </svg>
      <svg className="pointer-events-none absolute left-[5%] bottom-[10%] opacity-[0.08]" width="120" height="120" viewBox="0 0 120 120" fill="none">
        <circle cx="60" cy="60" r="50" stroke="#fff" strokeWidth="1.5" />
      </svg>

      <div className="relative mx-auto max-w-3xl">
        <ScrollReveal>
          <h2
            className="font-bold leading-tight"
            style={{ fontFamily: "var(--font-serif)", color: "#fff", fontSize: "clamp(36px, 6vw, 72px)", lineHeight: 1.1 }}
          >
            Your life is complicated enough.
          </h2>
          <p
            className="mt-3"
            style={{ fontFamily: "var(--font-serif)", color: "rgba(255,255,255,0.7)", fontSize: "clamp(28px, 4vw, 48px)", lineHeight: 1.2 }}
          >
            Your organizer shouldn&apos;t be.
          </p>
        </ScrollReveal>

        <ScrollReveal delay={0.15}>
          <div className="mt-10 flex flex-col items-start gap-4">
            {status === "success" ? (
              <p className="text-lg font-semibold text-white">{message}</p>
            ) : (
              <form
                onSubmit={handleSubmit}
                className="flex w-full max-w-md items-center overflow-hidden rounded-full shadow-xl"
                style={{ background: "#fff" }}
              >
                <input
                  type="email"
                  required
                  placeholder="Your email address"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="flex-1 bg-transparent px-6 py-4 text-sm focus:outline-none"
                  style={{ color: "#2d2a26" }}
                />
                <button
                  type="submit"
                  disabled={status === "loading"}
                  className="m-1.5 rounded-full px-6 py-3 text-sm font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                  style={{ background: "#2d2a26" }}
                >
                  {status === "loading" ? "Joining..." : "Join waitlist"}
                </button>
              </form>
            )}

            {status === "error" && (
              <p className="text-sm font-medium text-white/80">{message}</p>
            )}

            <a href="#" className="text-sm font-medium text-white/70 underline-offset-4 transition-colors hover:text-white hover:underline">
              or sign up now →
            </a>
          </div>
        </ScrollReveal>
      </div>
    </section>
  );
}
