import "server-only";

import { env, features } from "@/lib/env";

/**
 * Minimal Resend client.
 *
 * Not the vendor SDK, for the same reason `lib/ai/client.ts` and
 * `lib/server/redis.ts` aren't: the surface used here is one POST with a JSON
 * body, and any transactional provider could replace it.
 *
 * **Nothing here ever throws.** Email is a notification channel, not a
 * transaction — a provider outage must not roll back a settlement that was
 * genuinely recorded. Callers get a boolean and are free to ignore it.
 */

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
}

export function isEmailConfigured(): boolean {
  return features.email;
}

export async function sendEmail(message: EmailMessage, timeoutMs = 5000): Promise<boolean> {
  if (!features.email) return false;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: env.EMAIL_FROM,
        to: [message.to],
        subject: message.subject,
        text: message.text,
      }),
    });

    if (!response.ok) {
      /**
       * The recipient address is logged, the body is not.
       *
       * Resend's most common rejection is worth naming plainly: with no
       * verified domain it only delivers to the address the account was
       * created with, so every other recipient comes back 403. That reads as
       * "email is broken" until you know it is a domain-verification step.
       */
      console.warn(
        `[fintrack] email to ${message.to} rejected with ${response.status}` +
          (response.status === 403
            ? " — Resend only delivers to the account owner until a domain is verified"
            : "")
      );
      return false;
    }

    return true;
  } catch (error) {
    console.warn(
      "[fintrack] email delivery failed:",
      error instanceof Error && error.name === "AbortError"
        ? `timed out after ${timeoutMs}ms`
        : "provider unreachable"
    );
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * The reset link.
 *
 * Sent only to an address that already has an account — the request endpoint
 * answers identically either way, so silence here is what stops the form from
 * being an account-existence oracle.
 */
export async function sendPasswordResetEmail(params: {
  to: string;
  name: string;
  resetUrl: string;
  expiresInMinutes: number;
}): Promise<boolean> {
  return sendEmail({
    to: params.to,
    subject: "Reset your FinTrack password",
    text: [
      `Hi ${params.name},`,
      "",
      "Use this link to choose a new password:",
      params.resetUrl,
      "",
      `It expires in ${params.expiresInMinutes} minutes and can only be used once.`,
      "",
      "If you didn't ask for this, ignore it — your password stays as it is and",
      "the link stops working on its own.",
    ].join("\n"),
  });
}

/**
 * The one notification worth an email.
 *
 * A pending settlement is the only event that needs the recipient to *act*,
 * and it blocks someone else's balance until they do. Everything else —
 * expense added, payment confirmed — is a record of something already
 * finished, and belongs in the in-app feed where it already is. Emailing all
 * of them would put a provider round trip inside every write and train people
 * to ignore the channel.
 */
export async function sendSettlementRequestEmail(params: {
  to: string;
  payerName: string;
  amount: string;
  groupName: string;
}): Promise<boolean> {
  return sendEmail({
    to: params.to,
    subject: `${params.payerName} says they paid you ${params.amount}`,
    text: [
      `${params.payerName} logged a payment of ${params.amount} to you in ${params.groupName}.`,
      "",
      "Nothing moves until you confirm it — open FinTrack to accept or decline.",
      "",
      "If this wasn't expected, decline it and the balance stays exactly as it was.",
    ].join("\n"),
  });
}
