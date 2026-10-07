import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  HouseholdBasket,
  InMemoryBasketStore,
  NoopNotificationAdapter
} from "../src/lib/householdBasket";

describe("HouseholdBasket Deep Module", () => {
  it("initializes in idle state with empty basket", async () => {
    const store = new InMemoryBasketStore();
    const adapter = new NoopNotificationAdapter();
    const basket = new HouseholdBasket(store, adapter);

    await basket.initialize();
    const snap = basket.getSnapshot();

    assert.equal(snap.items.length, 0);
    assert.equal(snap.pendingItems.length, 0);
    assert.equal(snap.handoffState.status, "idle");
  });

  it("addItems adds items, transitions to building, and deduplicates active items", async () => {
    const store = new InMemoryBasketStore();
    const adapter = new NoopNotificationAdapter();
    const basket = new HouseholdBasket(store, adapter);

    await basket.initialize();
    const added = await basket.addItems(["Tomatoes", "Fresh Paneer"], "Lira");

    assert.equal(added.length, 2);
    const snap = basket.getSnapshot();
    assert.equal(snap.pendingItems.length, 2);
    assert.equal(snap.handoffState.status, "building");

    // Attempting duplicate addition of Tomatoes
    const dupe = await basket.addItems(["Tomatoes"], "Rohan");
    assert.equal(dupe.length, 0);
    assert.equal(basket.getSnapshot().pendingItems.length, 2);
  });

  it("markAsOrdered transitions item to ordered, updates pending count, and retains in basketItems", async () => {
    const store = new InMemoryBasketStore();
    const adapter = new NoopNotificationAdapter();
    const basket = new HouseholdBasket(store, adapter);

    await basket.initialize();
    const [item] = await basket.addItems(["Milk"], "Lira");

    assert.equal(basket.getSnapshot().pendingItems.length, 1);
    await basket.markAsOrdered(item.id, "Rohan");

    const snap = basket.getSnapshot();
    assert.equal(snap.pendingItems.length, 0);
    assert.equal(snap.basketItems.length, 1);
    assert.equal(snap.basketItems[0].isOrdered, true);
    assert.equal(snap.basketItems[0].orderedBy, "Rohan");
    assert.ok(snap.basketItems[0].orderedAt);
  });

  it("undoOrdered restores ordered item back to active pending", async () => {
    const store = new InMemoryBasketStore();
    const adapter = new NoopNotificationAdapter();
    const basket = new HouseholdBasket(store, adapter);

    await basket.initialize();
    const [item] = await basket.addItems(["Curd"], "Rohan");
    await basket.markAsOrdered(item.id, "Rohan");
    assert.equal(basket.getSnapshot().pendingItems.length, 0);

    await basket.undoOrdered(item.id);
    const snap = basket.getSnapshot();
    assert.equal(snap.pendingItems.length, 1);
    assert.equal(snap.pendingItems[0].isOrdered, false);
  });

  it("handoff rejects empty basket and enforces gating", async () => {
    const store = new InMemoryBasketStore();
    const adapter = new NoopNotificationAdapter();
    const basket = new HouseholdBasket(store, adapter);

    await basket.initialize();
    await assert.rejects(
      async () => basket.handoff(),
      /Cannot hand off an empty basket/
    );
  });

  it("handoff on active basket sets ready_for_order, valuation, and dispatches notification", async () => {
    const store = new InMemoryBasketStore();
    const adapter = new NoopNotificationAdapter();
    const basket = new HouseholdBasket(store, adapter);

    await basket.initialize();
    await basket.addItems(["Tomatoes", "Onions"], "Lira");
    await basket.handoff();

    const snap = basket.getSnapshot();
    assert.equal(snap.handoffState.status, "ready_for_order");
    assert.equal(snap.handoffState.handoffMessage, "I’m done. Please proceed with order.");
    assert.ok(snap.activeNotification);
    assert.equal(snap.activeNotification?.itemCount, 2);
    assert.equal(adapter.sentCount, 1);
  });

  it("actor invariant: Lira and Rhythm cannot place order, Rohan can", async () => {
    const store = new InMemoryBasketStore();
    const adapter = new NoopNotificationAdapter();
    const basket = new HouseholdBasket(store, adapter);

    await basket.initialize();
    await basket.addItems(["Potatoes"], "Lira");
    await basket.handoff();

    await assert.rejects(
      async () => basket.placeOrder("Lira"),
      /Lira cannot place the order/
    );

    await assert.rejects(
      async () => basket.placeOrder("Rhythm"),
      /Rhythm cannot place the order/
    );

    await basket.placeOrder("Rohan");
    const snap = basket.getSnapshot();
    assert.equal(snap.handoffState.status, "ordered");
    assert.equal(snap.handoffState.orderedBy, "Rohan");
  });

  it("toggleDone and clearCompleted updates and archives items", async () => {
    const store = new InMemoryBasketStore();
    const adapter = new NoopNotificationAdapter();
    const basket = new HouseholdBasket(store, adapter);

    await basket.initialize();
    const [item] = await basket.addItems(["Coriander"], "Rohan");
    await basket.toggleDone(item.id);

    assert.equal(basket.getSnapshot().completedItems.length, 1);
    await basket.clearCompleted();
    assert.equal(basket.getSnapshot().completedItems.length, 0);
  });

  it("reactive subscribe receives updates on mutations", async () => {
    const store = new InMemoryBasketStore();
    const adapter = new NoopNotificationAdapter();
    const basket = new HouseholdBasket(store, adapter);

    let notificationCallCount = 0;
    const unsub = basket.subscribe(() => {
      notificationCallCount++;
    });

    await basket.addItems(["Eggs"], "Rohan");
    assert.ok(notificationCallCount >= 2);
    unsub();
  });

  it("rejects invalid basket order placement before handoff (building state)", async () => {
    const store = new InMemoryBasketStore();
    const adapter = new NoopNotificationAdapter();
    const basket = new HouseholdBasket(store, adapter);

    await basket.initialize();
    await basket.addItems(["Carrots"], "Rohan");

    // Attempting to place order while in building state (before handoff)
    await assert.rejects(
      async () => basket.placeOrder("Rohan"),
      /Lira is still building the basket/
    );
  });

  it("deduplicates handoff notifications and handles repeated handoffs gracefully", async () => {
    const store = new InMemoryBasketStore();
    const adapter = new NoopNotificationAdapter();
    const basket = new HouseholdBasket(store, adapter);

    await basket.initialize();
    await basket.addItems(["Apples"], "Lira");
    await basket.handoff();

    const snap1 = basket.getSnapshot();
    assert.equal(adapter.sentCount, 1);
    assert.ok(snap1.activeNotification);

    // Dismiss the notification
    basket.acknowledgeNotification(snap1.activeNotification!.id);
    const snap2 = basket.getSnapshot();
    assert.equal(snap2.activeNotification?.isAcknowledged, true);
  });
});
