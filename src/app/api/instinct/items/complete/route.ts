import { NextRequest, NextResponse } from "next/server";
import { fetchGroceryItems, upsertGroceryItem } from "@/lib/supabase";
import { processCompleteItem, validateApiToken } from "@/lib/instinctSummary";

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
 * POST /api/instinct/items/complete
 * Marks an item as purchased/completed from WhatsApp or Instinct.
 *
 * Request body:
 * { "query": "milk" } or { "name": "milk" } or { "id": "item-123" }
 */
export async function POST(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized. Invalid or missing secret token." },
      { status: 401 }
    );
  }

  try {
    let body: Record<string, unknown> = {};
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { ok: false, error: "Invalid JSON body." },
        { status: 400 }
      );
    }

    const query =
      (typeof body.query === "string" && body.query) ||
      (typeof body.name === "string" && body.name) ||
      (typeof body.id === "string" && body.id) ||
      "";

    if (!query.trim()) {
      return NextResponse.json(
        {
          ok: false,
          error: "Missing search query or item name to mark completed.",
        },
        { status: 400 }
      );
    }

    const currentItems = await fetchGroceryItems();
    const { completed } = processCompleteItem(query, currentItems);

    if (completed.length === 0) {
      const notFoundMessage = `⚠️ No active pending item matching "${query}" was found.`;
      const format = req.nextUrl.searchParams.get("format");
      if (format === "text") {
        return new Response(notFoundMessage, {
          status: 404,
          headers: { "Content-Type": "text/plain; charset=utf-8" },
        });
      }
      return NextResponse.json(
        { ok: false, error: notFoundMessage },
        { status: 404 }
      );
    }

    // Persist completed items to Supabase
    for (const item of completed) {
      await upsertGroceryItem(item);
    }

    const completedNames = completed.map((i) => i.name).join(", ");
    const message = `✓ Checked off ${completedNames} from household grocery list.`;

    const format = req.nextUrl.searchParams.get("format");
    const accept = req.headers.get("accept") || "";
    if (format === "text" || accept.includes("text/plain")) {
      return new Response(message, {
        status: 200,
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Cache-Control": "no-store, max-age=0",
        },
      });
    }

    return NextResponse.json(
      {
        ok: true,
        completed,
        message,
      },
      {
        status: 200,
        headers: { "Cache-Control": "no-store, max-age=0" },
      }
    );
  } catch (error) {
    console.error("[api/instinct/items/complete] POST Error:", error);
    return NextResponse.json(
      { ok: false, error: "Failed to mark item completed." },
      { status: 500 }
    );
  }
}
