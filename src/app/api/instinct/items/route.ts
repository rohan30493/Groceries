import { NextRequest, NextResponse } from "next/server";
import { fetchGroceryItems, upsertGroceryItem } from "@/lib/supabase";
import {
  buildInstinctSummaryPayload,
  parseInputItems,
  processAddItems,
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
 * GET /api/instinct/items
 * Returns the current active pending list formatted for Instinct.
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
    const payload = buildInstinctSummaryPayload(rawItems);

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
    console.error("[api/instinct/items] GET Error:", error);
    return NextResponse.json(
      { ok: false, error: "Failed to fetch grocery items." },
      { status: 500 }
    );
  }
}

/**
 * POST /api/instinct/items
 * Adds items to the grocery list via Instinct / WhatsApp.
 *
 * Request body:
 * { "items": ["Milk", "Eggs"], "notes": "optional note" }
 * or { "text": "Milk, Eggs, Bread" }
 * or { "items": [{ "name": "Milk", "notes": "toned" }] }
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

    const rawInput = body.items || body.text || body.name;
    const inputs = parseInputItems(rawInput);

    if (inputs.length === 0) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "No valid items provided. Pass 'items' (array) or 'text' (string).",
        },
        { status: 400 }
      );
    }

    // Attach global note if provided at root level
    if (typeof body.notes === "string" && body.notes.trim()) {
      inputs.forEach((inp) => {
        if (!inp.notes) inp.notes = (body.notes as string).trim();
      });
    }

    const currentItems = await fetchGroceryItems();
    const { added, duplicates } = processAddItems(inputs, currentItems);

    // Persist new items to Supabase
    for (const item of added) {
      await upsertGroceryItem(item);
    }

    // Total pending after addition
    const totalPending =
      currentItems.filter((it) => !it.isDone && !it.isOrdered).length +
      added.length;

    const addedNames = added.map((i) => i.name).join(", ");
    let summary = "";
    if (added.length > 0 && duplicates.length > 0) {
      summary = `🛒 Added ${added.length} item${
        added.length === 1 ? "" : "s"
      } (${addedNames}). Note: ${duplicates.join(
        ", "
      )} already pending in basket.`;
    } else if (added.length > 0) {
      summary = `🛒 Added ${added.length} item${
        added.length === 1 ? "" : "s"
      } to grocery list: ${addedNames}. (Total: ${totalPending} pending)`;
    } else {
      summary = `⚠️ All requested item(s) (${duplicates.join(
        ", "
      )}) are already active in the grocery basket.`;
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

    return NextResponse.json(
      {
        ok: true,
        added,
        duplicates,
        totalPending,
        summary,
      },
      {
        status: 200,
        headers: { "Cache-Control": "no-store, max-age=0" },
      }
    );
  } catch (error) {
    console.error("[api/instinct/items] POST Error:", error);
    return NextResponse.json(
      { ok: false, error: "Failed to add grocery items." },
      { status: 500 }
    );
  }
}
