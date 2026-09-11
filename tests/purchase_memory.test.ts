import test from "node:test";
import assert from "node:assert/strict";
import {
  HouseholdOrder,
  OrderLineItem,
  createOrderFromBasket,
  updateOrderItemOutcome,
  updateOrderStatus,
  computeOrderStatus
} from "../src/lib/orderLifecycle";
import {
  buildPurchaseMemory,
  getCanonicalPurchaseMemory,
  getActiveOrderItems,
  isItemInActiveOrder,
  getDeliveredPurchases
} from "../src/lib/purchaseMemory";
import {
  getLiraAutonomousRecommendations,
  initHandoffState,
  liraCompleteAndHandoff,
  executePlaceOrder
} from "../src/lib/handoff";
import { GroceryItem } from "../src/lib/patterns";

test("Order History + Lira Purchase-Memory System", async (t) => {
  // 1. Suggested item → NOT purchase history
  await t.test("1. Suggested item → NOT purchase history", () => {
    const emptyOrders: HouseholdOrder[] = [];
    const basket: GroceryItem[] = [];

    // Lira generates suggestions
    const recs = getLiraAutonomousRecommendations(basket, 5, emptyOrders);
    assert.ok(recs.length > 0);
    const suggestedItemName = recs[0].name;

    // A suggested item without any completed orders must NOT exist in purchase memory
    const memory = getCanonicalPurchaseMemory(suggestedItemName, emptyOrders);
    assert.strictEqual(memory, null);
    const delivered = getDeliveredPurchases(emptyOrders);
    assert.strictEqual(delivered.length, 0);
  });

  // 2. Basket item → NOT purchase history
  await t.test("2. Basket item → NOT purchase history", () => {
    const basketItems: GroceryItem[] = [
      {
        id: "b-1",
        name: "Fresh Paneer",
        category: "Dairy, Bread & Eggs",
        addedBy: "Lira",
        addedAt: "Today, 10:00 AM",
        isDone: false
      },
      {
        id: "b-2",
        name: "Cat Food",
        category: "Pet Care & Household",
        addedBy: "Rohan",
        addedAt: "Today, 10:05 AM",
        isDone: false
      }
    ];

    const emptyOrders: HouseholdOrder[] = [];

    // Merely having items in the basket does NOT constitute purchase history
    const paneerMem = getCanonicalPurchaseMemory("Fresh Paneer", emptyOrders);
    assert.strictEqual(paneerMem, null);

    const catFoodMem = getCanonicalPurchaseMemory("Cat Food", emptyOrders);
    assert.strictEqual(catFoodMem, null);

    assert.strictEqual(getDeliveredPurchases(emptyOrders).length, 0);
  });

  // 3. Order placed → recorded as ordered (active, not yet delivered)
  await t.test("3. Order placed → recorded as ordered", () => {
    const basketItems: GroceryItem[] = [
      {
        id: "b-1",
        name: "Fresh Paneer",
        category: "Dairy, Bread & Eggs",
        addedBy: "Lira",
        addedAt: "Today, 10:00 AM",
        isDone: false
      }
    ];

    const order = createOrderFromBasket(basketItems, "Zepto", "Rohan");
    assert.strictEqual(order.status, "ORDER_PLACED");
    assert.strictEqual(order.items.length, 1);
    assert.strictEqual(order.items[0].status, "ORDER_PLACED");

    // Check purchase memory
    const memory = getCanonicalPurchaseMemory("Fresh Paneer", [order]);
    assert.ok(memory !== null);
    assert.strictEqual(memory.historicalOrderCount, 1);
    assert.ok(memory.lastOrderedDate !== null);
    // Not yet delivered
    assert.strictEqual(memory.historicalDeliveredCount, 0);
    assert.strictEqual(memory.lastDeliveredDate, null);
    assert.strictEqual(memory.mostRecentOrderResultedInDelivery, false);

    // Active order check
    assert.strictEqual(isItemInActiveOrder("Fresh Paneer", [order]), true);
  });

  // 4. Delivered item → recorded as purchased
  await t.test("4. Delivered item → recorded as purchased", () => {
    const basketItems: GroceryItem[] = [
      {
        id: "b-1",
        name: "Fresh Paneer",
        category: "Dairy, Bread & Eggs",
        addedBy: "Lira",
        addedAt: "Today, 10:00 AM",
        isDone: false
      }
    ];

    let order = createOrderFromBasket(basketItems, "Zepto", "Rohan");
    order = updateOrderStatus(order, "DELIVERED");

    assert.strictEqual(order.status, "DELIVERED");
    assert.strictEqual(order.items[0].status, "DELIVERED");

    const memory = getCanonicalPurchaseMemory("Fresh Paneer", [order]);
    assert.ok(memory !== null);
    assert.strictEqual(memory.historicalDeliveredCount, 1);
    assert.ok(memory.lastDeliveredDate !== null);
    assert.strictEqual(memory.historicalQuantity, 1);
    assert.strictEqual(memory.mostRecentOrderResultedInDelivery, true);

    const deliveredList = getDeliveredPurchases([order]);
    assert.strictEqual(deliveredList.length, 1);
    assert.strictEqual(deliveredList[0].canonicalName, "Fresh Paneer");
  });

  // 5. Cancelled item → NOT recorded as purchased
  await t.test("5. Cancelled item → NOT recorded as purchased", () => {
    const basketItems: GroceryItem[] = [
      {
        id: "b-1",
        name: "Amul Milk 1L",
        category: "Dairy, Bread & Eggs",
        addedBy: "Lira",
        addedAt: "Today, 10:00 AM",
        isDone: false
      }
    ];

    let order = createOrderFromBasket(basketItems, "Zepto", "Rohan");
    order = updateOrderStatus(order, "CANCELLED");

    assert.strictEqual(order.status, "CANCELLED");
    assert.strictEqual(order.items[0].status, "CANCELLED");

    const memory = getCanonicalPurchaseMemory("Milk", [order]);
    assert.ok(memory !== null);
    // Ordered count is 1 because order was placed, but delivered count is 0
    assert.strictEqual(memory.historicalOrderCount, 1);
    assert.strictEqual(memory.historicalDeliveredCount, 0);
    assert.strictEqual(memory.lastDeliveredDate, null);
    assert.strictEqual(memory.mostRecentOrderResultedInDelivery, false);

    const deliveredList = getDeliveredPurchases([order]);
    assert.strictEqual(deliveredList.length, 0);
  });

  // 6. Partially delivered order → only delivered items enter purchase history
  await t.test("6. Partially delivered order → only delivered items enter purchase history", () => {
    // Example from prompt:
    // Order:
    // - Milk ×2 → CANCELLED
    // - Paneer ×1 → DELIVERED
    // - Cat Food ×1 → DELIVERED
    const basketItems: GroceryItem[] = [
      { id: "1", name: "Milk ×2", category: "Dairy, Bread & Eggs", addedBy: "Lira", addedAt: "Today", isDone: false },
      { id: "2", name: "Paneer ×1", category: "Dairy, Bread & Eggs", addedBy: "Lira", addedAt: "Today", isDone: false },
      { id: "3", name: "Cat Food ×1", category: "Pet Care & Household", addedBy: "Rohan", addedAt: "Today", isDone: false }
    ];

    let order = createOrderFromBasket(basketItems, "Zepto", "Rohan");

    // Set item outcomes
    order = updateOrderItemOutcome(order, "Milk", "CANCELLED");
    order = updateOrderItemOutcome(order, "Paneer", "DELIVERED");
    order = updateOrderItemOutcome(order, "Cat Food", "DELIVERED");

    assert.strictEqual(order.status, "PARTIALLY_DELIVERED");

    const orders = [order];
    const paneerMem = getCanonicalPurchaseMemory("Fresh Paneer", orders);
    const catFoodMem = getCanonicalPurchaseMemory("Cat Food", orders);
    const milkMem = getCanonicalPurchaseMemory("Milk", orders);

    // Paneer & Cat Food ARE recorded as purchased
    assert.ok(paneerMem !== null);
    assert.strictEqual(paneerMem.historicalDeliveredCount, 1);
    assert.strictEqual(paneerMem.mostRecentOrderResultedInDelivery, true);
    assert.ok(paneerMem.lastDeliveredDate !== null);

    assert.ok(catFoodMem !== null);
    assert.strictEqual(catFoodMem.historicalDeliveredCount, 1);
    assert.strictEqual(catFoodMem.mostRecentOrderResultedInDelivery, true);
    assert.ok(catFoodMem.lastDeliveredDate !== null);

    // Milk was CANCELLED → NOT recorded as purchased
    assert.ok(milkMem !== null);
    assert.strictEqual(milkMem.historicalDeliveredCount, 0);
    assert.strictEqual(milkMem.lastDeliveredDate, null);
    assert.strictEqual(milkMem.mostRecentOrderResultedInDelivery, false);

    // Delivered purchases list only contains Paneer and Cat Food
    const delivered = getDeliveredPurchases(orders);
    assert.strictEqual(delivered.length, 2);
    const deliveredCanonicals = delivered.map((d) => d.canonicalName);
    assert.ok(deliveredCanonicals.includes("Fresh Paneer"));
    assert.ok(deliveredCanonicals.includes("Cat Food"));
    assert.ok(!deliveredCanonicals.includes("Milk"));
  });

  // 7. Ordered basket clears after successful order creation
  await t.test("7. Ordered basket clears after successful order creation", () => {
    let basket: GroceryItem[] = [
      { id: "1", name: "Tomatoes", category: "Fruits & Vegetables", addedBy: "Lira", addedAt: "Today", isDone: false },
      { id: "2", name: "Eggs", category: "Dairy, Bread & Eggs", addedBy: "Rohan", addedAt: "Today", isDone: false }
    ];

    let state = initHandoffState(basket.length);
    state = liraCompleteAndHandoff(state, basket.length);

    // Rohan places order
    const orderExec = executePlaceOrder(state, "Rohan", basket.length);
    assert.strictEqual(orderExec.success, true);

    // Order created
    const createdOrder = createOrderFromBasket(basket, "Zepto", "Rohan");
    assert.strictEqual(createdOrder.items.length, 2);

    // Basket cleared
    basket = [];
    assert.strictEqual(basket.length, 0);

    // Order remains intact in order history
    assert.strictEqual(createdOrder.status, "ORDER_PLACED");
    assert.strictEqual(createdOrder.itemsCount, 2);
  });

  // 8. Active-order items are not immediately re-added by Lira
  await t.test("8. Active-order items are not immediately re-added by Lira", () => {
    const basketItems: GroceryItem[] = [
      { id: "1", name: "Cat Food", category: "Pet Care & Household", addedBy: "Lira", addedAt: "Today", isDone: false },
      { id: "2", name: "Fresh Paneer", category: "Dairy, Bread & Eggs", addedBy: "Lira", addedAt: "Today", isDone: false }
    ];

    // Order placed and is in active state
    const activeOrder = createOrderFromBasket(basketItems, "Zepto", "Rohan");
    assert.strictEqual(activeOrder.status, "ORDER_PLACED");

    // Basket is now empty for the new shopping run
    const currentBasket: GroceryItem[] = [];

    // Lira generates autonomous recommendations, passing active orders
    const recs = getLiraAutonomousRecommendations(currentBasket, 6, [activeOrder]);

    // Active order items must NOT be re-added
    const recNames = recs.map((r) => r.name.toLowerCase());
    assert.ok(!recNames.includes("cat food"));
    assert.ok(!recNames.includes("fresh paneer"));
  });

  // 9. Historical purchases remain available after basket is cleared
  await t.test("9. Historical purchases remain available after basket is cleared", () => {
    const basketItems: GroceryItem[] = [
      { id: "1", name: "Fresh Paneer", category: "Dairy, Bread & Eggs", addedBy: "Lira", addedAt: "Today", isDone: false }
    ];

    let order = createOrderFromBasket(basketItems, "Zepto", "Rohan");
    order = updateOrderStatus(order, "DELIVERED");

    const ordersHistory = [order];

    // Basket is cleared
    const emptyBasket: GroceryItem[] = [];
    assert.strictEqual(emptyBasket.length, 0);

    // Historical purchase memory is fully retained and queryable
    const paneerMem = getCanonicalPurchaseMemory("Fresh Paneer", ordersHistory);
    assert.ok(paneerMem !== null);
    assert.strictEqual(paneerMem.historicalDeliveredCount, 1);
    assert.strictEqual(paneerMem.mostRecentOrderResultedInDelivery, true);
    assert.ok(paneerMem.lastDeliveredDate !== null);
  });

  // 10. Canonical/normalized product identity correctly groups brand/variant purchases
  await t.test("10. Canonical/normalized product identity correctly groups brand/variant purchases", () => {
    // 3 different orders with different brand variants of paneer
    const order1 = updateOrderStatus(
      createOrderFromBasket(
        [{ id: "1", name: "Amul Malai Paneer 200g", category: "Dairy, Bread & Eggs", addedBy: "Rohan", addedAt: "Sep 1", isDone: false }],
        "Zepto"
      ),
      "DELIVERED"
    );

    const order2 = updateOrderStatus(
      createOrderFromBasket(
        [{ id: "2", name: "Gowardhan Fresh Paneer Classic Block", category: "Dairy, Bread & Eggs", addedBy: "Rohan", addedAt: "Sep 5", isDone: false }],
        "Swiggy Instamart"
      ),
      "DELIVERED"
    );

    const order3 = updateOrderStatus(
      createOrderFromBasket(
        [{ id: "3", name: "Milky Mist Paneer ×2", category: "Dairy, Bread & Eggs", addedBy: "Lira", addedAt: "Sep 9", isDone: false }],
        "Zepto"
      ),
      "DELIVERED"
    );

    const orders = [order1, order2, order3];

    // Query canonical name "Fresh Paneer"
    const memory = getCanonicalPurchaseMemory("Fresh Paneer", orders);
    assert.ok(memory !== null);
    assert.strictEqual(memory.canonicalName, "Fresh Paneer");
    // All 3 orders consolidated under the same canonical identity
    assert.strictEqual(memory.historicalOrderCount, 3);
    assert.strictEqual(memory.historicalDeliveredCount, 3);
    // Quantities: order1 (1) + order2 (1) + order3 (2) = 4
    assert.strictEqual(memory.historicalQuantity, 4);
    assert.strictEqual(memory.recentPurchases.length, 3);

    // Querying with variant brand string also resolves to the canonical memory
    const variantQueryMem = getCanonicalPurchaseMemory("Amul Malai Paneer 200g", orders);
    assert.ok(variantQueryMem !== null);
    assert.strictEqual(variantQueryMem.canonicalName, "Fresh Paneer");
    assert.strictEqual(variantQueryMem.historicalDeliveredCount, 3);
  });
});
