import test from "node:test";
import assert from "node:assert";
import { recordItemToOrders, HouseholdOrder } from "../src/lib/orderLifecycle";
import { GroceryItem } from "../src/lib/patterns";

test("Direct item ordering & 30-minute smart grouping into Order History", async (t) => {
  await t.test("1. First item ordered creates a new order in Order History", () => {
    const existingOrders: HouseholdOrder[] = [];
    const item1: GroceryItem = {
      id: "item-1",
      name: "Milk 2 packs",
      category: "Dairy, Bread & Eggs",
      addedBy: "Lira",
      addedAt: "Today, 10:00 AM",
      isDone: false
    };

    const { updatedOrders, modifiedOrder } = recordItemToOrders(existingOrders, item1, "Rohan");

    assert.strictEqual(updatedOrders.length, 1);
    assert.strictEqual(modifiedOrder.itemsCount, 1);
    assert.strictEqual(modifiedOrder.platform, "HOUSEHOLD_APP");
    assert.strictEqual(modifiedOrder.status, "DELIVERED");
    assert.strictEqual(modifiedOrder.items[0].name, "Milk 2 packs");
    assert.strictEqual(modifiedOrder.items[0].quantity, 2);
    assert.strictEqual(modifiedOrder.items[0].status, "DELIVERED");
  });

  await t.test("2. Second item ordered within 30 minutes is grouped into the same order", () => {
    const nowIso = new Date().toISOString();
    const existingOrders: HouseholdOrder[] = [
      {
        orderId: "ord-test-1",
        orderCode: "ORD-TEST01",
        platform: "HOUSEHOLD_APP",
        status: "DELIVERED",
        placedAt: nowIso,
        deliveredAt: nowIso,
        totalAmount: 0,
        itemsCount: 1,
        items: [
          {
            id: "item-1",
            name: "Milk",
            canonicalName: "Milk",
            quantity: 1,
            category: "Dairy, Bread & Eggs",
            status: "DELIVERED",
            deliveredAt: nowIso
          }
        ],
        orderedBy: "Rohan"
      }
    ];

    const item2: GroceryItem = {
      id: "item-2",
      name: "Eggs",
      category: "Dairy, Bread & Eggs",
      addedBy: "Rhythm",
      addedAt: "Today, 10:05 AM",
      isDone: false
    };

    const { updatedOrders, modifiedOrder } = recordItemToOrders(existingOrders, item2, "Rohan", 30 * 60 * 1000);

    assert.strictEqual(updatedOrders.length, 1, "Should stay grouped in 1 order");
    assert.strictEqual(modifiedOrder.itemsCount, 2);
    assert.strictEqual(modifiedOrder.items.length, 2);
    assert.strictEqual(modifiedOrder.items[0].name, "Milk");
    assert.strictEqual(modifiedOrder.items[1].name, "Eggs");
  });

  await t.test("3. Item ordered after 30 minutes creates a separate order record", () => {
    const fortyMinutesAgo = new Date(Date.now() - 40 * 60 * 1000).toISOString();
    const existingOrders: HouseholdOrder[] = [
      {
        orderId: "ord-old",
        orderCode: "ORD-OLD",
        platform: "HOUSEHOLD_APP",
        status: "DELIVERED",
        placedAt: fortyMinutesAgo,
        deliveredAt: fortyMinutesAgo,
        totalAmount: 0,
        itemsCount: 1,
        items: [
          {
            id: "item-old",
            name: "Bread",
            canonicalName: "Bread",
            quantity: 1,
            category: "Dairy, Bread & Eggs",
            status: "DELIVERED",
            deliveredAt: fortyMinutesAgo
          }
        ],
        orderedBy: "Rohan"
      }
    ];

    const itemNew: GroceryItem = {
      id: "item-new",
      name: "Bananas",
      category: "Fruits & Vegetables",
      addedBy: "Lira",
      addedAt: "Today, 10:45 AM",
      isDone: false
    };

    const { updatedOrders, modifiedOrder } = recordItemToOrders(existingOrders, itemNew, "Rohan", 30 * 60 * 1000);

    assert.strictEqual(updatedOrders.length, 2, "Should create a separate new order");
    assert.strictEqual(modifiedOrder.items[0].name, "Bananas");
    assert.strictEqual(updatedOrders[0].orderId, modifiedOrder.orderId);
  });
});
