import { NextRequest, NextResponse } from "next/server";
import { fetchGroceryItems } from "@/lib/supabase";
import {
  buildInstinctSummaryPayload,
  validateApiToken,
} from "@/lib/instinctSummary";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * GET /api/instinct/summary
 *
 * Exposes the full list of pending grocery requirements formatted for
 * Instinct (or any autonomous assistant / webhook polling every 6-8 hours).
 *
 * Query Params:
 *  - token: Optional secret token matching INSTINCT_API_KEY or GROCERIES_API_KEY
 *  - format: "text" | "json" (defaults to "json", which also embeds the WhatsApp summary text)
 */
export async function GET(req: NextRequest) {
  const configuredSecret =
    process.env.INSTINCT_API_KEY || process.env.GROCERIES_API_KEY;
  const authHeader = req.headers.get("authorization") || "";
  const token =
    req.nextUrl.searchParams.get("token") ||
    authHeader.replace(/^Bearer\s+/i, "");

  if (!validateApiToken(token, configuredSecret)) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized. Invalid or missing secret token." },
      { status: 401 }
    );
  }

  try {
    const rawItems = await fetchGroceryItems();
    const payload = buildInstinctSummaryPayload(rawItems);

    const format = req.nextUrl.searchParams.get("format");
    const accept = req.headers.get("accept") || "";
    const wantsPlainText = format === "text" || accept.includes("text/plain");

    if (wantsPlainText) {
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
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    });
  } catch (error) {
    console.error(
      "[api/instinct/summary] Error fetching grocery items:",
      error
    );
    return NextResponse.json(
      { ok: false, error: "Failed to fetch grocery requirements." },
      { status: 500 }
    );
  }
}
