"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import { createClient } from "@/lib/supabase/client";

interface AuthFormProps {
  mode: "login" | "signup";
}

// Editorial auth card — matches the landing palette (cream paper, forest
// brand green, lime CTA) and adds real 3D depth via:
//   - a tilted card layer with layered drop shadows
//   - a stacked-offset submit button (the "lifted" lime block sits on top
//     of a static forest plate, so pressing it visibly seats it down)
//   - a small floating "live" pill above the card, drifting like the
//     landing constellation
//
// Google sign-in is intentionally removed.

export function AuthForm({ mode }: AuthFormProps) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const isLogin = mode === "login";

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const supabase = createClient();

    try {
      if (isLogin) {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
        router.push("/chat");
        router.refresh();
      } else {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { display_name: name },
          },
        });
        if (error) throw error;
        router.push("/chat");
        router.refresh();
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative w-full max-w-[440px]" style={{ perspective: "1400px" }}>
      {/* Brand for mobile — desktop has the AuthDecor rail */}
      <div className="mb-8 text-center lg:hidden">
        <Link href="/" className="relative inline-block">
          <span
            style={{
              fontFamily: "var(--font-serif)",
              fontSize: "56px",
              color: "#000000",
              lineHeight: 0.85,
              letterSpacing: "-0.035em",
            }}
          >
            ru<span style={{ color: "#1a5632" }}>.</span>
          </span>
          <svg
            aria-hidden
            className="pointer-events-none absolute -bottom-1 left-0"
            width="68"
            height="9"
            viewBox="0 0 68 9"
            fill="none"
          >
            <path
              d="M2 5 C 14 1, 32 8, 48 4 S 62 6, 66 5"
              stroke="#1a5632"
              strokeWidth="2.6"
              strokeLinecap="round"
              fill="none"
              opacity="0.8"
            />
          </svg>
        </Link>
      </div>

      {/* Floating mini-pill above the card — adds depth, mirrors the
          landing's drifting constellation. */}
      <motion.div
        initial={{ opacity: 0, y: 14, scale: 0.9 }}
        animate={{
          opacity: 1,
          y: [0, -4, 2, 0],
          scale: 1,
        }}
        transition={{
          opacity: { duration: 0.6, ease: "easeOut" },
          scale:   { duration: 0.6, ease: "easeOut" },
          y:       { duration: 6, repeat: Infinity, ease: "easeInOut", delay: 0.4 },
        }}
        className="absolute -top-6 left-6 z-20 hidden md:block"
        style={{ transform: "rotate(-4deg)" }}
      >
        <div
          className="inline-flex items-center gap-2 whitespace-nowrap rounded-full border px-3 py-1.5 text-[12px] shadow-md"
          style={{ background: "#d9fb60", borderColor: "#1a5632", color: "#1a5632" }}
        >
          <span aria-hidden className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: "#1a5632" }} />
          {isLogin ? "welcome back" : "new here"}
        </div>
      </motion.div>

      {/* Stacked card — the "plate" sits behind, the surface tilts forward.
          The plate is forest green, just peeking out at the bottom-right so
          the surface card reads as physically lifted off the page. */}
      <div
        aria-hidden
        className="absolute inset-0 rounded-[28px]"
        style={{
          background: "#1a5632",
          transform: "translate3d(8px, 10px, 0) rotate(0.8deg)",
        }}
      />

      <motion.div
        initial={{ opacity: 0, y: 20, rotateX: 6 }}
        animate={{ opacity: 1, y: 0, rotateX: 0 }}
        transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
        className="relative rounded-[28px] border p-7 md:p-9"
        style={{
          background: "#ffffff",
          borderColor: "#e8e4de",
          transformStyle: "preserve-3d",
          boxShadow:
            "0 1px 0 rgba(255,255,255,0.6) inset, 0 24px 60px -20px rgba(45,42,38,0.22), 0 6px 18px -8px rgba(45,42,38,0.14)",
        }}
      >
        {/* Heading */}
        <div className="mb-6">
          <div
            className="mb-2 font-mono text-[10px] uppercase tracking-[0.22em]"
            style={{ color: "#8a847b" }}
          >
            {isLogin ? "/ sign in" : "/ get started"}
          </div>
          <h1
            style={{
              fontFamily: "var(--font-serif)",
              fontSize: "36px",
              lineHeight: 1.05,
              color: "#0d1f15",
              letterSpacing: "-0.015em",
            }}
          >
            {isLogin ? (
              <>
                Welcome <em style={{ color: "#1a5632", fontStyle: "italic" }}>back</em>
                <span style={{ color: "#1a5632" }}>.</span>
              </>
            ) : (
              <>
                Hello, <em style={{ color: "#1a5632", fontStyle: "italic" }}>new friend</em>
                <span style={{ color: "#1a5632" }}>.</span>
              </>
            )}
          </h1>
          <p
            className="mt-2 text-[14.5px]"
            style={{ color: "#4a5547" }}
          >
            {isLogin
              ? "Pick up where you left off."
              : "Tell Ru about your day, the rest happens on its own."}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {!isLogin && (
            <Field
              id="name"
              label="Name"
              type="text"
              placeholder="What should Ru call you?"
              value={name}
              onChange={setName}
              autoComplete="name"
              required
            />
          )}

          <Field
            id="email"
            label="Email"
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={setEmail}
            autoComplete="email"
            required
          />

          <Field
            id="password"
            label="Password"
            type="password"
            placeholder={isLogin ? "Your password" : "At least 8 characters"}
            value={password}
            onChange={setPassword}
            autoComplete={isLogin ? "current-password" : "new-password"}
            required
            minLength={8}
          />

          {error && (
            <div
              role="alert"
              className="rounded-xl border px-4 py-3 text-[13px]"
              style={{
                background: "#fef2f0",
                borderColor: "#e85a3c",
                color: "#7d1a0d",
              }}
            >
              {error}
            </div>
          )}

          {/* Submit — stacked-offset 3D button. The shadow plate behind
              the lime surface gives it real depth; on press, the surface
              translates down to meet it. */}
          <div className="pt-2">
            <button
              type="submit"
              disabled={loading}
              className="group/cta relative block w-full"
            >
              <span
                aria-hidden
                className="absolute inset-0 translate-y-[5px] rounded-full"
                style={{ background: "#1a5632" }}
              />
              <span
                className="relative block rounded-full border-2 px-6 py-3.5 text-[15px] font-bold transition-transform group-hover/cta:-translate-y-[1px] group-active/cta:translate-y-[3px]"
                style={{
                  background: "#d9fb60",
                  borderColor: "#1a5632",
                  color: "#1a5632",
                  fontFamily: "var(--font-serif)",
                }}
              >
                {loading
                  ? isLogin
                    ? "Signing in…"
                    : "Creating your account…"
                  : isLogin
                    ? "Sign in →"
                    : "Create my account →"}
              </span>
            </button>
          </div>
        </form>

        {/* Footer link with the same italic-marker treatment as the nav */}
        <div className="mt-6 text-center">
          <span
            className="text-[14px]"
            style={{ color: "#6b6f66" }}
          >
            {isLogin ? (
              <>
                New to Ru?{" "}
                <Link
                  href="/signup"
                  className="relative inline-block"
                  style={{
                    fontFamily: "var(--font-serif)",
                    fontStyle: "italic",
                    color: "#1a5632",
                    fontSize: "15px",
                  }}
                >
                  create an account
                  <svg
                    aria-hidden
                    className="pointer-events-none absolute -bottom-[3px] left-0 right-0"
                    viewBox="0 0 130 8"
                    preserveAspectRatio="none"
                    style={{ height: "6px", width: "100%" }}
                  >
                    <path
                      d="M2 5 C 30 1, 70 7, 100 3 S 124 6, 128 4"
                      stroke="#1a5632"
                      strokeWidth="2.4"
                      strokeLinecap="round"
                      fill="none"
                      opacity="0.7"
                    />
                  </svg>
                </Link>
              </>
            ) : (
              <>
                Already here?{" "}
                <Link
                  href="/login"
                  className="relative inline-block"
                  style={{
                    fontFamily: "var(--font-serif)",
                    fontStyle: "italic",
                    color: "#1a5632",
                    fontSize: "15px",
                  }}
                >
                  sign in
                  <svg
                    aria-hidden
                    className="pointer-events-none absolute -bottom-[3px] left-0 right-0"
                    viewBox="0 0 60 8"
                    preserveAspectRatio="none"
                    style={{ height: "6px", width: "100%" }}
                  >
                    <path
                      d="M2 5 C 12 1, 30 7, 44 3 S 56 6, 58 4"
                      stroke="#1a5632"
                      strokeWidth="2.4"
                      strokeLinecap="round"
                      fill="none"
                      opacity="0.7"
                    />
                  </svg>
                </Link>
              </>
            )}
          </span>
        </div>
      </motion.div>

      {/* Fine print under the card */}
      <p
        className="mt-6 text-center text-[11px] tracking-wide"
        style={{ color: "#8a847b", fontFamily: "var(--font-body)" }}
      >
        By continuing you agree to be talked to like a person, not a database.
      </p>
    </div>
  );
}

