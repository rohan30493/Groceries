import { NextResponse } from "next/server";
import nodemailer from "nodemailer";
import {
  fetchGroceryItems,
  fetchEmailCartStateDb,
  claimEmailCartSendDb,
  releaseEmailCartSendDb,
} from "../../../lib/supabase";
import {
  CartEmailSendDeps,
  EmailCartState,
  executeCartEmailSend,
} from "../../../lib/emailCart";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

function readEmailEnv(): { user: string; pass: string; to: string } | null {
  const user = process.env.EMAIL_USER;
  const pass = process.env.EMAIL_PASS;
  const to = process.env.EMAIL_TO;
  if (!user || !pass || !to) return null;
  return { user, pass, to };
}

/**
 * GET /api/email-cart
 *
 * Read-only readiness probe: verifies the configured Gmail SMTP login with
 * nodemailer's verify (connection + AUTH only - no message is sent).
 * Returns no addresses, mail content or credentials.
 */
export async function GET() {
  const env = readEmailEnv();
  if (!env) {
    return NextResponse.json(
      { ok: false, error: "Email is not configured yet." },
      { status: 503 }
    );
  }
  try {
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: { user: env.user, pass: env.pass },
    });
    await transporter.verify();
    console.error("[email-cart] SMTP verify: OK");
    return NextResponse.json({ ok: true, cooldownSecondsRemaining: 0 });
  } catch (err) {
    // Strictly sanitized diagnostics: error class only, never server
    // responses, hosts, addresses or credential material.
    const name = err instanceof Error ? err.name : "unknown";
    const shape = err as { code?: unknown; responseCode?: unknown };
    const code =
      typeof shape.code === "string" && /^[A-Z0-9_]{2,24}$/.test(shape.code)
        ? ` ${shape.code}`
        : "";
    const rsp =
      typeof shape.responseCode === "number" ? ` ${shape.responseCode}` : "";
    console.error(`[email-cart] SMTP verify failed: ${name}${code}${rsp}`);
    return NextResponse.json(
      { ok: false, error: "Email status unavailable." },
      { status: 503 }
    );
  }
}

/**
 * POST /api/email-cart
 *
 * Sends the current pending cart to the configured recipient, triggered by
 * the "Email Rohan" button click. Abuse posture for this public endpoint:
 * - Items are re-read from Supabase here; nothing in the request body is
 *   used, so no one can inject content.
 * - Recipient is fixed server-side via EMAIL_TO; no one can redirect it.
 * - A best-effort Supabase mutex stops overlapping clicks double-sending
 *   while a send is in flight. There is no timed resend restriction.
 */
export async function POST() {
  const env = readEmailEnv();
  if (!env) {
    console.error("[email-cart] Missing EMAIL_USER/EMAIL_PASS/EMAIL_TO env");
    return NextResponse.json(
      { ok: false, error: "Email is not configured yet." },
      { status: 500 }
    );
  }

  const deps: CartEmailSendDeps = {
    recipient: env.to,
    now: () => Date.now(),
    fetchState: () => fetchEmailCartStateDb(),
    claimLock: (expected: EmailCartState | null, acquired: EmailCartState) =>
      claimEmailCartSendDb(expected, acquired),
    releaseLock: (acquired: EmailCartState, restore: EmailCartState | null) =>
      releaseEmailCartSendDb(acquired, restore),
    loadItems: () => fetchGroceryItems(),
    send: async (email) => {
      const transporter = nodemailer.createTransport({
        service: "gmail",
        auth: { user: env.user, pass: env.pass },
      });
      await transporter.sendMail({
        from: `"Household Groceries" <${env.user}>`,
        to: email.recipient,
        subject: email.subject,
        text: email.body,
      });
    },
  };

  try {
    const result = await executeCartEmailSend(deps);
    switch (result.kind) {
      case "sent":
        return NextResponse.json({ ok: true });
      case "no-pending":
        return NextResponse.json(
          { ok: false, error: "No pending items to send." },
          { status: 400 }
        );
      case "in-progress":
        return NextResponse.json(
          {
            ok: false,
            error: "A send is already in progress. Try again shortly.",
          },
          { status: 429 }
        );
    }
  } catch (err) {
    const name = err instanceof Error ? err.name : "unknown";
    const code =
      typeof (err as { code?: unknown }).code === "string" &&
      /^[A-Z0-9_]{2,24}$/.test((err as { code: string }).code)
        ? ` ${(err as { code: string }).code}`
        : "";
    console.error(`[email-cart] send failed: ${name}${code}`);
    return NextResponse.json(
      { ok: false, error: "Could not send the email." },
      { status: 502 }
    );
  }
}
