import { HouseholdOrder, OrderLineItem, OrderItemStatus, OrderStatus, normalizeOrderStatus, parseQuantityAndCleanName } from "./orderLifecycle";
import { toCanonicalItemName } from "./orderRecency";
import unifiedOrdersRaw from "../../data/unified_orders.json";

export interface RecentPurchaseRecord {
  orderId: string;
  orderDate: string;
  platform: string;
  rawName: string;
  quantity: number;
  price?: number;
  itemStatus: OrderItemStatus;
  orderStatus: OrderStatus;
}

export interface CanonicalItemPurchaseMemory {
  canonicalName: string;
  lastOrderedDate: string | null;
  lastDeliveredDate: string | null;
  historicalOrderCount: number;
  historicalDeliveredCount: number;
  historicalQuantity: number; // total quantity actually delivered
  recentPurchases: RecentPurchaseRecord[];
  mostRecentOrderResultedInDelivery: boolean | null;
  cadenceDays?: number | null;
}

/**
 * Normalizes legacy or raw orders (e.g. From unified_orders.json or Supabase) into the structured HouseholdOrder model.
 */
export function normalizeRawOrder(rawOrder: any): HouseholdOrder {
  const orderId = String(rawOrder.order_id || rawOrder.id || `ord-${Math.random().toString(36).slice(2, 8)}`);
  const platform = rawOrder.platform || "Zepto";
  const status = normalizeOrderStatus(rawOrder.status);
  const placedAt = rawOrder.placed_at || rawOrder.order_date || rawOrder.delivery_date || rawOrder.delivered_at || rawOrder.created_at || new Date().toISOString();
  const totalAmount = Number(rawOrder.total_amount || 0);

  const items: OrderLineItem[] = (rawOrder.items || []).map((it: any, idx: number) => {
    const rawName = it.name || it.product_name || "Unknown Item";
    const { cleanName, quantity: parsedQty } = parseQuantityAndCleanName(rawName);
    const quantity = Number(it.quantity || parsedQty || 1);
    const canonical = it.canonical_name || toCanonicalItemName(cleanName) || cleanName;

    // Determine line item outcome
    let itemStatus: OrderItemStatus = "DELIVERED";
    if (it.status) {
      const s = String(it.status).toUpperCase();
      if (s === "CANCELLED" || s === "REFUNDED" || s === "FAILED") itemStatus = "CANCELLED";
      else if (s === "ORDER_PLACED" || s === "PENDING") itemStatus = "ORDER_PLACED";
      else itemStatus = "DELIVERED";
    } else {
      // Default to order-level outcome
      if (status === "CANCELLED") itemStatus = "CANCELLED";
      else if (status === "ORDER_PLACED") itemStatus = "ORDER_PLACED";
      else itemStatus = "DELIVERED";
    }

    return {
      id: it.id || `line-${orderId}-${idx}`,
      name: rawName,
      canonicalName: canonical,
      quantity,
      unit: it.pack_size || it.unit,
      price: it.price ? Number(it.price) : undefined,
      total: it.total ? Number(it.total) : undefined,
      status: itemStatus,
      deliveredAt: itemStatus === "DELIVERED" ? (rawOrder.delivered_at || placedAt) : undefined,
      category: it.category
    };
  });

  return {
    orderId,
    orderCode: rawOrder.order_code,
    platform,
    status,
    placedAt,
    deliveredAt: status === "DELIVERED" ? (rawOrder.delivered_at || placedAt) : undefined,
    totalAmount,
    itemsCount: items.length,
    items,
    orderedBy: rawOrder.ordered_by || (rawOrder.platform === "HOUSEHOLD_APP" ? "Rohan" : undefined)
  };
}

/**
 * Returns all active orders (orders that have been placed but are not yet delivered or cancelled).
 */
export function getActiveOrders(orders: HouseholdOrder[]): HouseholdOrder[] {
  return orders.filter((o) => o.status === "ORDER_PLACED");
}

/**
 * Returns all items in currently active orders.
 */
export function getActiveOrderItems(orders: HouseholdOrder[]): OrderLineItem[] {
  const active = getActiveOrders(orders);
  return active.flatMap((o) => o.items.filter((it) => it.status === "ORDER_PLACED"));
}

/**
 * Checks if a candidate item (raw or canonical name) is currently in an active order.
 */
export function isItemInActiveOrder(
  candidateName: string,
  orders: HouseholdOrder[]
): boolean {
  if (!candidateName || !candidateName.trim()) return false;
  const { cleanName } = parseQuantityAndCleanName(candidateName);
  const targetCanonical = (toCanonicalItemName(cleanName) || cleanName).toLowerCase().trim();

  const activeItems = getActiveOrderItems(orders);
  for (const it of activeItems) {
    const itCanon = (it.canonicalName || toCanonicalItemName(it.name) || it.name).toLowerCase().trim();
    if (itCanon === targetCanonical) return true;
    if (itCanon.includes(targetCanonical) || targetCanonical.includes(itCanon)) return true;
  }

  return false;
}

/**
 * Checks if an item is currently in the active basket.
 */
export function isItemInBasket(
  candidateName: string,
  basketItems: Array<{ name: string }>
): boolean {
  if (!candidateName || !candidateName.trim() || !basketItems) return false;
  const { cleanName } = parseQuantityAndCleanName(candidateName);
  const targetCanonical = (toCanonicalItemName(cleanName) || cleanName).toLowerCase().trim();

  for (const item of basketItems) {
    const { cleanName: itemClean } = parseQuantityAndCleanName(item.name);
    const itCanon = (toCanonicalItemName(itemClean) || itemClean).toLowerCase().trim();
    if (itCanon === targetCanonical) return true;
    if (itCanon.includes(targetCanonical) || targetCanonical.includes(itCanon)) return true;
  }

  return false;
}

