import { GroceryItem } from "./patterns";
import { toCanonicalItemName } from "./orderRecency";

export type ItemLifecycleState =
  | "SUGGESTED"
  | "BASKET"
  | "ORDER_PLACED"
  | "DELIVERED"
  | "CANCELLED";

export type OrderStatus =
  | "ORDER_PLACED"
  | "DELIVERED"
  | "PARTIALLY_DELIVERED"
  | "CANCELLED";

export type OrderItemStatus =
  | "ORDER_PLACED"
  | "DELIVERED"
  | "CANCELLED";

export interface OrderLineItem {
  id: string;
  name: string;
  canonicalName: string;
  quantity: number;
  unit?: string;
  price?: number;
  total?: number;
  status: OrderItemStatus;
  deliveredAt?: string;
  category?: string;
}

export interface HouseholdOrder {
  orderId: string;
  orderCode?: string;
  platform: string;
  status: OrderStatus;
  placedAt: string;
  deliveredAt?: string;
  totalAmount: number;
  itemsCount: number;
  items: OrderLineItem[];
  orderedBy?: string;
}

/**
 * Computes an order's overall status based on its item-level outcomes.
 */
export function computeOrderStatus(items: OrderLineItem[]): OrderStatus {
  if (!items || items.length === 0) {
    return "ORDER_PLACED";
  }

  const allCancelled = items.every((it) => it.status === "CANCELLED");
  if (allCancelled) {
    return "CANCELLED";
  }

  const allDelivered = items.every((it) => it.status === "DELIVERED");
  if (allDelivered) {
    return "DELIVERED";
  }

  const anyOrderPlaced = items.some((it) => it.status === "ORDER_PLACED");
  if (anyOrderPlaced) {
    return "ORDER_PLACED";
  }

  const hasDelivered = items.some((it) => it.status === "DELIVERED");
  const hasCancelled = items.some((it) => it.status === "CANCELLED");
  if (hasDelivered && hasCancelled) {
    return "PARTIALLY_DELIVERED";
  }

  return "ORDER_PLACED";
}

/**
 * Normalizes raw order statuses from third-party platforms (Zepto, Swiggy, Handpickd)
 * into canonical OrderStatus.
 */
export function normalizeOrderStatus(rawStatus?: string): OrderStatus {
  if (!rawStatus) return "DELIVERED";
  const s = rawStatus.trim().toUpperCase();
  if (s === "CANCELLED" || s === "RETURN_TO_ORIGIN" || s === "FAILED") {
    return "CANCELLED";
  }
  if (s === "PARTIALLY_DELIVERED" || s === "PARTIAL") {
    return "PARTIALLY_DELIVERED";
  }
  if (s === "ORDER_PLACED" || s === "PLACED" || s === "PENDING" || s === "PROCESSING" || s === "SHIPPED") {
    return "ORDER_PLACED";
  }
  return "DELIVERED";
}

/**
 * Parses quantity from a grocery item name if present (e.g. "Milk ×2" or "2 packets milk").
 */
export function parseQuantityAndCleanName(rawName: string): { cleanName: string; quantity: number } {
  let name = rawName.trim();
  let quantity = 1;

  // Match e.g. "Milk x2" or "Milk ×2" or "Eggs x 12" or "Milk 2 packs" or "Milk 2 packets"
  const trailingMultiplier = name.match(/^(.*?)\s*(?:[×x*]\s*(\d+)|(\d+)\s*(?:packets?|packs?|pcs?|kg|litres?|l|boxes?|bottles?))$/i);
  if (trailingMultiplier) {
    name = trailingMultiplier[1].trim();
    quantity = parseInt(trailingMultiplier[2] || trailingMultiplier[3], 10) || 1;
  } else {
    // Match e.g. "2 packets of milk", "3 avocados"
    const leadingQty = name.match(/^(\d+)\s*(?:packets?|packs?|pcs?|kg|litres?|l)?\s*(?:of)?\s*(.+)$/i);
    if (leadingQty) {
      quantity = parseInt(leadingQty[1], 10) || 1;
      name = leadingQty[2].trim();
    }
  }

  return { cleanName: name, quantity: Math.max(1, quantity) };
}

/**
 * Creates a new HouseholdOrder from active basket items when Rohan places the order.
 */
