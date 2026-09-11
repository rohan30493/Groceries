import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateItemCadence,
  calculateMedian,
  getCalendarDayDiff,
  ItemCadenceInfo
} from "../src/lib/replenishment";
import { HouseholdOrder, createOrderFromBasket, updateOrderStatus } from "../src/lib/orderLifecycle";
import { getMissingItemSuggestions } from "../src/lib/patterns";
import { getLiraAutonomousRecommendations } from "../src/lib/handoff";

// Helper to construct a delivered HouseholdOrder on a specific date relative to refNow
function makeDeliveredOrder(
  orderId: string,
  daysAgo: number,
  items: Array<{ name: string; quantity?: number }>,
  platform: string = "Zepto",
  refNow: Date = new Date("2026-09-12T10:00:00Z")
): HouseholdOrder {
  const d = new Date(refNow.getTime() - daysAgo * 24 * 60 * 60 * 1000);
  const iso = d.toISOString();

  return {
    orderId,
    platform,
    status: "DELIVERED",
    placedAt: iso,
    deliveredAt: iso,
    totalAmount: 200,
    itemsCount: items.length,
    items: items.map((it, idx) => ({
      id: `${orderId}-it-${idx}`,
      name: it.name,
      canonicalName: it.name,
      quantity: it.quantity || 1,
      status: "DELIVERED",
      deliveredAt: iso
    }))
  };
}

