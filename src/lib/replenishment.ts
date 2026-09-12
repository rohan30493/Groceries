import { HouseholdOrder } from "./orderLifecycle";
import { getDefaultHistoricalOrders } from "./purchaseMemory";
import { toCanonicalItemName, formatOrderRecency } from "./orderRecency";
import { parseQuantityAndCleanName } from "./orderLifecycle";

export type ReplenishmentStatus =
  | "DUE_NOW"
  | "APPROACHING_DUE"
  | "NOT_DUE"
  | "INSUFFICIENT_HISTORY";

export interface ItemCadenceInfo {
  canonicalName: string;
  lastDeliveredDate: string | null;
  daysSinceLastDelivery: number | null;
  typicalReorderDays: number | null;
  daysUntilDue: number | null;
  replenishmentStatus: ReplenishmentStatus;
  purchaseCount: number;
  intervals: number[];
  uiCadenceText: string | null;
  uiDueText: string | null;
}

/**
 * Calculates the median of an array of numbers.
 * Handles both odd and even lengths, rounding even midpoints to integer days.
 */
export function calculateMedian(numbers: number[]): number | null {
  if (!numbers || numbers.length === 0) return null;
  const sorted = [...numbers].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 !== 0) {
    return sorted[mid];
  }
  return Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

/**
 * Calculates the difference in whole calendar days between a past date and a reference date (now).
 */
export function getCalendarDayDiff(
  targetDate: Date | string,
  referenceDate: Date = new Date()
): number {
  const d = new Date(targetDate);
  if (isNaN(d.getTime())) return 0;

  const refMidnight = new Date(
    referenceDate.getFullYear(),
    referenceDate.getMonth(),
    referenceDate.getDate()
  ).getTime();

  const dMidnight = new Date(
    d.getFullYear(),
    d.getMonth(),
    d.getDate()
  ).getTime();

  return Math.max(0, Math.round((refMidnight - dMidnight) / (1000 * 60 * 60 * 24)));
}

/**
 * Minimum number of distinct delivered purchase dates required before establishing a cadence.
 * Requires at least 3 distinct purchase dates (giving at least 2 distinct intervals)
 * to ensure statistical median stability without fabricating a cadence.
 */
export const MIN_PURCHASES_FOR_CADENCE = 3;

// Cached index of delivered purchase dates per order list (WeakMap keyed by order array)
const ORDER_DELIVERED_INDEX_CACHE = new WeakMap<HouseholdOrder[], Map<string, Date[]>>();

function getOrBuildDeliveredIndex(orders: HouseholdOrder[]): Map<string, Date[]> {
  const cached = ORDER_DELIVERED_INDEX_CACHE.get(orders);
  if (cached) return cached;

  const index = new Map<string, Date[]>();
  for (const order of orders) {
    if (order.status === "CANCELLED") continue;

    const orderDateStr = order.placedAt || order.deliveredAt;
    if (!orderDateStr) continue;
    const orderDate = new Date(orderDateStr);
    if (isNaN(orderDate.getTime())) continue;

    for (const item of order.items || []) {
      if (item.status !== "DELIVERED") continue;

      const rawCanon = item.canonicalName || item.name || "";
      const resolvedCanon = toCanonicalItemName(rawCanon) || toCanonicalItemName(item.name) || rawCanon;
      const itemCanon = resolvedCanon.toLowerCase().trim();

      const itemDeliveredStr = item.deliveredAt || order.deliveredAt || orderDateStr;
      const itemDate = new Date(itemDeliveredStr);
      if (!isNaN(itemDate.getTime())) {
        let list = index.get(itemCanon);
        if (!list) {
          list = [];
          index.set(itemCanon, list);
        }
        list.push(itemDate);
      }
    }
  }

  ORDER_DELIVERED_INDEX_CACHE.set(orders, index);
  return index;
}

/**
 * Calculates cadence-aware replenishment intelligence for a canonical item
 * using delivered purchase history.
 *
 * @param itemName Canonical or raw item name
 * @param orders Historical orders (defaults to default historical orders)
 * @param now Reference timestamp (defaults to current time)
 */
