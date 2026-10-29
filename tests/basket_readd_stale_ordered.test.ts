import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  HouseholdBasket,
  InMemoryBasketStore,
  NoopNotificationAdapter,
  isVisibleInBasket,
} from "../src/lib/householdBasket";
import { GroceryItem } from "../src/lib/patterns";

function makeItem(overrides: Partial<GroceryItem>): GroceryItem {
  const now = new Date().toISOString();
  const base: GroceryItem = {
    id: `seed-${Math.random().toString(36).slice(2, 10)}`,
    name: "Seeded",
    category: "Other Items",
    addedBy: "Lira",
    addedAt: now,
    createdAt: now,
    isDone: false,
  };
  return { ...base, ...overrides };
}

function hoursAgoIso(hours: number): string {
  return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
}

async function basketWith(items: GroceryItem[]): Promise<HouseholdBasket> {
  const basket = new HouseholdBasket(
    new InMemoryBasketStore(items),
    new NoopNotificationAdapter()
  );
  await basket.initialize();
  return basket;
}

describe("re-adding items hidden from the basket view", () => {
  it("allows re-adding an item ordered more than 24h ago (no longer visible)", async () => {
    const ghost = makeItem({
      name: "Cucumber",
      isOrdered: true,
      orderedAt: hoursAgoIso(25),
      orderedBy: "Rohan",
    });
    const basket = await basketWith([ghost]);

    assert.equal(isVisibleInBasket(ghost), false);
    const created = await basket.addItems(["Cucumber"], "Rohan");
    assert.equal(created.length, 1);
    assert.notEqual(created[0].id, ghost.id);

    const snap = basket.getSnapshot();
    assert.equal(snap.pendingItems.length, 1);
    assert.equal(snap.basketItems.length, 1);
    assert.equal(snap.basketItems[0].id, created[0].id);
    assert.equal(snap.items.length, 2);
  });

  it("blocks re-adding an item ordered within the last 24h (still visible)", async () => {
    const recent = makeItem({
      name: "Milk",
      isOrdered: true,
      orderedAt: hoursAgoIso(1),
      orderedBy: "Rohan",
    });
    const basket = await basketWith([recent]);

    const created = await basket.addItems(["Milk"], "Lira");
    assert.equal(created.length, 0);
    assert.equal(basket.getSnapshot().items.length, 1);
    assert.equal(basket.getSnapshot().basketItems.length, 1);
  });

  it("blocks re-adding a pending (never ordered) item", async () => {
    const basket = await basketWith([]);
    await basket.addItems(["Curd"], "Lira");
    const dupe = await basket.addItems(["Curd"], "Rohan");
    assert.equal(dupe.length, 0);
    assert.equal(basket.getSnapshot().pendingItems.length, 1);
  });

  it("ignores completed (done) items when deduplicating", async () => {
    const done = makeItem({ name: "Bread", isDone: true });
    const basket = await basketWith([done]);
    const created = await basket.addItems(["Bread"], "Lira");
    assert.equal(created.length, 1);
  });

  it("treats an ordered item with a missing orderedAt as hidden and re-addable", async () => {
    const stale = makeItem({ name: "Eggs", isOrdered: true });
    const basket = await basketWith([stale]);
    assert.equal(isVisibleInBasket(stale), false);
    const created = await basket.addItems(["Eggs"], "Lira");
    assert.equal(created.length, 1);
  });

  it("duplicate predicate matches exactly what getSnapshot shows in basketItems", async () => {
    const seeded = [
      makeItem({ name: "Pending One" }),
      makeItem({
        name: "Ordered Fresh",
        isOrdered: true,
        orderedAt: hoursAgoIso(2),
      }),
      makeItem({
        name: "Ordered Stale",
        isOrdered: true,
        orderedAt: hoursAgoIso(48),
      }),
      makeItem({ name: "Done One", isDone: true }),
    ];
    const basket = await basketWith(seeded);

    const visibleNames = basket
      .getSnapshot()
      .basketItems.map((i) => i.name)
      .sort();
    assert.deepEqual(visibleNames, ["Ordered Fresh", "Pending One"]);

    // Visible items are genuine duplicates and stay blocked
    for (const name of ["Pending One", "Ordered Fresh"]) {
      const res = await basket.addItems([name], "Lira");
      assert.equal(res.length, 0, `${name} should be treated as duplicate`);
    }
    // Hidden items can be re-added
    for (const name of ["Ordered Stale", "Done One"]) {
      const res = await basket.addItems([name], "Lira");
      assert.equal(res.length, 1, `${name} should be re-addable`);
    }
  });

  it("concurrent adds of the same name create exactly one item", async () => {
    const basket = await basketWith([]);
    const [a, b] = await Promise.all([
      basket.addItems(["Milk"], "Lira"),
      basket.addItems(["Milk"], "Rohan"),
    ]);
    assert.equal(a.length + b.length, 1);
    assert.equal(basket.getSnapshot().pendingItems.length, 1);
  });

  it("concurrent re-adds racing a stale ordered ghost create exactly one new item", async () => {
    const ghost = makeItem({
      name: "Cucumber",
      isOrdered: true,
      orderedAt: hoursAgoIso(72),
    });
    const basket = await basketWith([ghost]);
    const [a, b] = await Promise.all([
      basket.addItems(["Cucumber"], "Lira"),
      basket.addItems(["Cucumber"], "Rohan"),
    ]);
    assert.equal(a.length + b.length, 1);
    const snap = basket.getSnapshot();
    assert.equal(snap.pendingItems.length, 1);
    assert.equal(snap.items.length, 2);
  });

  it("concurrent adds of different names both persist", async () => {
    const basket = await basketWith([]);
    const [a, b] = await Promise.all([
      basket.addItems(["Milk"], "Lira"),
      basket.addItems(["Curd"], "Rohan"),
    ]);
    assert.equal(a.length, 1);
    assert.equal(b.length, 1);
    assert.equal(basket.getSnapshot().pendingItems.length, 2);
  });
});