test("Cadence-Aware Replenishment Intelligence", async (t) => {
  const refNow = new Date("2026-09-12T10:00:00Z");

  // 1. 3-day cadence item
  await t.test("1. 3-day cadence item: calculates median interval and due status correctly", () => {
    // Purchases delivered 9 days ago, 6 days ago, 3 days ago
    const orders: HouseholdOrder[] = [
      makeDeliveredOrder("ord-1", 9, [{ name: "Fresh Paneer" }], "Zepto", refNow),
      makeDeliveredOrder("ord-2", 6, [{ name: "Fresh Paneer" }], "Zepto", refNow),
      makeDeliveredOrder("ord-3", 3, [{ name: "Fresh Paneer" }], "Zepto", refNow)
    ];

    const cadence = calculateItemCadence("Fresh Paneer", orders, refNow);

    assert.strictEqual(cadence.canonicalName, "Fresh Paneer");
    assert.strictEqual(cadence.purchaseCount, 3);
    assert.strictEqual(cadence.typicalReorderDays, 3);
    assert.strictEqual(cadence.daysSinceLastDelivery, 3);
    assert.strictEqual(cadence.daysUntilDue, 0);
    assert.strictEqual(cadence.replenishmentStatus, "DUE_NOW");
    assert.strictEqual(cadence.uiDueText, "Due now");
    assert.strictEqual(cadence.uiCadenceText, "Last ordered 3 days ago · Usually every ~3 days");
  });

  // 2. 30-day cadence item
  await t.test("2. 30-day cadence item: calculates ~30 day cadence and due in ~6 days", () => {
    // Purchases delivered 84 days ago, 54 days ago, 24 days ago
    const orders: HouseholdOrder[] = [
      makeDeliveredOrder("ord-1", 84, [{ name: "Cat Food" }], "Zepto", refNow),
      makeDeliveredOrder("ord-2", 54, [{ name: "Cat Food" }], "Zepto", refNow),
      makeDeliveredOrder("ord-3", 24, [{ name: "Cat Food" }], "Zepto", refNow)
    ];

    const cadence = calculateItemCadence("Cat Food", orders, refNow);

    assert.strictEqual(cadence.canonicalName, "Cat Food");
    assert.strictEqual(cadence.typicalReorderDays, 30);
    assert.strictEqual(cadence.daysSinceLastDelivery, 24);
    assert.strictEqual(cadence.daysUntilDue, 6);
    assert.strictEqual(cadence.replenishmentStatus, "NOT_DUE");
    assert.strictEqual(cadence.uiDueText, "Due in ~6 days");
    assert.strictEqual(cadence.uiCadenceText, "Last ordered 3 weeks ago · Usually every ~30 days");
  });

  // 3. Overdue item
  await t.test("3. Overdue item: last ordered longer ago than typical cadence marks as DUE_NOW", () => {
    // Typical cadence 7 days, but last ordered 8 days ago
    const orders: HouseholdOrder[] = [
      makeDeliveredOrder("ord-1", 22, [{ name: "Milk" }], "Zepto", refNow),
      makeDeliveredOrder("ord-2", 15, [{ name: "Milk" }], "Zepto", refNow),
      makeDeliveredOrder("ord-3", 8, [{ name: "Milk" }], "Zepto", refNow)
    ];

    const cadence = calculateItemCadence("Milk", orders, refNow);

    assert.strictEqual(cadence.typicalReorderDays, 7);
    assert.strictEqual(cadence.daysSinceLastDelivery, 8);
    assert.ok(cadence.daysUntilDue !== null && cadence.daysUntilDue <= 0);
    assert.strictEqual(cadence.replenishmentStatus, "DUE_NOW");
    assert.strictEqual(cadence.uiDueText, "Due now");
  });

  // 4. Not-yet-due item
  await t.test("4. Not-yet-due item: purchased yesterday with 30-day cadence marks as NOT_DUE", () => {
    // Purchased 61 days ago, 31 days ago, 1 day ago
    const orders: HouseholdOrder[] = [
      makeDeliveredOrder("ord-1", 61, [{ name: "Cooking Oil" }], "Zepto", refNow),
      makeDeliveredOrder("ord-2", 31, [{ name: "Cooking Oil" }], "Zepto", refNow),
      makeDeliveredOrder("ord-3", 1, [{ name: "Cooking Oil" }], "Zepto", refNow)
    ];

    const cadence = calculateItemCadence("Cooking Oil", orders, refNow);

    assert.strictEqual(cadence.typicalReorderDays, 30);
    assert.strictEqual(cadence.daysSinceLastDelivery, 1);
    assert.strictEqual(cadence.daysUntilDue, 29);
    assert.strictEqual(cadence.replenishmentStatus, "NOT_DUE");
    assert.strictEqual(cadence.uiDueText, "Due in ~29 days");
  });

  // 5. Insufficient history
  await t.test("5. Insufficient history: does not invent a cadence when < 3 delivered purchases", () => {
    // Only 2 delivered purchases (1 interval)
    const orders: HouseholdOrder[] = [
      makeDeliveredOrder("ord-1", 10, [{ name: "Feta Cheese" }], "Zepto", refNow),
      makeDeliveredOrder("ord-2", 4, [{ name: "Feta Cheese" }], "Zepto", refNow)
    ];

    const cadence = calculateItemCadence("Feta Cheese", orders, refNow);

    assert.strictEqual(cadence.purchaseCount, 2);
    assert.strictEqual(cadence.typicalReorderDays, null);
    assert.strictEqual(cadence.daysUntilDue, null);
    assert.strictEqual(cadence.replenishmentStatus, "INSUFFICIENT_HISTORY");
    assert.strictEqual(cadence.uiDueText, null);
    // Shows only "Last ordered X ago", does not invent interval
    assert.strictEqual(cadence.uiCadenceText, "Last ordered 4 days ago");
  });

  // 6. Irregular / outlier purchase intervals
  await t.test("6. Irregular/outlier purchase intervals: median interval filters out abnormal outlier gap", () => {
    // Purchase dates: 57, 54, 51 days ago (gap 3, 3), then a 45-day gap to 6 days ago, then 3 days ago (gap 3)
    // Intervals: [3, 3, 45, 3] -> Sorted: [3, 3, 3, 45] -> Median is 3!
    const orders: HouseholdOrder[] = [
      makeDeliveredOrder("ord-1", 57, [{ name: "Fresh Paneer" }], "Zepto", refNow),
      makeDeliveredOrder("ord-2", 54, [{ name: "Fresh Paneer" }], "Zepto", refNow),
      makeDeliveredOrder("ord-3", 51, [{ name: "Fresh Paneer" }], "Zepto", refNow),
      makeDeliveredOrder("ord-4", 6, [{ name: "Fresh Paneer" }], "Zepto", refNow),
      makeDeliveredOrder("ord-5", 3, [{ name: "Fresh Paneer" }], "Zepto", refNow)
    ];

    const cadence = calculateItemCadence("Fresh Paneer", orders, refNow);

    // Average would be (3+3+45+3)/4 = 13.5 days, but median correctly gives 3 days!
    assert.strictEqual(cadence.typicalReorderDays, 3);
    assert.strictEqual(cadence.daysSinceLastDelivery, 3);
    assert.strictEqual(cadence.daysUntilDue, 0);
    assert.strictEqual(cadence.replenishmentStatus, "DUE_NOW");
  });

  // 7. Active order suppresses recommendation
  await t.test("7. Active order suppresses recommendation even if historically due", () => {
    // Milk is due now
    const historicalOrders: HouseholdOrder[] = [
      makeDeliveredOrder("ord-1", 21, [{ name: "Milk" }], "Zepto", refNow),
      makeDeliveredOrder("ord-2", 14, [{ name: "Milk" }], "Zepto", refNow),
      makeDeliveredOrder("ord-3", 7, [{ name: "Milk" }], "Zepto", refNow)
    ];

    // An active order in flight contains Milk
    const activeOrder: HouseholdOrder = {
      orderId: "active-1",
      platform: "Zepto",
      status: "ORDER_PLACED",
      placedAt: new Date(refNow.getTime() - 30 * 60 * 1000).toISOString(),
      totalAmount: 100,
      itemsCount: 1,
      items: [
        {
          id: "act-item-1",
          name: "Milk",
          canonicalName: "Milk",
          quantity: 2,
          status: "ORDER_PLACED"
        }
      ]
    };

    // When Oats is in the basket, Milk would normally be the #1 companion suggestion
    const suggestions = getMissingItemSuggestions(["Oats"], null, historicalOrders, [activeOrder]);

    // Active order MUST suppress Milk
    const milkSug = suggestions.find((s) => s.item.toLowerCase() === "milk");
    assert.strictEqual(milkSug, undefined, "Active-order Milk must be suppressed from recommendations");
  });

  // 8. Canonical brand/variant history contributes to the same cadence
  await t.test("8. Canonical brand/variant history contributes to the same cadence", () => {
    // 3 orders with different brand variants of paneer
    const orders: HouseholdOrder[] = [
      makeDeliveredOrder("ord-1", 9, [{ name: "Amul Malai Paneer 200g" }], "Zepto", refNow),
      makeDeliveredOrder("ord-2", 6, [{ name: "Gowardhan Fresh Paneer Classic Block" }], "Swiggy", refNow),
      makeDeliveredOrder("ord-3", 3, [{ name: "Milky Mist Paneer" }], "Zepto", refNow)
    ];

    // Calculate cadence using canonical name or any variant name
    const canonicalCadence = calculateItemCadence("Fresh Paneer", orders, refNow);
    assert.strictEqual(canonicalCadence.canonicalName, "Fresh Paneer");
    assert.strictEqual(canonicalCadence.purchaseCount, 3);
    assert.strictEqual(canonicalCadence.typicalReorderDays, 3);
    assert.strictEqual(cadenceStatusMatch(canonicalCadence.replenishmentStatus), true);

    const variantQueryCadence = calculateItemCadence("Amul Malai Paneer 200g", orders, refNow);
    assert.strictEqual(variantQueryCadence.typicalReorderDays, 3);
    assert.strictEqual(variantQueryCadence.canonicalName, "Fresh Paneer");
  });

  // 9. Lira autonomous recommendations prioritize due items
  await t.test("9. Lira autonomous recommendations prioritize due items over not-due items", () => {
    // Setup history:
    // Fresh Paneer: cadence 3 days, last delivered 3 days ago -> DUE NOW
    // Oats: cadence 30 days, last delivered 2 days ago -> NOT DUE
    const orders: HouseholdOrder[] = [
      makeDeliveredOrder("ord-p1", 9, [{ name: "Fresh Paneer" }], "Zepto", refNow),
      makeDeliveredOrder("ord-p2", 6, [{ name: "Fresh Paneer" }], "Zepto", refNow),
      makeDeliveredOrder("ord-p3", 3, [{ name: "Fresh Paneer" }], "Zepto", refNow),

      makeDeliveredOrder("ord-o1", 62, [{ name: "Oats" }], "Zepto", refNow),
      makeDeliveredOrder("ord-o2", 32, [{ name: "Oats" }], "Zepto", refNow),
      makeDeliveredOrder("ord-o3", 2, [{ name: "Oats" }], "Zepto", refNow)
    ];

    // Lira generates autonomous recommendations with limit 1
    const recs = getLiraAutonomousRecommendations([], 1, [], orders);

    assert.ok(recs.length > 0);
    // The due item (Fresh Paneer) must be prioritized over the recently-purchased Oats
    assert.strictEqual(recs[0].name.toLowerCase(), "fresh paneer");
    assert.match(recs[0].reason, /Due for replenishment|replenishment/i);
  });
});

function cadenceStatusMatch(status: string): boolean {
  return status === "DUE_NOW" || status === "APPROACHING_DUE";
}
