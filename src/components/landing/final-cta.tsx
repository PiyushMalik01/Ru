"use client";

import { useState } from "react";
import { ScrollReveal } from "./scroll-reveal";
import { WaveDivider } from "./wave-divider";
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
      setMessage("You're on the list. We'll be in touch. 🎉");
      setEmail("");
    } else {
      setStatus("error");
      setMessage(result.error ?? "Something went wrong.");
    }
  }

  return (
    <>
      <WaveDivider topColor="#0a0a0f" bottomColor="#1a0a2e" />

      <section className="relative overflow-hidden px-4 py-32 md:py-40" style={{ background: "linear-gradient(135deg, #1a0a2e 0%, #0f172a 50%, #0a1628 100%)" }}>
        {/* Colorful mesh */}
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background: `
              radial-gradient(circle 400px at 20% 30%, rgba(139,92,246,0.15) 0%, transparent 60%),
              radial-gradient(circle 350px at 80% 70%, rgba(244,114,182,0.12) 0%, transparent 60%),
              radial-gradient(circle 300px at 60% 20%, rgba(56,189,248,0.08) 0%, transparent 60%)
            `,
          }}
        />

        <div className="relative mx-auto max-w-3xl text-center">
          <ScrollReveal>
            <h2
              className="font-bold tracking-tight text-white"
              style={{ fontSize: "clamp(32px, 6vw, 64px)", lineHeight: 1.1 }}
            >
              Your life is complicated enough.
            </h2>
          </ScrollReveal>

          <ScrollReveal delay={0.08}>
            <p
              className="mt-3 bg-gradient-to-r from-purple-300 to-pink-300 bg-clip-text text-transparent"
              style={{ fontSize: "clamp(28px, 5vw, 56px)", lineHeight: 1.15, fontWeight: 300 }}
            >
              Your organizer shouldn&apos;t be.
            </p>
          </ScrollReveal>

          <ScrollReveal delay={0.18}>
            <div className="mt-12 flex flex-col items-center gap-5">
              {status === "success" ? (
                <p className="text-lg font-medium text-green-400">{message}</p>
              ) : (
                <form
                  onSubmit={handleSubmit}
                  className="flex w-full max-w-md items-center rounded-full border border-white/10 bg-white/5 shadow-2xl shadow-purple-500/10 backdrop-blur-sm"
                >
                  <input
                    type="email"
                    required
                    placeholder="Your email address"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="flex-1 bg-transparent px-6 py-4 text-sm text-white placeholder:text-white/30 focus:outline-none"
                  />
                  <button
                    type="submit"
                    disabled={status === "loading"}
                    className="m-1.5 rounded-full bg-gradient-to-r from-purple-500 to-pink-500 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-purple-500/25 transition-all hover:scale-[1.03] hover:shadow-xl disabled:opacity-50"
                  >
                    {status === "loading" ? "Joining..." : "Join waitlist"}
                  </button>
                </form>
              )}

              {status === "error" && (
                <p className="text-sm text-red-400">{message}</p>
              )}

              <div className="flex items-center gap-4">
                <div className="h-px w-12 bg-white/10" />
                <span className="text-xs text-white/20">or</span>
                <div className="h-px w-12 bg-white/10" />
              </div>

              <a
                href="#"
                className="text-sm font-medium text-purple-300 underline-offset-4 transition-colors hover:text-white hover:underline"
              >
                Sign up free →
              </a>
            </div>
          </ScrollReveal>
        </div>
      </section>
    </>
  );
}
