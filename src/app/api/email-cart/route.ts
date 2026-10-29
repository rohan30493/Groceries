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
  checkCartEmailCooldown,
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
 * Read-only cooldown status for the button. Returns only a remaining-seconds
 * number - no email addresses, no mail content, no credentials. -1 means a
 * recent send was detected but its exact time was not readable.
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
    const status = await checkCartEmailCooldown(
      { user: env.user, pass: env.pass },
      env.to
    );
    const remaining =
      status.limited && status.retryAt
        ? Math.max(0, Math.ceil((status.retryAt.getTime() - Date.now()) / 1000))
        : status.limited
          ? -1
          : 0;
    return NextResponse.json({
      ok: true,
      cooldownSecondsRemaining: remaining,
    });
  } catch {
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
 * - A one-hour cooldown is enforced against the account's own Gmail Sent
 *   mail (durable across devices, redeploys and database wipes); when that
 *   check cannot be completed the send fails closed.
 * - A best-effort Supabase mutex stops overlapping clicks double-sending.
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
    checkCooldown: () =>
      checkCartEmailCooldown({ user: env.user, pass: env.pass }, env.to),
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
      case "cooldown":
        return NextResponse.json(
          {
            ok: false,
            error: "A cart email was sent within the last hour.",
            retryAt: result.retryAt,
          },
          { status: 429 }
        );
      case "in-progress":
        return NextResponse.json(
          {
            ok: false,
            error: "A send is already in progress. Try again shortly.",
          },
          { status: 429 }
        );
      case "unavailable":
        return NextResponse.json(
          {
            ok: false,
            error: "Could not verify the send cooldown. Try again shortly.",
          },
          { status: 503 }
        );
    }
  } catch (err) {
    console.error("[email-cart] send failed:", err);
    return NextResponse.json(
      { ok: false, error: "Could not send the email." },
      { status: 502 }
    );
  }
}