export function createOrderFromBasket(
  basketItems: GroceryItem[],
  platform: string = "Zepto",
  orderedBy: string = "Rohan"
): HouseholdOrder {
  const nowIso = new Date().toISOString();
  const orderId = `ord-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;

  const lineItems: OrderLineItem[] = basketItems.map((item, index) => {
    const { cleanName, quantity } = parseQuantityAndCleanName(item.name);
    const canonical = toCanonicalItemName(cleanName) || cleanName;

    return {
      id: item.id || `item-${orderId}-${index + 1}`,
      name: item.name,
      canonicalName: canonical,
      quantity: quantity,
      category: item.category,
      status: "ORDER_PLACED"
    };
  });

  return {
    orderId,
    orderCode: `ORD-${orderId.slice(-6).toUpperCase()}`,
    platform,
    status: "ORDER_PLACED",
    placedAt: nowIso,
    totalAmount: 0,
    itemsCount: lineItems.length,
    items: lineItems,
    orderedBy
  };
}

/**
 * Updates the outcome of a specific line item in an order (e.g. For partially delivered orders).
 */
export function updateOrderItemOutcome(
  order: HouseholdOrder,
  lineItemIdOrCanonical: string,
  newOutcome: OrderItemStatus
): HouseholdOrder {
  const target = lineItemIdOrCanonical.toLowerCase().trim();
  const { cleanName: targetClean } = parseQuantityAndCleanName(target);
  const targetCanonical = (toCanonicalItemName(targetClean) || targetClean).toLowerCase();
  const nowIso = new Date().toISOString();

  const updatedItems = order.items.map((it) => {
    const itCanon = (it.canonicalName || "").toLowerCase();
    const itName = (it.name || "").toLowerCase();

    const match =
      it.id === lineItemIdOrCanonical ||
      itCanon === target ||
      itCanon === targetCanonical ||
      itName === target ||
      itCanon.includes(target) ||
      target.includes(itCanon) ||
      itName.includes(target);

    if (match) {
      return {
        ...it,
        status: newOutcome,
        deliveredAt: newOutcome === "DELIVERED" ? nowIso : undefined
      };
    }
    return it;
  });

  const nextStatus = computeOrderStatus(updatedItems);
  return {
    ...order,
    items: updatedItems,
    status: nextStatus,
    deliveredAt: nextStatus === "DELIVERED" ? nowIso : order.deliveredAt
  };
}

/**
 * Transitions the entire order status (and cascades to line items if transitioning to DELIVERED or CANCELLED).
 */
export function updateOrderStatus(
  order: HouseholdOrder,
  newStatus: OrderStatus
): HouseholdOrder {
  const nowIso = new Date().toISOString();

  let nextItems = order.items;
  if (newStatus === "DELIVERED") {
    nextItems = order.items.map((it) => ({
      ...it,
      status: "DELIVERED",
      deliveredAt: it.deliveredAt || nowIso
    }));
  } else if (newStatus === "CANCELLED") {
    nextItems = order.items.map((it) => ({
      ...it,
      status: "CANCELLED",
      deliveredAt: undefined
    }));
  }

  return {
    ...order,
    status: newStatus,
    deliveredAt: newStatus === "DELIVERED" ? (order.deliveredAt || nowIso) : order.deliveredAt,
    items: nextItems
  };
}

/**
 * Records an individual item to a HouseholdOrder list, grouping with any recent order
 * within a time window (e.g. 30 minutes) or creating a new order.
 */
export function recordItemToOrders(
  orders: HouseholdOrder[],
  item: GroceryItem,
  orderedBy: string = "Rohan",
  windowMs: number = 30 * 60 * 1000
): { updatedOrders: HouseholdOrder[]; modifiedOrder: HouseholdOrder } {
  const nowIso = new Date().toISOString();
  const nowMs = Date.now();
  const { cleanName, quantity } = parseQuantityAndCleanName(item.name);
  const canonical = toCanonicalItemName(cleanName) || cleanName;

  const lineItem: OrderLineItem = {
    id: item.id || `item-${Date.now()}`,
    name: item.name,
    canonicalName: canonical,
    quantity: quantity,
    category: item.category,
    status: "DELIVERED",
    deliveredAt: nowIso
  };

  const recentIndex = orders.findIndex((ord) => {
    if (ord.platform !== "HOUSEHOLD_APP" && ord.platform !== "Zepto") return false;
    const orderTime = new Date(ord.placedAt).getTime();
    if (isNaN(orderTime)) return false;
    return nowMs - orderTime <= windowMs;
  });

  if (recentIndex >= 0) {
    const existing = orders[recentIndex];
    const exists = existing.items.some(
      (it) => it.id === item.id || it.canonicalName.toLowerCase() === canonical.toLowerCase()
    );
    const nextItems = exists
      ? existing.items.map((it) =>
          it.id === item.id || it.canonicalName.toLowerCase() === canonical.toLowerCase()
            ? { ...it, status: "DELIVERED" as OrderItemStatus, deliveredAt: nowIso }
            : it
        )
      : [...existing.items, lineItem];

    const modifiedOrder: HouseholdOrder = {
      ...existing,
      items: nextItems,
      itemsCount: nextItems.length,
      status: "DELIVERED",
      deliveredAt: nowIso
    };

    const updatedOrders = orders.map((o, idx) => (idx === recentIndex ? modifiedOrder : o));
    return { updatedOrders, modifiedOrder };
  } else {
    const orderId = `ord-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const modifiedOrder: HouseholdOrder = {
      orderId,
      orderCode: `ORD-${orderId.slice(-6).toUpperCase()}`,
      platform: "HOUSEHOLD_APP",
      status: "DELIVERED",
      placedAt: nowIso,
      deliveredAt: nowIso,
      totalAmount: 0,
      itemsCount: 1,
      items: [lineItem],
      orderedBy
    };
    const updatedOrders = [modifiedOrder, ...orders];
    return { updatedOrders, modifiedOrder };
  }
}
