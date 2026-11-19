import test from "node:test";
import assert from "node:assert/strict";
import { GroceryItem } from "../src/lib/patterns";
import {
  parseInputItems,
  processAddItems,
  processCompleteItem,
  computeReplenishmentReminders,
  lookupItemRecencyDetails,
} from "../src/lib/instinctSummary";
import {
  initHandoffState,
  canPlaceOrder,
  executePlaceOrder,
} from "../src/lib/handoff";
import { HouseholdOrder } from "../src/lib/orderLifecycle";

test("Instinct Enhanced Features & Safety Invariants", async (t) => {
  const sampleItems: GroceryItem[] = [
    {
      id: "item-1",
      name: "Cow Milk 1L",
      category: "Dairy, Bread & Eggs",
      addedBy: "Rohan",
      addedAt: "2026-11-18T10:00:00.000Z",
      isDone: false,
    },
    {
      id: "item-2",
      name: "Organic Eggs 6pk",
      category: "Dairy, Bread & Eggs",
      addedBy: "Lira",
      addedAt: "2026-11-18T11:00:00.000Z",
      isDone: false,
      notes: "farm fresh",
    },
    {
      id: "item-3",
      name: "Tomatoes 500g",
      category: "Fruits & Vegetables",
      addedBy: "Rohan",
      addedAt: "2026-11-18T12:00:00.000Z",
      isDone: true,
    },
  ];

  await t.test(
    "1. parseInputItems parses various natural language formats",
    () => {
      // Comma-separated string with note
      const parsed1 = parseInputItems(
        "Garlic, Whole Wheat Bread (2 packets), Bananas"
      );
      assert.strictEqual(parsed1.length, 3);
      assert.strictEqual(parsed1[0].name, "Garlic");
      assert.strictEqual(parsed1[1].name, "Whole Wheat Bread");
      assert.strictEqual(parsed1[1].notes, "2 packets");
      assert.strictEqual(parsed1[2].name, "Bananas");

      // Array of objects
      const parsed2 = parseInputItems([
        { name: "Olive Oil", notes: "Extra virgin" },
        { name: "Coffee Beans" },
      ]);
      assert.strictEqual(parsed2.length, 2);
      assert.strictEqual(parsed2[0].name, "Olive Oil");
      assert.strictEqual(parsed2[0].notes, "Extra virgin");
      assert.strictEqual(parsed2[1].name, "Coffee Beans");
    }
  );

  await t.test(
    "2. processAddItems adds new items and deduplicates against active items",
    () => {
      const inputs = [
        { name: "Garlic" },
        { name: "Cow Milk 1L" }, // Duplicate of active item-1
        { name: "Brown Bread", notes: "multigrain" },
      ];

      const { added, duplicates, updatedItems } = processAddItems(
        inputs,
        sampleItems,
        new Date("2026-11-19T10:00:00.000Z")
      );

      assert.strictEqual(added.length, 2);
      assert.strictEqual(duplicates.length, 1);
      assert.strictEqual(duplicates[0], "Cow Milk 1L");

      assert.strictEqual(added[0].name, "Garlic");
      assert.strictEqual(added[0].addedBy, "Instinct");
      assert.strictEqual(added[0].category, "Fruits & Vegetables");

      assert.strictEqual(added[1].name, "Brown Bread");
      assert.strictEqual(added[1].addedBy, "Instinct");
      assert.strictEqual(added[1].notes, "multigrain");

      assert.strictEqual(updatedItems.length, sampleItems.length + 2);
    }
  );

  await t.test(
    "3. processCompleteItem checks off matching item by ID or name",
    () => {
      const { completed, updatedItems } = processCompleteItem(
        "organic eggs",
        sampleItems,
        new Date("2026-11-19T11:00:00.000Z")
      );

      assert.strictEqual(completed.length, 1);
      assert.strictEqual(completed[0].id, "item-2");
      assert.strictEqual(completed[0].isDone, true);
      assert.strictEqual(completed[0].purchasedAt, "2026-11-19T11:00:00.000Z");

      // Verify unaffected item remains pending
      const milkItem = updatedItems.find((it) => it.id === "item-1");
      assert.strictEqual(milkItem?.isDone, false);
    }
  );

  await t.test(
    "4. computeReplenishmentReminders identifies due items and excludes active items",
    () => {
      // Synthetic orders where Milk was ordered 6 days ago (cadence: 3 days -> overdue)
      // and Tea was ordered 30 days ago (cadence: 10 days -> overdue)
      const testOrders: HouseholdOrder[] = [
        {
          orderId: "ord-1",
          platform: "Zepto",
          status: "DELIVERED",
          placedAt: "2026-11-10T10:00:00.000Z",
          totalAmount: 200,
          itemsCount: 1,
          items: [
            {
              id: "i1",
              name: "Cow Milk 1L",
              quantity: 1,
              canonicalName: "Milk",
              status: "DELIVERED",
            },
          ],
        },
        {
          orderId: "ord-2",
          platform: "Zepto",
          status: "DELIVERED",
          placedAt: "2026-11-07T10:00:00.000Z",
          totalAmount: 200,
          itemsCount: 1,
          items: [
            {
              id: "i2",
              name: "Cow Milk 1L",
              quantity: 1,
              canonicalName: "Milk",
              status: "DELIVERED",
            },
          ],
        },
        {
          orderId: "ord-3",
          platform: "Zepto",
          status: "DELIVERED",
          placedAt: "2026-11-04T10:00:00.000Z",
          totalAmount: 200,
          itemsCount: 1,
          items: [
            {
              id: "i3",
              name: "Cow Milk 1L",
              quantity: 1,
              canonicalName: "Milk",
              status: "DELIVERED",
            },
          ],
        },
      ];

      // Since Milk is already in sampleItems (item-1: Cow Milk 1L), it should be suppressed
      const activeWithMilk = [sampleItems[0]];
      const res1 = computeReplenishmentReminders(
        activeWithMilk,
        testOrders,
        new Date("2026-11-16T10:00:00.000Z")
      );
      const milkReminders = res1.items.filter(
        (r) => r.canonicalName === "Milk"
      );
      assert.strictEqual(
        milkReminders.length,
        0,
        "Milk must be suppressed because it is already pending"
      );

      // When Milk is NOT in active basket, it should be recommended
      const res2 = computeReplenishmentReminders(
        [],
        testOrders,
        new Date("2026-11-16T10:00:00.000Z")
      );
      const milkReminders2 = res2.items.filter(
        (r) => r.canonicalName === "Milk"
      );
      assert.strictEqual(milkReminders2.length, 1);
      assert.strictEqual(milkReminders2[0].status, "DUE_NOW");
      assert.match(res2.summary, /Milk/);
    }
  );

  await t.test(
    "5. lookupItemRecencyDetails finds last delivered purchase and details",
    () => {
      const res = lookupItemRecencyDetails(
        "eggs",
        undefined,
        new Date("2026-11-19T10:00:00.000Z")
      );

      assert.strictEqual(res.ok, true);
      assert.strictEqual(res.found, true);
      assert.strictEqual(typeof res.relativeTime, "string");
      assert.match(res.summary, /Eggs/i);
    }
  );

  await t.test("6. Actor Invariant: Instinct cannot place orders", () => {
    const state = initHandoffState(3);
    state.status = "ready_for_order";

    // Check canPlaceOrder
    const check = canPlaceOrder(state, "Instinct", 3);
    assert.strictEqual(check.allowed, false);
    assert.match(check.reason || "", /Instinct cannot place the order/);

    // Check executePlaceOrder
    const exec = executePlaceOrder(state, "Instinct", 3);
    assert.strictEqual(exec.success, false);
    assert.match(exec.error || "", /Instinct cannot place the order/);
  });
});
