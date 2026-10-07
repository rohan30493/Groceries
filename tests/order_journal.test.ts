import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { OrderJournal, InMemoryOrderStore } from "../src/lib/orderJournal";
import { GroceryItem } from "../src/lib/patterns";

describe("OrderJournal Deep Module", () => {
  it("records first item as a new order", async () => {
    const store = new InMemoryOrderStore();
    const journal = new OrderJournal(store, { initialOrders: [] });

    const item: GroceryItem = {
      id: "it-1",
      name: "Fresh Paneer",
      category: "Dairy, Bread & Eggs",
      addedBy: "Rohan",
      addedAt: new Date().toISOString(),
      isDone: false
    };

    const { order, wasGrouped } = await journal.recordItem(item, "Rohan");

    assert.equal(wasGrouped, false);
    assert.equal(order.itemsCount, 1);
    assert.equal(order.items[0].canonicalName, "Fresh Paneer");
    assert.equal(journal.listOrders().length, 1);
  });

  it("groups second item ordered within 30 minutes into the same order", async () => {
    const store = new InMemoryOrderStore();
    const journal = new OrderJournal(store, { initialOrders: [] });

    const item1: GroceryItem = {
      id: "it-1",
      name: "Milk",
      category: "Dairy, Bread & Eggs",
      addedBy: "Lira",
      addedAt: new Date().toISOString(),
      isDone: false
    };

    const item2: GroceryItem = {
      id: "it-2",
      name: "Eggs",
      category: "Dairy, Bread & Eggs",
      addedBy: "Rohan",
      addedAt: new Date().toISOString(),
      isDone: false
    };

    await journal.recordItem(item1, "Rohan");
    const { order: groupedOrder, wasGrouped } = await journal.recordItem(item2, "Rohan");

    assert.equal(wasGrouped, true);
    assert.equal(groupedOrder.itemsCount, 2);
    assert.equal(journal.listOrders().length, 1);
  });

  it("creates a new order when item is ordered after 30-minute window", async () => {
    const store = new InMemoryOrderStore();
    // Simulate past order from 35 minutes ago
    const pastTime = new Date(Date.now() - 35 * 60 * 1000).toISOString();
    const initialOrder = {
      orderId: "ord-old",
      platform: "HOUSEHOLD_APP",
      status: "DELIVERED" as const,
      placedAt: pastTime,
      totalAmount: 0,
      itemsCount: 1,
      items: [
        {
          id: "it-old",
          name: "Atta",
          canonicalName: "Atta / Wheat Flour",
          quantity: 1,
          status: "DELIVERED" as const
        }
      ]
    };

    const journal = new OrderJournal(store, { initialOrders: [initialOrder] });

    const newItem: GroceryItem = {
      id: "it-new",
      name: "Tomatoes",
      category: "Fruits & Vegetables",
      addedBy: "Rohan",
      addedAt: new Date().toISOString(),
      isDone: false
    };

    const { order, wasGrouped } = await journal.recordItem(newItem, "Rohan");

    assert.equal(wasGrouped, false);
    assert.notEqual(order.orderId, "ord-old");
    assert.equal(journal.listOrders().length, 2);
  });

  it("updates order status and item outcomes with reconciliation", async () => {
    const store = new InMemoryOrderStore();
    const journal = new OrderJournal(store, { initialOrders: [] });

    const item: GroceryItem = {
      id: "it-1",
      name: "Cooking Oil",
      category: "Atta, Rice, Oil & Dals",
      addedBy: "Rohan",
      addedAt: new Date().toISOString(),
      isDone: false
    };

    const { order } = await journal.recordItem(item, "Rohan");
    assert.equal(order.status, "DELIVERED");

    await journal.updateStatus(order.orderId, "ORDER_PLACED");
    const updated = journal.listOrders().find((o) => o.orderId === order.orderId);
    assert.equal(updated?.status, "ORDER_PLACED");
  });

  it("handles exact 29:59, 30:00, and 30:01 grouping window boundaries deterministically", async () => {
    let mockTime = 1_000_000_000_000;
    const store = new InMemoryOrderStore();
    const journal = new OrderJournal(store, {
      initialOrders: [],
      timeProvider: () => mockTime,
      windowMs: 30 * 60 * 1000
    });

    const baseItem: GroceryItem = {
      id: "it-base",
      name: "Milk",
      category: "Dairy, Bread & Eggs",
      addedBy: "Rohan",
      addedAt: new Date(mockTime).toISOString(),
      isDone: false
    };

    // First order placed at t = 0
    await journal.recordItem(baseItem, "Rohan");
    assert.equal(journal.listOrders().length, 1);

    // Item 2 placed at t = 29m 59s (should group)
    mockTime += 29 * 60 * 1000 + 59 * 1000;
    const item2959: GroceryItem = {
      id: "it-2959",
      name: "Eggs",
      category: "Dairy, Bread & Eggs",
      addedBy: "Rohan",
      addedAt: new Date(mockTime).toISOString(),
      isDone: false
    };
    const res2959 = await journal.recordItem(item2959, "Rohan");
    assert.equal(res2959.wasGrouped, true);
    assert.equal(journal.listOrders().length, 1);

    // Item 3 placed at t = 30m 00s from initial base order (should group as <= windowMs)
    // Note: diff from base order is now exactly 30m 00s
    mockTime = 1_000_000_000_000 + 30 * 60 * 1000;
    const item3000: GroceryItem = {
      id: "it-3000",
      name: "Bread",
      category: "Dairy, Bread & Eggs",
      addedBy: "Rohan",
      addedAt: new Date(mockTime).toISOString(),
      isDone: false
    };
    const res3000 = await journal.recordItem(item3000, "Rohan");
    assert.equal(res3000.wasGrouped, true);
    assert.equal(journal.listOrders().length, 1);

    // Item 4 placed at t = 30m 01s from initial base order (exceeds window, should create new order)
    mockTime = 1_000_000_000_000 + 30 * 60 * 1000 + 1000;
    const item3001: GroceryItem = {
      id: "it-3001",
      name: "Butter",
      category: "Dairy, Bread & Eggs",
      addedBy: "Rohan",
      addedAt: new Date(mockTime).toISOString(),
      isDone: false
    };
    const res3001 = await journal.recordItem(item3001, "Rohan");
    assert.equal(res3001.wasGrouped, false);
    assert.equal(journal.listOrders().length, 2);
  });
});
