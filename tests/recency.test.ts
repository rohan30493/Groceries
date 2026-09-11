import test from "node:test";
import assert from "node:assert/strict";
import {
  toCanonicalItemName,
  isValidDeliveredOrder,
  formatOrderRecency,
  calculateItemLastOrdered,
  HistoricalOrder
} from "../src/lib/orderRecency";
import { getMissingItemSuggestions } from "../src/lib/patterns";

test("Order Recency & Canonical Item Mapping", async (t) => {
  await t.test("canonical item mapping normalizes variants and brands to canonical identities", () => {
    // Exact canonical identity
    assert.strictEqual(toCanonicalItemName("Lettuce / Salad Leaves"), "Lettuce / Salad Leaves");
    assert.strictEqual(toCanonicalItemName("Tomatoes"), "Tomatoes");
    assert.strictEqual(toCanonicalItemName("Eggs"), "Eggs");
    assert.strictEqual(toCanonicalItemName("Milk"), "Milk");
    assert.strictEqual(toCanonicalItemName("Fresh Paneer"), "Fresh Paneer");

    // Brand and variant normalization
    assert.strictEqual(toCanonicalItemName("Lettuce Iceberg"), "Lettuce / Salad Leaves");
    assert.strictEqual(toCanonicalItemName("Iceberg Lettuce Hydroponically Grown"), "Lettuce / Salad Leaves");
    assert.strictEqual(toCanonicalItemName("Hen Fruit Protein Max Eggs"), "Eggs");
    assert.strictEqual(toCanonicalItemName("Eggoz White Eggs 10 pcs"), "Eggs");
    assert.strictEqual(toCanonicalItemName("Nandini Goodlife Toned Milk"), "Milk");
    assert.strictEqual(toCanonicalItemName("Amul Taaza Milk 500ml"), "Milk");
    assert.strictEqual(toCanonicalItemName("Milky Mist Paneer Block 200g"), "Fresh Paneer");
    assert.strictEqual(toCanonicalItemName("Gowardhan Fresh Paneer"), "Fresh Paneer");
    assert.strictEqual(toCanonicalItemName("Tomato Local 500g"), "Tomatoes");
    assert.strictEqual(toCanonicalItemName("Sheba Premium Wet Cat Food"), "Cat Food");

    // Unrecognized item
    assert.strictEqual(toCanonicalItemName("NonExistentRandomGizmo123"), null);
    assert.strictEqual(toCanonicalItemName(""), null);
  });

  await t.test("order validation filters out cancelled and returned orders", () => {
    assert.strictEqual(isValidDeliveredOrder({ status: "DELIVERED" }), true);
    assert.strictEqual(isValidDeliveredOrder({ status: "ORDER_DELIVERED" }), true);
    assert.strictEqual(isValidDeliveredOrder({ status: "COMPLETED" }), true);
    assert.strictEqual(isValidDeliveredOrder({}), true); // default without status is valid
    assert.strictEqual(isValidDeliveredOrder({ status: "CANCELLED" }), false);
    assert.strictEqual(isValidDeliveredOrder({ status: "RETURN_TO_ORIGIN" }), false);
    assert.strictEqual(isValidDeliveredOrder({ status: "FAILED" }), false);
  });

  await t.test("human-friendly relative time formatting without misleading precision", () => {
    const referenceDate = new Date("2026-09-12T12:00:00Z");

    // Same day
    const sameDay = new Date("2026-09-12T08:00:00Z");
    assert.strictEqual(formatOrderRecency(sameDay, referenceDate), "Last ordered today");

    // 1 day ago (yesterday)
    const yesterday = new Date("2026-09-11T12:00:00Z");
    assert.strictEqual(formatOrderRecency(yesterday, referenceDate), "Last ordered yesterday");

    // 3 days ago
    const threeDaysAgo = new Date("2026-09-09T12:00:00Z");
    assert.strictEqual(formatOrderRecency(threeDaysAgo, referenceDate), "Last ordered 3 days ago");

    // 9 days ago (example in prompt)
    const nineDaysAgo = new Date("2026-09-03T12:00:00Z");
    assert.strictEqual(formatOrderRecency(nineDaysAgo, referenceDate), "Last ordered 9 days ago");

    // 2 weeks ago (14 days)
    const twoWeeksAgo = new Date("2026-08-29T12:00:00Z");
    assert.strictEqual(formatOrderRecency(twoWeeksAgo, referenceDate), "Last ordered 2 weeks ago");

    // 3 weeks ago (21 days)
    const threeWeeksAgo = new Date("2026-08-22T12:00:00Z");
    assert.strictEqual(formatOrderRecency(threeWeeksAgo, referenceDate), "Last ordered 3 weeks ago");

    // 2 months ago (60 days)
    const twoMonthsAgo = new Date("2026-07-14T12:00:00Z");
    assert.strictEqual(formatOrderRecency(twoMonthsAgo, referenceDate), "Last ordered 2 months ago");

    // 1 year ago
    const oneYearAgo = new Date("2025-09-12T12:00:00Z");
    assert.strictEqual(formatOrderRecency(oneYearAgo, referenceDate), "Last ordered 1 year ago");

    // 2 years ago
    const twoYearsAgo = new Date("2024-09-12T12:00:00Z");
    assert.strictEqual(formatOrderRecency(twoYearsAgo, referenceDate), "Last ordered 2 years ago");

    // Invalid date returns null
    assert.strictEqual(formatOrderRecency("invalid-date-string", referenceDate), null);
  });

  await t.test("recency calculation with no history returns null", () => {
    const mockOrders: HistoricalOrder[] = [
      {
        order_id: "ord-1",
        status: "DELIVERED",
        placed_at: "2026-09-10T10:00:00Z",
        items: [{ name: "Tomatoes" }]
      }
    ];

    // Item not present in any order
    const result = calculateItemLastOrdered("Eggs", mockOrders);
    assert.strictEqual(result, null);

    // Empty orders list
    assert.strictEqual(calculateItemLastOrdered("Tomatoes", []), null);

    // Item present ONLY in cancelled order
    const cancelledOnlyOrders: HistoricalOrder[] = [
      {
        order_id: "ord-cancelled",
        status: "CANCELLED",
        placed_at: "2026-09-11T10:00:00Z",
        items: [{ name: "Tomatoes" }]
      }
    ];
    assert.strictEqual(calculateItemLastOrdered("Tomatoes", cancelledOnlyOrders), null);
  });

  await t.test("recency calculation with multiple historical orders selects the most recent valid order", () => {
    const refNow = new Date("2026-09-12T12:00:00Z");

    const mockOrders: HistoricalOrder[] = [
      {
        order_id: "ord-old",
        status: "DELIVERED",
        placed_at: "2026-08-01T10:00:00Z", // ~42 days ago
        items: [{ name: "Iceberg Lettuce" }]
      },
      {
        order_id: "ord-middle",
        status: "DELIVERED",
        placed_at: "2026-09-03T10:00:00Z", // 9 days ago
        items: [{ name: "Lettuce / Salad Leaves" }]
      },
      {
        order_id: "ord-recent-cancelled",
        status: "CANCELLED",
        placed_at: "2026-09-11T10:00:00Z", // 1 day ago, but CANCELLED!
        items: [{ name: "Lettuce Iceberg" }]
      }
    ];

    const recency = calculateItemLastOrdered("Lettuce / Salad Leaves", mockOrders, refNow);
    // Should pick the 9 days ago order, ignoring the cancelled 1-day-ago order
    assert.strictEqual(recency, "Last ordered 9 days ago");
  });

  await t.test("recency calculation across multiple variant/brand names resolves to canonical item", () => {
    const refNow = new Date("2026-09-12T12:00:00Z");

    const mockOrders: HistoricalOrder[] = [
      {
        order_id: "ord-1",
        status: "DELIVERED",
        placed_at: "2026-09-02T10:00:00Z", // 10 days ago
        items: [{ name: "Hen Fruit Protein Max Eggs" }]
      },
      {
        order_id: "ord-2",
        status: "DELIVERED",
        placed_at: "2026-09-09T10:00:00Z", // 3 days ago
        items: [{ name: "Eggoz White Eggs" }]
      }
    ];

    // Both variants map to "Eggs", and ord-2 is newer (3 days ago)
    const recencyCanonical = calculateItemLastOrdered("Eggs", mockOrders, refNow);
    assert.strictEqual(recencyCanonical, "Last ordered 3 days ago");

    const recencyVariantQuery = calculateItemLastOrdered("Hen Fruit Protein Max Eggs", mockOrders, refNow);
    assert.strictEqual(recencyVariantQuery, "Last ordered 3 days ago");
  });

  await t.test("integration: getMissingItemSuggestions includes recency from real historical orders", () => {
    // When Tomatoes is in the list, Lettuce / Salad Leaves is frequently suggested
    const suggestions = getMissingItemSuggestions(["Tomatoes"]);
    assert.ok(suggestions.length > 0);

    const lettuceSuggestion = suggestions.find((s) => s.item === "Lettuce / Salad Leaves");
    if (lettuceSuggestion) {
      assert.ok(lettuceSuggestion.lastOrderedText, "Lettuce suggestion should have lastOrderedText");
      assert.match(lettuceSuggestion.lastOrderedText, /^Last ordered/);
    }

    // Check that every suggestion with history has human-friendly text
    for (const s of suggestions) {
      if (s.lastOrderedText) {
        assert.match(s.lastOrderedText, /^Last ordered (today|yesterday|\d+ days ago|\d+ weeks ago|\d+ months ago|\d+ years ago)$/);
      }
    }
  });
});