// Form field with editorial styling — flat underline-only input that fits
// the paper aesthetic. Focus ring is a soft forest-tinted shadow.
function Field({
  id,
  label,
  type,
  placeholder,
  value,
  onChange,
  autoComplete,
  required,
  minLength,
}: {
  id: string;
  label: string;
  type: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete: string;
  required?: boolean;
  minLength?: number;
}) {
  return (
    <div className="space-y-1.5">
      <label
        htmlFor={id}
        className="block text-[12px] font-medium uppercase tracking-[0.14em]"
        style={{ color: "#6b6f66" }}
      >
        {label}
      </label>
      <input
        id={id}
        type={type}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        required={required}
        minLength={minLength}
        className="w-full rounded-xl border bg-transparent px-4 py-3 text-[15px] transition-all focus:outline-none"
        style={{
          borderColor: "#e8e4de",
          color: "#2d2a26",
          background: "#fbfaf7",
        }}
        onFocus={(e) => {
          e.currentTarget.style.borderColor = "#1a5632";
          e.currentTarget.style.boxShadow = "0 0 0 4px rgba(26,86,50,0.12)";
        }}
        onBlur={(e) => {
          e.currentTarget.style.borderColor = "#e8e4de";
          e.currentTarget.style.boxShadow = "none";
        }}
      />
    </div>
  );
}
