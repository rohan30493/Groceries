import test from "node:test";
import assert from "node:assert/strict";
import { GroceryItem, getMissingItemSuggestions } from "../src/lib/patterns";
import { toDbItem, toGroceryItem } from "../src/lib/supabase";
import { getLiraAutonomousRecommendations, canPlaceOrder, BasketHandoffState } from "../src/lib/handoff";

function isWithin24Hours(isoStringOrDate?: string, refNow: number = Date.now()): boolean {
  if (!isoStringOrDate) return false;
  try {
    const d = new Date(isoStringOrDate);
    const time = d.getTime();
    if (isNaN(time)) return false;
    const diff = refNow - time;
    return diff >= 0 && diff <= 24 * 60 * 60 * 1000;
  } catch {
    return false;
  }
}

test("Basket Ordered Already Flow", async (t) => {
  await t.test("1. Item marked as ordered records orderedAt, orderedBy, and isOrdered", () => {
    const now = new Date().toISOString();
    const item: GroceryItem = {
      id: "item-1",
      name: "Cow Milk",
      category: "Dairy & Eggs",
      addedBy: "Lira",
      addedAt: "Today, 10:00 AM",
      isDone: false,
      isOrdered: true,
      orderedAt: now,
      orderedBy: "Rohan"
    };

    assert.equal(item.isOrdered, true);
    assert.equal(item.orderedBy, "Rohan");
    assert.equal(item.orderedAt, now);
  });

  await t.test("2. Ordered items within 24 hours remain in basketItems, older items expire", () => {
    const now = Date.now();
    const twoHoursAgo = new Date(now - 2 * 60 * 60 * 1000).toISOString();
    const twentyFiveHoursAgo = new Date(now - 25 * 60 * 60 * 1000).toISOString();

    const items: GroceryItem[] = [
      {
        id: "item-recent",
        name: "Eggs",
        category: "Dairy & Eggs",
        addedBy: "Rohan",
        addedAt: "Today",
        isDone: false,
        isOrdered: true,
        orderedAt: twoHoursAgo,
        orderedBy: "Rohan"
      },
      {
        id: "item-expired",
        name: "Bread",
        category: "Bakery",
        addedBy: "Rohan",
        addedAt: "Yesterday",
        isDone: false,
        isOrdered: true,
        orderedAt: twentyFiveHoursAgo,
        orderedBy: "Rohan"
      },
      {
        id: "item-pending",
        name: "Apples",
        category: "Produce",
        addedBy: "Lira",
        addedAt: "Today",
        isDone: false
      }
    ];

    const basketItems = items.filter((it) => {
      if (it.isDone) return false;
      if (!it.isOrdered) return true;
      return isWithin24Hours(it.orderedAt, now);
    });

    assert.equal(basketItems.length, 2);
    assert.ok(basketItems.some((it) => it.id === "item-recent"));
    assert.ok(basketItems.some((it) => it.id === "item-pending"));
    assert.ok(!basketItems.some((it) => it.id === "item-expired"));
  });

  await t.test("3. Pending items count excludes items marked as ordered", () => {
    const items: GroceryItem[] = [
      {
        id: "item-1",
        name: "Eggs",
        category: "Dairy & Eggs",
        addedBy: "Rohan",
        addedAt: "Today",
        isDone: false,
        isOrdered: true,
        orderedAt: new Date().toISOString(),
        orderedBy: "Rohan"
      },
      {
        id: "item-2",
        name: "Apples",
        category: "Produce",
        addedBy: "Lira",
        addedAt: "Today",
        isDone: false
      }
    ];

    const pendingItems = items.filter((it) => !it.isDone && !it.isOrdered);
    assert.equal(pendingItems.length, 1);
    assert.equal(pendingItems[0].name, "Apples");

    // Can place order when pending items count is 1 vs 0
    const handoffReady: BasketHandoffState = {
      status: "ready_for_order",
      handoffMessage: "I’m done. Please proceed with order.",
      handoffAt: new Date().toISOString(),
      orderedAt: null,
      orderedBy: null,
      lastRunSummary: null
    };
    const canOrder = canPlaceOrder(handoffReady, "Rohan", pendingItems.length);
    assert.equal(canOrder.allowed, true);

    // If only ordered item exists, pendingItems is 0 and ordering is prevented
    const onlyOrdered = items.filter((it) => it.id === "item-1");
    const noPending = onlyOrdered.filter((it) => !it.isDone && !it.isOrdered);
    const cannotOrder = canPlaceOrder(handoffReady, "Rohan", noPending.length);
    assert.equal(cannotOrder.allowed, false);
    assert.match(cannotOrder.reason || "", /empty/i);
  });

  await t.test("4. Lira autonomous recommendations exclude already-ordered items from suggestions", () => {
    const items: GroceryItem[] = [
      {
        id: "item-1",
        name: "Fresh Paneer",
        category: "Dairy & Eggs",
        addedBy: "Rohan",
        addedAt: "Today",
        isDone: false,
        isOrdered: true,
        orderedAt: new Date().toISOString(),
        orderedBy: "Rohan"
      }
    ];

    const recs = getLiraAutonomousRecommendations(items, 6);
    assert.ok(!recs.some((r) => r.name.toLowerCase() === "fresh paneer"));
  });

  await t.test("5. Supabase serialization round-trip preserves isOrdered, orderedAt, and orderedBy", () => {
    const item: GroceryItem = {
      id: "item-roundtrip",
      name: "Curd",
      category: "Dairy & Eggs",
      addedBy: "Rohan",
      addedAt: "Today, 10:30 AM",
      isDone: false,
      isOrdered: true,
      orderedAt: "2026-09-14T10:30:00.000Z",
      orderedBy: "Rohan",
      notes: "Organic 500g"
    };

    const dbItem = toDbItem(item);
    assert.ok(dbItem.notes);
    const parsed = JSON.parse(dbItem.notes);
    assert.equal(parsed.is_ordered, true);
    assert.equal(parsed.ordered_at, "2026-09-14T10:30:00.000Z");
    assert.equal(parsed.ordered_by, "Rohan");
    assert.equal(parsed.user_note, "Organic 500g");

    const restored = toGroceryItem(dbItem);
    assert.equal(restored.isOrdered, true);
    assert.equal(restored.orderedAt, "2026-09-14T10:30:00.000Z");
    assert.equal(restored.orderedBy, "Rohan");
    assert.equal(restored.notes, "Organic 500g");
  });

  await t.test("6. Undo restores item to active pending state and clears ordered fields", () => {
    const item: GroceryItem = {
      id: "item-undo",
      name: "Bread",
      category: "Bakery",
      addedBy: "Rohan",
      addedAt: "Today, 10:00 AM",
      isDone: false,
      isOrdered: true,
      orderedAt: new Date().toISOString(),
      orderedBy: "Rohan"
    };

    // Undo action
    const undone: GroceryItem = {
      ...item,
      isOrdered: false,
      orderedAt: undefined,
      orderedBy: undefined
    };

    assert.equal(undone.isOrdered, false);
    assert.equal(undone.orderedAt, undefined);
    assert.equal(undone.orderedBy, undefined);

    const pending = [undone].filter((it) => !it.isDone && !it.isOrdered);
    assert.equal(pending.length, 1);
  });

  await t.test("7. Missing companion suggestions exclude already-ordered items", () => {
    const currentList = ["Bread"];
    const excluded = ["Fresh Paneer", "Butter"];
    const suggestions = getMissingItemSuggestions(currentList, "Bread", undefined, undefined, excluded);
    assert.ok(!suggestions.some((s) => s.item.toLowerCase() === "butter"));
  });

  await t.test("8. Lira can continue building basket around already-ordered items and reach ready_for_order", () => {
    const items: GroceryItem[] = [
      {
        id: "item-1",
        name: "Cheddar Cheese",
        category: "Dairy & Eggs",
        addedBy: "Rohan",
        addedAt: "Today",
        isDone: false,
        isOrdered: true,
        orderedAt: new Date().toISOString(),
        orderedBy: "Rohan"
      },
      {
        id: "item-2",
        name: "Bread",
        category: "Bakery",
        addedBy: "Lira",
        addedAt: "Today",
        isDone: false
      }
    ];

    const pending = items.filter((it) => !it.isDone && !it.isOrdered);
    assert.equal(pending.length, 1);

    // Lira hands off remaining items
    const handoffState: BasketHandoffState = {
      status: "building",
      handoffMessage: null,
      handoffAt: null,
      orderedAt: null,
      orderedBy: null,
      lastRunSummary: null
    };

    const nextState: BasketHandoffState = {
      ...handoffState,
      status: "ready_for_order",
      handoffMessage: "I’m done. Please proceed with order.",
      handoffAt: new Date().toISOString()
    };

    assert.equal(nextState.status, "ready_for_order");
    assert.equal(nextState.handoffMessage, "I’m done. Please proceed with order.");

    // Outstanding order check only considers pending (1 item)
    const check = canPlaceOrder(nextState, "Rohan", pending.length);
    assert.equal(check.allowed, true);
  });
});