export function calculateItemCadence(
  itemName: string,
  orders?: HouseholdOrder[],
  now: Date = new Date()
): ItemCadenceInfo {
  const ordersToUse = orders || getDefaultHistoricalOrders();
  const { cleanName } = parseQuantityAndCleanName(itemName);
  const canonical = toCanonicalItemName(cleanName) || cleanName;
  const targetKey = canonical.toLowerCase().trim();

  // 1. Gather all delivered purchase occurrences for this canonical item via index
  const index = getOrBuildDeliveredIndex(ordersToUse);
  const deliveredDates: Date[] = [];

  for (const [itemCanon, dates] of index.entries()) {
    if (
      itemCanon === targetKey ||
      itemCanon.includes(targetKey) ||
      targetKey.includes(itemCanon)
    ) {
      for (let i = 0; i < dates.length; i++) {
        deliveredDates.push(dates[i]);
      }
    }
  }

  // If never delivered
  if (deliveredDates.length === 0) {
    return {
      canonicalName: canonical,
      lastDeliveredDate: null,
      daysSinceLastDelivery: null,
      typicalReorderDays: null,
      daysUntilDue: null,
      replenishmentStatus: "INSUFFICIENT_HISTORY",
      purchaseCount: 0,
      intervals: [],
      uiCadenceText: null,
      uiDueText: null
    };
  }

  // Sort dates chronologically
  deliveredDates.sort((a, b) => a.getTime() - b.getTime());

  // Deduplicate same-day purchases (e.g. multiple packs in 1 run = 1 purchase event)
  const distinctDayDates: Date[] = [];
  const seenDays = new Set<string>();

  for (const d of deliveredDates) {
    const dayKey = `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
    if (!seenDays.has(dayKey)) {
      seenDays.add(dayKey);
      distinctDayDates.push(d);
    }
  }

  const latestDelivered = distinctDayDates[distinctDayDates.length - 1];
  const lastDeliveredIso = latestDelivered.toISOString();
  const daysSinceLastDelivery = getCalendarDayDiff(latestDelivered, now);

  // 2. Calculate intervals between consecutive purchase dates
  const intervals: number[] = [];
  for (let i = 1; i < distinctDayDates.length; i++) {
    const diff = Math.round(
      (distinctDayDates[i].getTime() - distinctDayDates[i - 1].getTime()) / (1000 * 60 * 60 * 24)
    );
    if (diff > 0) {
      intervals.push(diff);
    }
  }

  // 3. Check sufficient history threshold (>= 3 distinct purchase dates, >= 2 intervals)
  const hasSufficientHistory = distinctDayDates.length >= MIN_PURCHASES_FOR_CADENCE && intervals.length >= 2;

  const lastOrderedRelative = formatOrderRecency(latestDelivered, now) || `Last ordered ${daysSinceLastDelivery} days ago`;

  if (!hasSufficientHistory) {
    // Insufficient history: display "Last ordered X ago" ONLY, do NOT invent cadence or due date
    return {
      canonicalName: canonical,
      lastDeliveredDate: lastDeliveredIso,
      daysSinceLastDelivery,
      typicalReorderDays: null,
      daysUntilDue: null,
      replenishmentStatus: "INSUFFICIENT_HISTORY",
      purchaseCount: distinctDayDates.length,
      intervals,
      uiCadenceText: lastOrderedRelative,
      uiDueText: null
    };
  }

  // 4. Calculate MEDIAN interval to filter out outlier noise
  const medianInterval = calculateMedian(intervals) || 1;
  const daysUntilDue = medianInterval - daysSinceLastDelivery;

  // 5. Determine replenishment status
  let replenishmentStatus: ReplenishmentStatus;
  let uiDueText: string;

  if (daysUntilDue <= 0) {
    replenishmentStatus = "DUE_NOW";
    uiDueText = "Due now";
  } else if (daysUntilDue === 1) {
    replenishmentStatus = "APPROACHING_DUE";
    uiDueText = "Due tomorrow";
  } else if (daysUntilDue === 2) {
    replenishmentStatus = "APPROACHING_DUE";
    uiDueText = "Due in ~2 days";
  } else {
    replenishmentStatus = "NOT_DUE";
    uiDueText = `Due in ~${daysUntilDue} days`;
  }

  // 6. Format natural UI cadence text: e.g. "Last ordered 3 days ago · Usually every ~3 days"
  const uiCadenceText = `${lastOrderedRelative} · Usually every ~${medianInterval} days`;

  return {
    canonicalName: canonical,
    lastDeliveredDate: lastDeliveredIso,
    daysSinceLastDelivery,
    typicalReorderDays: medianInterval,
    daysUntilDue,
    replenishmentStatus,
    purchaseCount: distinctDayDates.length,
    intervals,
    uiCadenceText,
    uiDueText
  };
}

/**
 * Calculates a composite recommendation priority score for an item
 * combining co-occurrence / staple confidence with replenishment urgency.
 *
 * Ranking criteria:
 * 1. Currently due/overdue (DUE_NOW) -> Tier 1 (+3.0 score)
 * 2. Approaching due (APPROACHING_DUE) -> Tier 2 (+1.5 score)
 * 3. Strong historical association without cadence (INSUFFICIENT_HISTORY) -> Tier 3 (base confidence)
 * 4. Recently purchased / not yet due (NOT_DUE) -> Tier 4 (-2.0 penalty)
 */
export function calculateReplenishmentScore(
  cadence: ItemCadenceInfo,
  baseConfidence: number = 0.5
): number {
  switch (cadence.replenishmentStatus) {
    case "DUE_NOW":
      return 3.0 + baseConfidence;
    case "APPROACHING_DUE":
      return 1.5 + baseConfidence;
    case "INSUFFICIENT_HISTORY":
      return baseConfidence;
    case "NOT_DUE":
      // An item purchased yesterday with a 30-day cadence receives a heavy penalty
      // so it is not shown as due merely because of co-occurrence
      return -2.0 + (baseConfidence * 0.2);
    default:
      return baseConfidence;
  }
}
