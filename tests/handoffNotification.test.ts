import test from "node:test";
import assert from "node:assert/strict";
import {
  evaluateHandoffNotification,
  estimateBasketValue,
  formatNotificationPreview
} from "../src/lib/handoffNotification";
import {
  initHandoffState,
  liraCompleteAndHandoff,
  registerBasketActivity,
  executePlaceOrder,
  resetBasketState,
  BasketHandoffState
} from "../src/lib/handoff";
import { GroceryItem } from "../src/lib/patterns";
import {
  getBrowserNotificationPermission,
  sendBrowserHandoffNotification
} from "../src/lib/pushNotifications";

const sampleItems: GroceryItem[] = [
  {
    id: "item-1",
    name: "Nandini GoodLife Toned Milk",
    category: "Dairy, Bread & Eggs",
    addedBy: "Lira",
    addedAt: "10:00 AM",
    isDone: false
  },
  {
    id: "item-2",
    name: "Cucumber English",
    category: "Fruits & Vegetables",
    addedBy: "Lira",
    addedAt: "10:01 AM",
    isDone: false
  }
];

test("Lira Handoff Notification System", async (t) => {
  await t.test("READY_FOR_ORDER creates exactly one valid notification", () => {
    let state = initHandoffState(2);
    state = liraCompleteAndHandoff(state, 2);

    assert.strictEqual(state.status, "ready_for_order");
    assert.ok(state.handoffAt !== null);

    const notification = evaluateHandoffNotification(state, sampleItems);
    assert.ok(notification !== null);
    assert.strictEqual(notification.id, `handoff_${state.handoffAt}`);
    assert.strictEqual(notification.title, "Lira is done 🛒 — Your grocery basket is ready to review.");
    assert.strictEqual(notification.message, "I’m done. Please proceed with order.");
    assert.strictEqual(notification.itemCount, 2);
    assert.strictEqual(notification.isAcknowledged, false);
    assert.ok(notification.estimatedBasketValue !== null);
    assert.ok(notification.estimatedBasketValue! > 0);
  });

  await t.test("Repeated renders/calls do not duplicate or mutate notification ID", () => {
    let state = initHandoffState(2);
    state = liraCompleteAndHandoff(state, 2);

    const notification1 = evaluateHandoffNotification(state, sampleItems);
    const notification2 = evaluateHandoffNotification(state, sampleItems);
    const notification3 = evaluateHandoffNotification(state, sampleItems);

    assert.ok(notification1 && notification2 && notification3);
    assert.strictEqual(notification1.id, notification2.id);
    assert.strictEqual(notification2.id, notification3.id);
  });

  await t.test("Notification is NOT created for BUILDING, IDLE, or ORDERED states", () => {
    // 1. Idle state
    const idleState = initHandoffState(0);
    assert.strictEqual(evaluateHandoffNotification(idleState, []), null);

    // 2. Building state
    const buildingState = initHandoffState(3);
    assert.strictEqual(evaluateHandoffNotification(buildingState, sampleItems), null);

    // 3. Ordered state
    let handoffState = liraCompleteAndHandoff(initHandoffState(2), 2);
    const orderRes = executePlaceOrder(handoffState, "Rohan", 2);
    assert.strictEqual(orderRes.success, true);
    assert.strictEqual(evaluateHandoffNotification(orderRes.nextState, sampleItems), null);

    // 4. Reset state
    const resetState = resetBasketState();
    assert.strictEqual(evaluateHandoffNotification(resetState, sampleItems), null);
  });

  await t.test("Notification can be acknowledged and reflects isAcknowledged: true", () => {
    let state = initHandoffState(2);
    state = liraCompleteAndHandoff(state, 2);

    const notificationId = `handoff_${state.handoffAt}`;
    const acknowledgedSet = new Set<string>([notificationId]);

    const notification = evaluateHandoffNotification(state, sampleItems, acknowledgedSet);
    assert.ok(notification !== null);
    assert.strictEqual(notification.isAcknowledged, true);
  });

  await t.test("Formatting preview includes item count and estimated value", () => {
    const notif = {
      id: "test",
      handoffAt: new Date().toISOString(),
      itemCount: 3,
      estimatedBasketValue: 240,
      title: "Lira is done 🛒 — Your grocery basket is ready to review.",
      message: "I’m done. Please proceed with order.",
      isAcknowledged: false
    };

    const preview = formatNotificationPreview(notif);
    assert.strictEqual(preview, "3 items • Est. ₹240");
  });

  await t.test("Graceful push handling in unsupported/non-browser environment", () => {
    // Node test environment does not have window/Notification
    const perm = getBrowserNotificationPermission();
    assert.strictEqual(perm, "unsupported");

    const sent = sendBrowserHandoffNotification({
      itemCount: 2,
      estimatedValue: 150
    });
    // Should fail gracefully returning false without throwing any exception
    assert.strictEqual(sent, false);
  });
});
