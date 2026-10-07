import { GroceryItem } from "./patterns";
import { HouseholdOrder } from "./orderLifecycle";
import { itemCatalog } from "./itemCatalog";

export type BasketStatus = "idle" | "building" | "ready_for_order" | "ordered";

export const LIRA_HANDOFF_MESSAGE = "I’m done. Please proceed with order.";

export interface BasketHandoffState {
  status: BasketStatus;
  handoffMessage: string | null;
  handoffAt: string | null;
  orderedAt: string | null;
  orderedBy: "Rohan" | null;
  lastRunSummary?: {
    itemCount: number;
    orderedAt: string;
  } | null;
}

export function initHandoffState(itemsCount: number = 0): BasketHandoffState {
  return {
    status: itemsCount > 0 ? "building" : "idle",
    handoffMessage: null,
    handoffAt: null,
    orderedAt: null,
    orderedBy: null,
    lastRunSummary: null
  };
}

/**
 * When items are added or refined, ensure state is 'building' (if not already handed off or ordered).
 * If items are added after handoff, it moves back to 'building' so Lira can finish and hand off again.
 */
export function registerBasketActivity(
  currentState: BasketHandoffState,
  itemsCount: number
): BasketHandoffState {
  if (itemsCount === 0) {
    return {
      ...currentState,
      status: "idle",
      handoffMessage: null,
      handoffAt: null
    };
  }

  // If already ready_for_order, adding more items returns to building for Lira's final handoff
  if (currentState.status === "ready_for_order" || currentState.status === "idle" || currentState.status === "ordered") {
    return {
      ...currentState,
      status: "building",
      handoffMessage: null,
      handoffAt: null,
      orderedAt: null,
      orderedBy: null
    };
  }

  return currentState;
}

/**
 * Lira determines the basket is complete and issues the handoff gate message.
 */
export function liraCompleteAndHandoff(
  currentState: BasketHandoffState,
  itemsCount: number
): BasketHandoffState {
  if (itemsCount === 0) {
    throw new Error("Cannot hand off an empty basket. Please add items first.");
  }

  return {
    ...currentState,
    status: "ready_for_order",
    handoffMessage: LIRA_HANDOFF_MESSAGE,
    handoffAt: new Date().toISOString(),
    orderedAt: null,
    orderedBy: null
  };
}

export interface CanPlaceOrderResult {
  allowed: boolean;
  reason?: string;
}

/**
 * Invariants:
 * 1. Lira/Rhythm must NOT place the order (actor must be 'Rohan').
 * 2. Order cannot be placed before handoff (status must be 'ready_for_order').
 * 3. Basket cannot be empty.
 */
export function canPlaceOrder(
  state: BasketHandoffState,
  actor: "Lira" | "Rhythm" | "Rohan",
  itemsCount: number
): CanPlaceOrderResult {
  if (actor === "Lira" || actor === "Rhythm") {
    return {
      allowed: false,
      reason: `${actor} cannot place the order. ${actor} hands off the basket to Rohan to place the order.`
    };
  }

  if (itemsCount === 0) {
    return {
      allowed: false,
      reason: "Basket is empty. Add items before ordering."
    };
  }

  if (state.status !== "ready_for_order") {
    if (state.status === "building") {
      return {
        allowed: false,
        reason: "Lira is still building the basket. Awaiting Lira’s handoff ('I’m done. Please proceed with order.')."
      };
    }
    if (state.status === "ordered") {
      return {
        allowed: false,
        reason: "Current basket has already been ordered."
      };
    }
    return {
      allowed: false,
      reason: "Basket has not been handed off for ordering."
    };
  }

  return { allowed: true };
}

/**
 * Executes placing the order. Enforces all gate invariants.
 */
export function executePlaceOrder(
  state: BasketHandoffState,
  actor: "Lira" | "Rhythm" | "Rohan",
  itemsCount: number
): { success: boolean; nextState: BasketHandoffState; error?: string } {
  const check = canPlaceOrder(state, actor, itemsCount);
  if (!check.allowed) {
    return {
      success: false,
      error: check.reason,
      nextState: state
    };
  }

  const nowIso = new Date().toISOString();
  return {
    success: true,
    nextState: {
      status: "ordered",
      handoffMessage: state.handoffMessage,
      handoffAt: state.handoffAt,
      orderedAt: nowIso,
      orderedBy: "Rohan",
      lastRunSummary: {
        itemCount: itemsCount,
        orderedAt: nowIso
      }
    }
  };
}

/**
 * Reset back to idle for starting a fresh basket.
 */
export function resetBasketState(): BasketHandoffState {
  return {
    status: "idle",
    handoffMessage: null,
    handoffAt: null,
    orderedAt: null,
    orderedBy: null,
    lastRunSummary: null
  };
}

export interface AutonomousRecommendation {
  name: string;
  reason: string;
  category: string;
}

/**
 * Autonomously selects items Lira thinks are needed based on:
 * 1. Missing companion items for currently selected items
 * 2. Overdue staples / top frequency staples not yet in basket
 */
export function getLiraAutonomousRecommendations(
  currentItems: GroceryItem[],
  limit: number = 6,
  activeOrders?: HouseholdOrder[],
  ordersHistory?: HouseholdOrder[]
): AutonomousRecommendation[] {
  return itemCatalog.getAutonomousRecommendations(
    currentItems,
    limit,
    activeOrders,
    ordersHistory
  );
}
