import { GroceryItem, patternRules, detectCategory, getMissingItemSuggestions } from "./patterns";
import { HouseholdOrder } from "./orderLifecycle";
import { isItemInActiveOrder } from "./purchaseMemory";
import { calculateItemCadence, calculateReplenishmentScore } from "./replenishment";

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
 * 1. Lira must NOT place the order (actor must be 'Rohan').
 * 2. Order cannot be placed before Lira hands off (status must be 'ready_for_order').
 * 3. Basket cannot be empty.
 */
export function canPlaceOrder(
  state: BasketHandoffState,
  actor: "Lira" | "Rohan",
  itemsCount: number
): CanPlaceOrderResult {
  if (actor === "Lira") {
    return {
      allowed: false,
      reason: "Lira cannot place the order. Lira hands off the basket to Rohan to place the order."
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
  actor: "Lira" | "Rohan",
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
  const currentItemNames = currentItems
    .filter((it) => !it.isDone && !it.isOrdered)
    .map((it) => it.name.toLowerCase().trim());
  const existingSet = new Set(currentItemNames);

  // Set of items already ordered by user within recent retention
  const orderedSet = new Set(
    currentItems
      .filter((it) => !it.isDone && it.isOrdered)
      .map((it) => it.name.toLowerCase().trim())
  );

  const isAlreadyInBasket = (candidate: string) => {
    const cLower = candidate.toLowerCase().trim();
    for (const inList of existingSet) {
      if (inList.includes(cLower) || cLower.includes(inList)) {
        return true;
      }
    }
    return false;
  };

  const isAlreadyOrdered = (candidate: string) => {
    const cLower = candidate.toLowerCase().trim();
    for (const orderedItem of orderedSet) {
      if (orderedItem.includes(cLower) || cLower.includes(orderedItem)) {
        return true;
      }
    }
    return false;
  };

  const isAlreadyInActiveOrder = (candidate: string) => {
    if (!activeOrders || activeOrders.length === 0) return false;
    return isItemInActiveOrder(candidate, activeOrders);
  };

  const isExcluded = (candidate: string) => {
    return isAlreadyInBasket(candidate) || isAlreadyOrdered(candidate) || isAlreadyInActiveOrder(candidate);
  };

  interface ScoredCandidate {
    name: string;
    reason: string;
    category: string;
    score: number;
  }

  const candidateMap = new Map<string, ScoredCandidate>();

  // 1. Check companion suggestions for current basket items (already cadence-ranked)
  if (currentItems.length > 0) {
    const rawSuggestions = getMissingItemSuggestions(
      currentItems.filter((it) => !it.isDone && !it.isOrdered).map((it) => it.name),
      null,
      ordersHistory,
      activeOrders,
      Array.from(orderedSet)
    );
    for (const sug of rawSuggestions) {
      const key = sug.item.toLowerCase().trim();
      if (!isExcluded(sug.item) && !candidateMap.has(key)) {
        candidateMap.set(key, {
          name: sug.item,
          reason: sug.reason,
          category: detectCategory(sug.item),
          score: sug.confidence
        });
      }
    }
  }

  // 2. Add top household essentials evaluated with cadence replenishment
  const staples = patternRules.top_staples || [];
  for (const staple of staples) {
    const key = staple.name.toLowerCase().trim();
    if (!isExcluded(staple.name) && !candidateMap.has(key)) {
      const stapleCadence = calculateItemCadence(staple.name, ordersHistory);
      const stapleScore = calculateReplenishmentScore(stapleCadence, 0.5);

      let reason = `High-frequency household staple (ordered ${staple.count}x)`;
      if (stapleCadence.replenishmentStatus === "DUE_NOW") {
        reason = `Due for replenishment (usually every ~${stapleCadence.typicalReorderDays} days)`;
      } else if (stapleCadence.replenishmentStatus === "APPROACHING_DUE") {
        reason = `Approaching replenishment (${stapleCadence.uiDueText || "soon"})`;
      }

      candidateMap.set(key, {
        name: staple.name,
        reason,
        category: detectCategory(staple.name),
        score: stapleScore
      });
    }
  }

  // 3. Ensure pet essentials are proactively evaluated
  if (
    !isExcluded("Cat Food") &&
    !isExcluded("Sheba") &&
    !candidateMap.has("cat food")
  ) {
    const petCadence = calculateItemCadence("Cat Food", ordersHistory);
    const petScore = calculateReplenishmentScore(petCadence, 0.65);

    let reason = "Cat food routine check for Samba & Milo";
    if (petCadence.replenishmentStatus === "DUE_NOW") {
      reason = "Cat food is due for replenishment for Samba & Milo";
    }

    candidateMap.set("cat food", {
      name: "Cat Food",
      reason,
      category: "Pet Care & Household",
      score: petScore
    });
  }

  // Sort candidates by replenishment-adjusted score descending
  const sorted = Array.from(candidateMap.values()).sort((a, b) => b.score - a.score);

  return sorted.slice(0, limit).map(({ name, reason, category }) => ({
    name,
    reason,
    category
  }));
}
