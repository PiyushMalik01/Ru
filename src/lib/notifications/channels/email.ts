import nodemailer, { type Transporter } from "nodemailer";
import type { DispatchInput } from "../types";
import { renderEmail } from "../templates";

let cached: Transporter | null = null;

function transporter(): Transporter | null {
  if (cached) return cached;
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host || !user || !pass) return null;
  cached = nodemailer.createTransport({
    host,
    port: parseInt(process.env.SMTP_PORT ?? "465", 10),
    secure: (process.env.SMTP_SECURE ?? "true") === "true",
    auth: { user, pass },
  });
  return cached;
}

export async function deliverEmail(
  input: DispatchInput,
  to: string
): Promise<boolean> {
  const tx = transporter();
  if (!tx) {
    console.warn("[notify:email] SMTP not configured — skipping");
    return false;
  }
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const { subject, html, text } = renderEmail(input, appUrl);

  try {
    await tx.sendMail({
      from: process.env.SMTP_FROM ?? `Ru <${process.env.SMTP_USER}>`,
      to,
      subject,
      html,
      text,
    });
    return true;
  } catch (e) {
    console.error("[notify:email] sendMail failed", e);
    return false;
  }
}

export async function deliverRawEmail({
  to,
  subject,
  html,
  text,
}: {
  to: string;
  subject: string;
  html: string;
  text: string;
}): Promise<boolean> {
  const tx = transporter();
  if (!tx) return false;
  try {
    await tx.sendMail({
      from: process.env.SMTP_FROM ?? `Ru <${process.env.SMTP_USER}>`,
      to,
      subject,
      html,
      text,
    });
    return true;
  } catch (e) {
    console.error("[notify:email] sendMail failed", e);
    return false;
  }
}
