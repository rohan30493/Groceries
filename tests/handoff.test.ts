import test from "node:test";
import assert from "node:assert/strict";
import {
  initHandoffState,
  registerBasketActivity,
  liraCompleteAndHandoff,
  canPlaceOrder,
  executePlaceOrder,
  resetBasketState,
  getLiraAutonomousRecommendations,
  LIRA_HANDOFF_MESSAGE,
  BasketHandoffState
} from "../src/lib/handoff";
import { GroceryItem } from "../src/lib/patterns";

test("Lira order handoff flow", async (t) => {
  await t.test("initial state initializes correctly", () => {
    const idleState = initHandoffState(0);
    assert.strictEqual(idleState.status, "idle");
    assert.strictEqual(idleState.handoffMessage, null);
    assert.strictEqual(idleState.orderedBy, null);

    const activeState = initHandoffState(3);
    assert.strictEqual(activeState.status, "building");
  });

  await t.test("autonomous recommendations generate items from patterns and staples", () => {
    const mockItems: GroceryItem[] = [
      {
        id: "1",
        name: "Fresh Paneer",
        category: "Dairy, Bread & Eggs",
        addedBy: "Lira",
        addedAt: "Today, 10:00 AM",
        isDone: false
      }
    ];

    const recs = getLiraAutonomousRecommendations(mockItems, 5);
    assert.ok(recs.length > 0);
    // Should not include Fresh Paneer since it is already in the basket
    assert.ok(!recs.some((r) => r.name.toLowerCase() === "fresh paneer"));
    // Each recommendation has a clear reason and category
    for (const r of recs) {
      assert.ok(r.name.length > 0);
      assert.ok(r.reason.length > 0);
      assert.ok(r.category.length > 0);
    }
  });

  await t.test("gating: order cannot be placed while Lira is building", () => {
    const buildingState = initHandoffState(4);
    assert.strictEqual(buildingState.status, "building");

    // Lira must NOT place the order
    const liraCheck = canPlaceOrder(buildingState, "Lira", 4);
    assert.strictEqual(liraCheck.allowed, false);
    assert.match(liraCheck.reason || "", /Lira cannot place the order/);

    // Rohan cannot place the order before handoff
    const rohanCheck = canPlaceOrder(buildingState, "Rohan", 4);
    assert.strictEqual(rohanCheck.allowed, false);
    assert.match(rohanCheck.reason || "", /Lira is still building the basket/);

    // Attempting to execute order placement fails
    const execution = executePlaceOrder(buildingState, "Rohan", 4);
    assert.strictEqual(execution.success, false);
    assert.strictEqual(execution.nextState.status, "building");
  });

  await t.test("handoff gate: Lira completes basket with exact message", () => {
    let state = initHandoffState(3);
    assert.strictEqual(state.status, "building");

    // Lira declares she is done
    state = liraCompleteAndHandoff(state, 3);
    assert.strictEqual(state.status, "ready_for_order");
    assert.strictEqual(state.handoffMessage, "I’m done. Please proceed with order.");
    assert.strictEqual(state.handoffMessage, LIRA_HANDOFF_MESSAGE);
    assert.ok(state.handoffAt !== null);
  });

  await t.test("empty basket cannot be handed off", () => {
    const state = initHandoffState(0);
    assert.throws(() => {
      liraCompleteAndHandoff(state, 0);
    }, /Cannot hand off an empty basket/);
  });

  await t.test("ordering: Rohan can place order after handoff point", () => {
    let state = initHandoffState(2);
    state = liraCompleteAndHandoff(state, 2);

    // Lira still cannot place the order
    const liraCheck = canPlaceOrder(state, "Lira", 2);
    assert.strictEqual(liraCheck.allowed, false);

    // Rohan is allowed to place order
    const rohanCheck = canPlaceOrder(state, "Rohan", 2);
    assert.strictEqual(rohanCheck.allowed, true);

    // Rohan places the order
    const result = executePlaceOrder(state, "Rohan", 2);
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.nextState.status, "ordered");
    assert.strictEqual(result.nextState.orderedBy, "Rohan");
    assert.ok(result.nextState.orderedAt !== null);
    assert.strictEqual(result.nextState.lastRunSummary?.itemCount, 2);
  });

  await t.test("subsequent mutations or additions re-trigger building state", () => {
    let state = initHandoffState(2);
    state = liraCompleteAndHandoff(state, 2);
    assert.strictEqual(state.status, "ready_for_order");

    // If more items are added, basket goes back to building for Lira to finalize
    state = registerBasketActivity(state, 3);
    assert.strictEqual(state.status, "building");
    assert.strictEqual(state.handoffMessage, null);

    // Place order is again gated
    const check = canPlaceOrder(state, "Rohan", 3);
    assert.strictEqual(check.allowed, false);
  });

  await t.test("resetting returns to idle", () => {
    const reset = resetBasketState();
    assert.strictEqual(reset.status, "idle");
    assert.strictEqual(reset.handoffMessage, null);
    assert.strictEqual(reset.orderedBy, null);
  });

  await t.test("adding items to an ordered basket re-enters building state for next run", () => {
    let state = initHandoffState(2);
    state = liraCompleteAndHandoff(state, 2);
    const orderRes = executePlaceOrder(state, "Rohan", 2);
    assert.strictEqual(orderRes.success, true);
    assert.strictEqual(orderRes.nextState.status, "ordered");

    // Cannot order again while already ordered
    const secondOrderCheck = canPlaceOrder(orderRes.nextState, "Rohan", 0);
    assert.strictEqual(secondOrderCheck.allowed, false);

    // New items added by household start next building cycle
    const nextRunState = registerBasketActivity(orderRes.nextState, 1);
    assert.strictEqual(nextRunState.status, "building");
    assert.strictEqual(nextRunState.handoffMessage, null);
  });

  await t.test("actor invariant: Lira and Rhythm can never place the order under any circumstances", () => {
    // 1. In idle
    assert.strictEqual(canPlaceOrder(initHandoffState(0), "Lira", 0).allowed, false);
    assert.strictEqual(canPlaceOrder(initHandoffState(0), "Rhythm", 0).allowed, false);
    // 2. In building
    assert.strictEqual(canPlaceOrder(initHandoffState(2), "Lira", 2).allowed, false);
    assert.strictEqual(canPlaceOrder(initHandoffState(2), "Rhythm", 2).allowed, false);
    // 3. In ready_for_order
    let state = initHandoffState(2);
    state = liraCompleteAndHandoff(state, 2);
    assert.strictEqual(canPlaceOrder(state, "Lira", 2).allowed, false);
    assert.strictEqual(canPlaceOrder(state, "Rhythm", 2).allowed, false);
    const execResLira = executePlaceOrder(state, "Lira", 2);
    assert.strictEqual(execResLira.success, false);
    assert.match(execResLira.error || "", /Lira cannot place the order/);

    const execResRhythm = executePlaceOrder(state, "Rhythm", 2);
    assert.strictEqual(execResRhythm.success, false);
    assert.match(execResRhythm.error || "", /Rhythm cannot place the order/);
  });
});
