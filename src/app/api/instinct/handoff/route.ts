import { NextRequest, NextResponse } from "next/server";
import { fetchGroceryItems, fetchHandoffStateDb } from "@/lib/supabase";
import { estimateBasketValue } from "@/lib/handoffNotification";
import {
  getPendingGroceryItems,
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
 * GET /api/instinct/handoff
 * Returns current household basket state and whether it is ready for order.
 */
export async function GET(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized. Invalid or missing secret token." },
      { status: 401 }
    );
  }

  try {
    const rawItems = await fetchGroceryItems();
    const pending = getPendingGroceryItems(rawItems);
    const handoffState = await fetchHandoffStateDb();
    const est = estimateBasketValue(pending);

    const isReadyForOrder = handoffState?.status === "ready_for_order";
    const status =
      handoffState?.status || (pending.length > 0 ? "building" : "idle");

    let summary = "";
    if (isReadyForOrder) {
      summary = `🛍️ *Basket Ready for Order* (${pending.length} items · ~₹${est})\nLira has handed off the basket. Ready for Rohan to review and place.`;
    } else if (status === "building") {
      summary = `🧺 *Basket Building* (${pending.length} items · ~₹${est})\nCurrently accumulating household items.`;
    } else {
      summary = "🧺 *Basket Idle* (0 pending items).";
    }

    const format = req.nextUrl.searchParams.get("format");
    const accept = req.headers.get("accept") || "";
    if (format === "text" || accept.includes("text/plain")) {
      return new Response(summary, {
        status: 200,
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Cache-Control": "no-store, max-age=0",
        },
      });
    }

    return NextResponse.json({
      ok: true,
      status,
      isReadyForOrder,
      itemCount: pending.length,
      estimatedValue: est,
      handoffMessage: handoffState?.handoffMessage || null,
      handoffAt: handoffState?.handoffAt || null,
      summary,
    });
  } catch (error) {
    console.error("[api/instinct/handoff] GET Error:", error);
    return NextResponse.json(
      { ok: false, error: "Failed to fetch handoff status." },
      { status: 500 }
    );
  }
}
