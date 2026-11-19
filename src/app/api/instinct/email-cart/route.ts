import { NextRequest, NextResponse } from "next/server";
import nodemailer from "nodemailer";
import {
  fetchGroceryItems,
  fetchEmailCartStateDb,
  claimEmailCartSendDb,
  releaseEmailCartSendDb,
} from "@/lib/supabase";
import {
  CartEmailSendDeps,
  EmailCartState,
  executeCartEmailSend,
} from "@/lib/emailCart";
import { validateApiToken } from "@/lib/instinctSummary";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

function checkAuth(req: NextRequest): boolean {
  const configuredSecret =
    process.env.INSTINCT_API_KEY || process.env.GROCERIES_API_KEY;
  const authHeader = req.headers.get("authorization") || "";
  const token =
    req.nextUrl.searchParams.get("token") ||
    authHeader.replace(/^Bearer\s+/i, "");
  return validateApiToken(token, configuredSecret);
}

function readEmailEnv(): { user: string; pass: string; to: string } | null {
  const user = process.env.EMAIL_USER;
  const pass = process.env.EMAIL_PASS;
  const to = process.env.EMAIL_TO;
  if (!user || !pass || !to) return null;
  return { user, pass, to };
}

/**
 * GET /api/instinct/email-cart
 * Readiness probe: checks if email dispatch is configured.
 */
export async function GET(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized. Invalid or missing secret token." },
      { status: 401 }
    );
  }

  const env = readEmailEnv();
  return NextResponse.json({
    ok: Boolean(env),
    configured: Boolean(env),
    recipient: env ? env.to : null,
  });
}

/**
 * POST /api/instinct/email-cart
 * Triggers dispatching the pending cart email to household recipients.
 */
export async function POST(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized. Invalid or missing secret token." },
      { status: 401 }
    );
  }

  const env = readEmailEnv();
  if (!env) {
    const errorMsg = "Email dispatch is not configured in server environment.";
    return NextResponse.json({ ok: false, error: errorMsg }, { status: 503 });
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
    const format = req.nextUrl.searchParams.get("format");

    switch (result.kind) {
      case "sent": {
        const msg = `📧 Grocery cart email successfully sent to ${env.to}.`;
        if (format === "text") {
          return new Response(msg, {
            status: 200,
            headers: { "Content-Type": "text/plain; charset=utf-8" },
          });
        }
        return NextResponse.json({ ok: true, message: msg });
      }
      case "no-pending": {
        const msg = "No pending items in cart to send.";
        if (format === "text") {
          return new Response(msg, {
            status: 400,
            headers: { "Content-Type": "text/plain; charset=utf-8" },
          });
        }
        return NextResponse.json({ ok: false, error: msg }, { status: 400 });
      }
      case "in-progress": {
        const msg =
          "An email dispatch is already in progress. Try again shortly.";
        if (format === "text") {
          return new Response(msg, {
            status: 429,
            headers: { "Content-Type": "text/plain; charset=utf-8" },
          });
        }
        return NextResponse.json({ ok: false, error: msg }, { status: 429 });
      }
    }
  } catch (err) {
    console.error("[api/instinct/email-cart] Error:", err);
    return NextResponse.json(
      { ok: false, error: "Could not send the email." },
      { status: 502 }
    );
  }
}
