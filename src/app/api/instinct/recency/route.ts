import { NextRequest, NextResponse } from "next/server";
import {
  lookupItemRecencyDetails,
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
 * GET /api/instinct/recency
 * Queries historical delivered orders to report when an item was last ordered.
 *
 * Query params:
 *  - query / q / item: The item name to check
 *  - token: Optional secret token
 *  - format: "text" | "json"
 */
export async function GET(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized. Invalid or missing secret token." },
      { status: 401 }
    );
  }

  const query =
    req.nextUrl.searchParams.get("query") ||
    req.nextUrl.searchParams.get("q") ||
    req.nextUrl.searchParams.get("item") ||
    "";

  if (!query.trim()) {
    return NextResponse.json(
      {
        ok: false,
        error: "Missing required query parameter (e.g. ?query=olive+oil).",
      },
      { status: 400 }
    );
  }

  try {
    const result = lookupItemRecencyDetails(query);

    const format = req.nextUrl.searchParams.get("format");
    const accept = req.headers.get("accept") || "";
    if (format === "text" || accept.includes("text/plain")) {
      return new Response(result.summary, {
        status: 200,
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Cache-Control": "no-store, max-age=0",
        },
      });
    }

    return NextResponse.json(result, {
      status: 200,
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
  } catch (error) {
    console.error("[api/instinct/recency] GET Error:", error);
    return NextResponse.json(
      { ok: false, error: "Failed to look up item recency." },
      { status: 500 }
    );
  }
}
