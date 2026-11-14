import { itemCatalog } from "./itemCatalog";
import { CANONICAL_MATCH_RULES, matchCanonicalName } from "./canonicalRules";
import { HouseholdOrder, OrderLineItem } from "./orderLifecycle";

export interface OrderItem {
  name: string;
  quantity?: number;
  price?: number;
  [key: string]: unknown;
}

export interface HistoricalOrder {
  order_id?: string;
  orderId?: string;
  id?: string;
  status?: string;
  placed_at?: string;
  placedAt?: string;
  order_date?: string;
  delivery_date?: string;
  delivered_at?: string;
  deliveredAt?: string;
  created_at?: string;
  items?: Array<OrderItem | OrderLineItem>;
  [key: string]: unknown;
}

export { CANONICAL_MATCH_RULES };

const CANONICAL_NAMES_SET = new Set(
  CANONICAL_MATCH_RULES.map(([canon]) => canon.toLowerCase())
);

/**
 * Maps any variant/brand or raw item name to its normalized canonical identity.
 */
export function toCanonicalItemName(rawName: string): string | null {
  return matchCanonicalName(rawName);
}

/**
 * Checks whether an order is a valid delivered/completed order.
 * Ignores cancelled, returned, or failed orders.
 */
export type AnyOrder = HistoricalOrder | HouseholdOrder;

export function isValidDeliveredOrder(order: AnyOrder): boolean {
  if (!order) return false;
  if (!order.status) return true;
  const s = order.status.toUpperCase();
  if (s === "CANCELLED" || s === "RETURN_TO_ORIGIN" || s === "FAILED") {
    return false;
  }
  return true;
}

/**
 * Extracts a valid ISO date or timestamp string from an order record.
 */
export function extractOrderDate(order: AnyOrder): string | null {
  const d =
    ("placed_at" in order && order.placed_at) ||
    order.placedAt ||
    ("order_date" in order && order.order_date) ||
    ("delivery_date" in order && order.delivery_date) ||
    ("delivered_at" in order && order.delivered_at) ||
    order.deliveredAt ||
    ("created_at" in order && order.created_at);
  return d || null;
}

/**
 * Formats order recency into a human-friendly relative time string.
 *
 * Examples:
 * - "Last ordered today"
 * - "Last ordered yesterday"
 * - "Last ordered 3 days ago"
 * - "Last ordered 9 days ago"
 * - "Last ordered 2 weeks ago"
 * - "Last ordered 2 months ago"
 * - "Last ordered 1 year ago"
 *
 * Avoids misleading precision (no decimals, hours, or seconds).
 */
export function formatOrderRecency(
  orderDateInput: string | Date | number,
  nowInput: Date = new Date()
): string | null {
  const orderDate = new Date(orderDateInput);
  if (isNaN(orderDate.getTime())) {
    return null;
  }

  const startOfNow = new Date(
    nowInput.getFullYear(),
    nowInput.getMonth(),
    nowInput.getDate()
  ).getTime();

  const startOfOrder = new Date(
    orderDate.getFullYear(),
    orderDate.getMonth(),
    orderDate.getDate()
  ).getTime();

  const diffDays = Math.round(
    (startOfNow - startOfOrder) / (1000 * 60 * 60 * 24)
  );

  if (diffDays <= 0) {
    return "Last ordered today";
  }
  if (diffDays === 1) {
    return "Last ordered yesterday";
  }
  if (diffDays < 14) {
    return `Last ordered ${diffDays} days ago`;
  }
  if (diffDays < 30) {
    const weeks = Math.round(diffDays / 7);
    return `Last ordered ${weeks} ${weeks === 1 ? "week" : "weeks"} ago`;
  }
  if (diffDays < 365) {
    const months = Math.round(diffDays / 30.4375);
    const displayMonths = Math.max(1, months);
    return `Last ordered ${displayMonths} ${displayMonths === 1 ? "month" : "months"} ago`;
  }

  const years = Math.round(diffDays / 365.25);
  const displayYears = Math.max(1, years);
  return `Last ordered ${displayYears} ${displayYears === 1 ? "year" : "years"} ago`;
}

let PRECOMPUTED_LATEST_DATES: Map<string, Date> | null = null;

function getPrecomputedDates(): Map<string, Date> {
  if (!PRECOMPUTED_LATEST_DATES) {
    PRECOMPUTED_LATEST_DATES = new Map();
    const defaultOrders =
      itemCatalog.getDefaultHistoricalOrders() as unknown as HistoricalOrder[];
    for (const order of defaultOrders) {
      if (!isValidDeliveredOrder(order)) continue;
      const dateStr = extractOrderDate(order);
      if (!dateStr) continue;
      const dateObj = new Date(dateStr);
      if (isNaN(dateObj.getTime())) continue;

      for (const it of order.items || []) {
        if (!it || !it.name) continue;
        const canon = toCanonicalItemName(it.name);
        if (!canon) continue;

        const existing = PRECOMPUTED_LATEST_DATES.get(canon);
        if (!existing || dateObj.getTime() > existing.getTime()) {
          PRECOMPUTED_LATEST_DATES.set(canon, dateObj);
        }
      }
    }
  }
  return PRECOMPUTED_LATEST_DATES;
}

/**
 * Calculates how long ago an item was last ordered from actual historical order data.
 *
 * @param itemName The item name (canonical or brand/variant)
 * @param orders Optional order array (defaults to actual historical orders)
 * @param now Optional reference date (defaults to current time)
 * @returns Human-friendly relative time (e.g. "Last ordered 9 days ago"), or null if no valid order history exists.
 */
export function calculateItemLastOrdered(
  itemName: string,
  orders?: Array<HistoricalOrder | HouseholdOrder>,
  now: Date = new Date()
): string | null {
  const canon = toCanonicalItemName(itemName);
  if (!canon) return null;

  // If custom orders list is provided (e.g. in tests)
  if (orders) {
    let latestDate: Date | null = null;

    for (const order of orders) {
      if (!isValidDeliveredOrder(order)) continue;
      const dateStr = extractOrderDate(order);
      if (!dateStr) continue;
      const dateObj = new Date(dateStr);
      if (isNaN(dateObj.getTime())) continue;

      for (const it of order.items || []) {
        if (!it || !it.name) continue;
        const itCanon = toCanonicalItemName(it.name);
        if (itCanon === canon) {
          if (!latestDate || dateObj.getTime() > latestDate.getTime()) {
            latestDate = dateObj;
          }
        }
      }
    }

    if (!latestDate) return null;
    return formatOrderRecency(latestDate, now);
  }

  // Fast precomputed lookup for default historical orders
  const latest = getPrecomputedDates().get(canon);
  if (!latest) return null;
  return formatOrderRecency(latest, now);
}