/**
 * Gets all line items that were actually delivered across all orders.
 * Ignores suggested, basket, active (ORDER_PLACED), and cancelled items.
 */
export function getDeliveredPurchases(orders: HouseholdOrder[]): OrderLineItem[] {
  const deliveredList: OrderLineItem[] = [];
  for (const order of orders) {
    if (order.status === "CANCELLED") continue;
    for (const it of order.items) {
      if (it.status === "DELIVERED") {
        deliveredList.push(it);
      }
    }
  }
  return deliveredList;
}

/**
 * Builds Lira's purchase memory across all historical and active orders.
 *
 * Distinguishes:
 * - items suggested / in basket (NOT in orders -> NOT in purchase memory)
 * - items in active order (status === "ORDER_PLACED" -> recorded as ordered, but NOT delivered)
 * - items actually delivered (status === "DELIVERED" -> recorded as purchased/delivered)
 * - items cancelled (status === "CANCELLED" -> NOT counted as delivered/purchased)
 */
export function buildPurchaseMemory(
  orders: HouseholdOrder[]
): Map<string, CanonicalItemPurchaseMemory> {
  const memoryMap = new Map<string, CanonicalItemPurchaseMemory>();

  // Sort orders chronologically (oldest to newest) to process history in order
  const sortedOrders = [...orders].sort((a, b) => {
    const tA = new Date(a.placedAt).getTime() || 0;
    const tB = new Date(b.placedAt).getTime() || 0;
    return tA - tB;
  });

  for (const order of sortedOrders) {
    const orderDate = order.placedAt;

    for (const item of order.items) {
      const canonical = item.canonicalName || toCanonicalItemName(item.name) || item.name;
      const key = canonical.toLowerCase().trim();

      let record = memoryMap.get(key);
      if (!record) {
        record = {
          canonicalName: canonical,
          lastOrderedDate: null,
          lastDeliveredDate: null,
          historicalOrderCount: 0,
          historicalDeliveredCount: 0,
          historicalQuantity: 0,
          recentPurchases: [],
          mostRecentOrderResultedInDelivery: null
        };
        memoryMap.set(key, record);
      }

      // Record this order occurrence
      record.lastOrderedDate = orderDate;
      record.historicalOrderCount += 1;

      // Check item-level outcome
      if (item.status === "DELIVERED") {
        record.lastDeliveredDate = item.deliveredAt || order.deliveredAt || orderDate;
        record.historicalDeliveredCount += 1;
        record.historicalQuantity += (item.quantity || 1);
        record.mostRecentOrderResultedInDelivery = true;

        record.recentPurchases.unshift({
          orderId: order.orderId,
          orderDate,
          platform: order.platform,
          rawName: item.name,
          quantity: item.quantity || 1,
          price: item.price,
          itemStatus: "DELIVERED",
          orderStatus: order.status
        });
      } else if (item.status === "CANCELLED") {
        record.mostRecentOrderResultedInDelivery = false;
      } else if (item.status === "ORDER_PLACED") {
        // Active order in flight; has not resulted in delivery yet
        record.mostRecentOrderResultedInDelivery = false;
      }
    }
  }

  // Pre-calculate typical cadence if multiple delivered purchases exist
  for (const record of memoryMap.values()) {
    if (record.recentPurchases.length >= 2) {
      const dates = record.recentPurchases
        .map((p) => new Date(p.orderDate).getTime())
        .filter((t) => !isNaN(t))
        .sort((a, b) => b - a);

      if (dates.length >= 2) {
        let totalDiffDays = 0;
        let intervals = 0;
        for (let i = 0; i < dates.length - 1; i++) {
          const diffDays = Math.round((dates[i] - dates[i + 1]) / (1000 * 60 * 60 * 24));
          if (diffDays > 0) {
            totalDiffDays += diffDays;
            intervals++;
          }
        }
        if (intervals > 0) {
          record.cadenceDays = Math.round(totalDiffDays / intervals);
        }
      }
    }
  }

  return memoryMap;
}

/**
 * Queries purchase memory for a single item by raw or canonical name.
 */
export function getCanonicalPurchaseMemory(
  candidateName: string,
  orders: HouseholdOrder[]
): CanonicalItemPurchaseMemory | null {
  if (!candidateName || !candidateName.trim()) return null;
  const { cleanName } = parseQuantityAndCleanName(candidateName);
  const targetCanonical = (toCanonicalItemName(cleanName) || cleanName).toLowerCase().trim();

  const memory = buildPurchaseMemory(orders);

  // Exact match
  if (memory.has(targetCanonical)) {
    return memory.get(targetCanonical)!;
  }

  // Substring / fuzzy match
  for (const [key, mem] of memory.entries()) {
    if (key.includes(targetCanonical) || targetCanonical.includes(key)) {
      return mem;
    }
  }

  return null;
}

// Lazy cached default historical orders from unified_orders.json
let defaultHistoricalOrdersCache: HouseholdOrder[] | null = null;

export function getDefaultHistoricalOrders(): HouseholdOrder[] {
  if (!defaultHistoricalOrdersCache) {
    defaultHistoricalOrdersCache = (unifiedOrdersRaw as any[]).map(normalizeRawOrder);
  }
  return defaultHistoricalOrdersCache;
}
