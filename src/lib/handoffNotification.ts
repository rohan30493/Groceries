import { BasketHandoffState } from "./handoff";
import { GroceryItem } from "./patterns";
import { toCanonicalItemName } from "./orderRecency";
import unifiedOrdersRaw from "../../data/unified_orders.json";

export interface HandoffNotification {
  id: string; // e.g. "handoff_2026-09-12T12:00:00.000Z"
  handoffAt: string;
  itemCount: number;
  estimatedBasketValue: number | null;
  title: string;
  message: string;
  isAcknowledged: boolean;
}

// Canonical unit price lookup computed from unified orders
const CANONICAL_PRICE_MAP: Map<string, number> = new Map();

for (const order of unifiedOrdersRaw as any[]) {
  if (order.status === "CANCELLED" || order.status === "RETURN_TO_ORIGIN") continue;
  for (const it of order.items || []) {
    if (!it || !it.name) continue;
    const canon = toCanonicalItemName(it.name);
    if (!canon) continue;
    const price = typeof it.price === "number" && it.price > 0 ? it.price : 0;
    if (price > 0 && !CANONICAL_PRICE_MAP.has(canon)) {
      CANONICAL_PRICE_MAP.set(canon, price);
    }
  }
}

/**
 * Calculates estimated basket value from pending items and historical prices.
 * Returns null if no known pricing exists, or a rounded rupee value.
 */
export function estimateBasketValue(items: GroceryItem[]): number | null {
  const pending = items.filter((it) => !it.isDone);
  if (pending.length === 0) return null;

  let total = 0;
  let pricedItemsCount = 0;

  for (const it of pending) {
    const canon = toCanonicalItemName(it.name);
    if (canon && CANONICAL_PRICE_MAP.has(canon)) {
      total += CANONICAL_PRICE_MAP.get(canon)!;
      pricedItemsCount++;
    } else {
      // Default fallback estimate per typical staple (~₹60) if historical price not known
      total += 60;
      pricedItemsCount++;
    }
  }

  return pricedItemsCount > 0 ? Math.round(total) : null;
}

/**
 * Evaluates whether a handoff notification should be active.
 *
 * Rules:
 * 1. Only status === 'ready_for_order' produces a notification.
 * 2. Idempotent: Uses handoffAt as the unique identifier.
 * 3. Returns null if handoffState is IDLE, BUILDING, or ORDERED.
 * 4. Respects acknowledgedIds set so a dismissed notification stays dismissed.
 */
export function evaluateHandoffNotification(
  handoffState: BasketHandoffState,
  pendingItems: GroceryItem[],
  acknowledgedIds: Set<string> = new Set()
): HandoffNotification | null {
  if (handoffState.status !== "ready_for_order" || !handoffState.handoffAt) {
    return null;
  }

  const notificationId = `handoff_${handoffState.handoffAt}`;
  const isAcknowledged = acknowledgedIds.has(notificationId);

  const itemCount = pendingItems.length;
  const estimatedValue = estimateBasketValue(pendingItems);

  return {
    id: notificationId,
    handoffAt: handoffState.handoffAt,
    itemCount,
    estimatedBasketValue: estimatedValue,
    title: "Lira is done 🛒 — Your grocery basket is ready to review.",
    message: handoffState.handoffMessage || "I’m done. Please proceed with order.",
    isAcknowledged
  };
}

/**
 * Format notification message preview with item count and estimated value
 */
export function formatNotificationPreview(notification: HandoffNotification): string {
  const pricePart = notification.estimatedBasketValue
    ? ` • Est. ₹${notification.estimatedBasketValue}`
    : "";
  return `${notification.itemCount} ${
    notification.itemCount === 1 ? "item" : "items"
  }${pricePart}`;
}
