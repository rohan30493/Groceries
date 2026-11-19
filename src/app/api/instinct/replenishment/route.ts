import { NextRequest, NextResponse } from "next/server";
import { fetchGroceryItems } from "@/lib/supabase";
import {
  computeReplenishmentReminders,
  validateApiToken,
} from "@/lib/instinctSummary";

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

/**
 * GET /api/instinct/replenishment
 * Exposes proactive replenishment recommendations based on household cadence.
 *
 * Query params:
 *  - token: Optional secret token
 *  - format: "text" | "json" (defaults to "json")
 */
export async function GET(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized. Invalid or missing secret token." },
      { status: 401 }
    );
  }

  try {
    const activeItems = await fetchGroceryItems();
    const payload = computeReplenishmentReminders(activeItems);

    const format = req.nextUrl.searchParams.get("format");
    const accept = req.headers.get("accept") || "";
    if (format === "text" || accept.includes("text/plain")) {
      return new Response(payload.summary, {
        status: 200,
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Cache-Control": "no-store, max-age=0",
        },
      });
    }

    return NextResponse.json(payload, {
      status: 200,
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
  } catch (error) {
    console.error("[api/instinct/replenishment] GET Error:", error);
    return NextResponse.json(
      { ok: false, error: "Failed to compute replenishment reminders." },
      { status: 500 }
    );
  }
}
