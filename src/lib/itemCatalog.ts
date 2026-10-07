import unifiedOrdersRaw from "../../data/unified_orders.json";
import patternRulesRaw from "../../data/pattern_rules.json";
import categorySectionsRaw from "../../data/category_sections.json";
import {
  HouseholdOrder,
  OrderLineItem,
  OrderItemStatus,
  OrderStatus,
  normalizeOrderStatus
} from "./orderLifecycle";

export interface ResolvedProduct {
  canonicalName: string;
  cleanName: string;
  quantity: number;
}

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
  historicalQuantity: number;
  recentPurchases: RecentPurchaseRecord[];
  mostRecentOrderResultedInDelivery: boolean | null;
  cadenceDays?: number | null;
}

export interface CompanionSuggestion {
  item: string;
  triggeredBy: string;
  reason: string;
  confidence: number;
  lastOrderedText?: string;
  cadenceText?: string | null;
  dueText?: string | null;
  replenishmentStatus?: ReplenishmentStatus;
  daysUntilDue?: number | null;
}

export interface AutonomousRecommendation {
  name: string;
  reason: string;
  category: string;
}

export const CANONICAL_MATCH_RULES: Array<[string, string[]]> = [
  // Produce
  ["Cherry Tomatoes", ["cherry tomato", "baby tomato"]],
  ["Tomatoes", ["tomato"]],
  ["Onions", ["onion", "pyaz", "eerulli", "shallot"]],
  ["Bananas", ["banana", "yelakki", "yellaki", "robusta"]],
  ["Potatoes", ["potato", "aloo", "batata"]],
  ["Cauliflower", ["cauliflower", "gobi"]],
  ["Carrots", ["carrot", "gajar"]],
  ["Cucumber", ["cucumber", "kheera", "kakdi"]],
  ["Palak / Spinach", ["palak", "spinach"]],
  ["Lemons", ["lemon", "nimbu", "lime"]],
  ["Coriander", ["coriander", "dhaniya", "dhania", "kothmir"]],
  ["Garlic", ["garlic", "lehsun", "lahsun"]],
  ["Apples", ["apple", "seb"]],
  ["Lettuce / Salad Leaves", ["lettuce", "salad leave", "iceberg", "romaine", "arugula"]],
  ["Ginger", ["ginger", "adrak"]],
  ["Capsicum", ["capsicum", "bell pepper", "shimla mirch"]],
  ["Cabbage", ["cabbage", "patta gobi"]],
  ["Lady Finger / Bhindi", ["lady finger", "bhindi", "bindi", "okra"]],
  ["Ridge Gourd / Tori", ["ridge gourd", "tori", "thori", "turai"]],
  ["Lauki / Bottle Gourd", ["bottle gourd", "lauki", "ghea", "doodhi"]],
  ["Broccoli", ["broccoli"]],
  ["Mushrooms", ["mushroom"]],
  ["Green Chillies", ["green chilli", "green chili", "hari mirch"]],
  ["French Beans", ["french bean", "haricot", "green beans"]],
  ["Pomegranate", ["pomegranate", "anar"]],
  ["Mandarin Orange", ["mandarin", "orange mini mandarin", "kinnow", "santra"]],
  ["Kiwi", ["kiwi"]],

  // Dairy, Bread & Eggs
  ["Fresh Paneer", ["paneer", "gowardhan", "malai paneer", "cottage cheese"]],
  ["Milk", ["milk", "nandini goodlife", "akshayakalpa", "heritage", "toned milk", "cow milk"]],
  ["Curd / Dahi", ["curd", "dahi"]],
  ["Eggs", ["egg", "eggs", "country egg", "white egg"]],
  ["Bread", ["bread", "whole wheat bread", "white bread", "multigrain", "pav", "burger bun"]],
  ["Butter", ["butter", "amul butter"]],
  ["Cheese Slices", ["cheese slice", "cheddar slice"]],
  ["Greek Yogurt / Epigamia", ["epigamia", "greek yogurt"]],

  // Atta, Rice, Oil & Dals
  ["Atta / Wheat Flour", ["atta", "aashirvaad atta", "wheat flour", "chakki atta"]],
  ["Basmati Rice", ["basmati", "daawat", "india gate", "biryani rice"]],
  ["Sona Masoori Rice", ["sona masoori", "raw rice", "boiled rice"]],
  ["Toor Dal", ["toor dal", "arhar dal", "tuvar"]],
  ["Moong Dal", ["moong dal", "yellow moong", "split moong"]],
  ["Chana Dal", ["chana dal", "bengal gram"]],
  ["Cooking Oil", ["oil", "fortune sunlite", "sunflower oil", "mustard oil", "groundnut oil", "olive oil", "ghee"]],
  ["Sugar", ["sugar", "cheeni", "shakar"]],
  ["Salt", ["salt", "tata salt", "namak"]],

  // Masalas & Spices
  ["Jeera / Cumin Seeds", ["jeera", "cumin"]],
  ["Turmeric / Haldi", ["haldi", "turmeric"]],
  ["Red Chilli Powder", ["red chilli powder", "lal mirch powder"]],
  ["Dhania / Coriander Powder", ["dhania powder", "coriander powder"]],
  ["Garam Masala", ["garam masala", "everest garam"]],
  ["Mustard Seeds / Rai", ["mustard seed", "rai", "sarson"]],

  // Tea, Coffee & Beverages
  ["Tea / Chai Patti", ["tea", "chai", "red label", "taj mahal", "tata tea"]],
  ["Coffee Powder", ["coffee", "nescafe", "bru", "instant coffee"]],
  ["Coconut Water", ["coconut water", "tender coconut", "raw pressery coconut"]],

  // Snacks & Munchies
  ["Biscuits / Cookies", ["biscuit", "cookie", "hide & seek", "bourbon", "marie light", "parle-g", "monaco", "krackjack", "good day"]],
  ["Makhana", ["makhana", "fox nut", "lotus seeds"]],
  ["Dry Fruits & Nuts", ["almond", "badam", "cashew", "kaju", "walnut", "akhrot", "raisin", "kishmish"]],
  ["Potato Chips", ["chips", "lays", "doritos", "bingo", "pringles"]],
  ["Instant Noodles", ["maggi", "noodles", "yippee"]],

  // Pet Care & Household Essentials
  ["Cat Food", ["cat food", "whiskas", "sheba", "purina", "felix", "drools cat", "royal canin", "cat treat"]],
  ["Cat Litter", ["cat litter", "bentonite", "tofu litter"]],
  ["Dishwash Liquid", ["dishwash", "vim", "pril", "exo"]],
  ["Detergent", ["detergent", "surf excel", "ariel", "tide", "liquid detergent", "front load", "top load"]],
  ["Toilet Cleaner", ["harpic", "toilet cleaner", "sanifresh"]],
  ["Garbage Bags", ["garbage bag", "trash bag", "dustbin cover"]],
  ["Kitchen Tissues / Paper Towels", ["kitchen towel", "kitchen roll", "tissue paper", "paper roll", "facial tissue"]]
];

export function calculateMedian(numbers: number[]): number | null {
  if (!numbers || numbers.length === 0) return null;
  const sorted = [...numbers].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 !== 0) {
    return sorted[mid];
  }
  return Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

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
 * Parses quantity indicators from item name and cleans the product name.
 */
export function parseQuantityAndCleanName(rawName: string): { cleanName: string; quantity: number } {
  if (!rawName) return { cleanName: "", quantity: 1 };

  let text = rawName.trim();
  let quantity = 1;

  // Patterns like "(Pack of 2)" or "Pack of 3"
  const packMatch = text.match(/pack\s+of\s+(\d+)/i);
  if (packMatch) {
    quantity = parseInt(packMatch[1], 10) || 1;
    text = text.replace(/pack\s+of\s+\d+/i, "").trim();
  }

  // Multiplier pattern like "x 2", "2x"
  const multiplierMatch = text.match(/(?:^|\s)x\s*(\d+)(?:\s|$)/i) || text.match(/(?:^|\s)(\d+)\s*x(?:\s|$)/i);
  if (multiplierMatch) {
    quantity = parseInt(multiplierMatch[1], 10) || quantity;
    text = text.replace(/(?:^|\s)x\s*\d+(?:\s|$)/i, " ").replace(/(?:^|\s)\d+\s*x(?:\s|$)/i, " ").trim();
  }

  // Remove trailing weight/volume descriptors for cleaner canonical matching (e.g., "500g", "1 kg", "200ml")
  const cleaned = text
    .replace(/\s*\(\s*\d+\s*(?:g|kg|gm|ml|l|ltr|pcs|piece|pieces|packs?)\s*\)/gi, "")
    .replace(/\s+-\s+\d+\s*(?:g|kg|gm|ml|l|ltr|pcs|piece|pieces|packs?)$/gi, "")
    .replace(/\s+/g, " ")
    .trim();

  return {
    cleanName: cleaned || rawName.trim(),
    quantity: Math.max(1, quantity)
  };
}

/**
 * Deep ItemCatalog Module.
 *
 * Single ingestion point for unified historical orders and catalog taxonomies.
 * Consolidates canonical resolution, alias matching, price observation,
 * cadence calculations, and recommendation intelligence.
 */
export class ItemCatalog {
  private canonicalMap: Map<string, string[]> = new Map();
  private defaultOrders: HouseholdOrder[] = [];
  private canonicalPriceMap: Map<string, number> = new Map();
  private patternRules: any;
  private categorySections: any[];

  constructor() {
    this.patternRules = patternRulesRaw;
    this.categorySections = categorySectionsRaw;
    this.initCanonicalMap();
    this.ingestUnifiedOrders();
  }

  private initCanonicalMap(): void {
    for (const [canonical, aliases] of CANONICAL_MATCH_RULES) {
      this.canonicalMap.set(canonical, aliases.map((a) => a.toLowerCase().trim()));
    }
  }

  private ingestUnifiedOrders(): void {
    const rawList = unifiedOrdersRaw as any[];
    this.defaultOrders = rawList.map((raw) => this.normalizeRawOrder(raw));

    for (const order of rawList) {
      if (order.status === "CANCELLED" || order.status === "RETURN_TO_ORIGIN") continue;
      for (const it of order.items || []) {
        if (!it || !it.name) continue;
        const resolved = this.resolve(it.name);
        if (!resolved.canonicalName) continue;
        const price = typeof it.price === "number" && it.price > 0 ? it.price : 0;
        if (price > 0 && !this.canonicalPriceMap.has(resolved.canonicalName)) {
          this.canonicalPriceMap.set(resolved.canonicalName, price);
        }
      }
    }
  }

  normalizeRawOrder(rawOrder: any): HouseholdOrder {
    const orderId = String(rawOrder.order_id || rawOrder.id || `ord-${Math.random().toString(36).slice(2, 8)}`);
    const platform = rawOrder.platform || "Zepto";
    const rawStatus = rawOrder.status;
    const placedAt =
      rawOrder.placed_at ||
      rawOrder.order_date ||
      rawOrder.delivery_date ||
      rawOrder.delivered_at ||
      rawOrder.created_at ||
      new Date().toISOString();
    const totalAmount = Number(rawOrder.total_amount || 0);

    const items: OrderLineItem[] = (rawOrder.items || []).map((it: any, idx: number) => {
      const rawName = it.name || it.product_name || "Unknown Item";
      const { cleanName, quantity: parsedQty } = parseQuantityAndCleanName(rawName);
      const quantity = Number(it.quantity || parsedQty || 1);
      const resolved = this.resolve(cleanName);
      const canonical = it.canonical_name || resolved.canonicalName || cleanName;

      let itemStatus: OrderItemStatus = "DELIVERED";
      if (it.status) {
        const s = String(it.status).toUpperCase();
        if (s === "CANCELLED" || s === "REFUNDED" || s === "FAILED") itemStatus = "CANCELLED";
        else if (s === "ORDER_PLACED" || s === "PENDING") itemStatus = "ORDER_PLACED";
        else itemStatus = "DELIVERED";
      } else if (rawStatus) {
        const parentStatus = normalizeOrderStatus(rawStatus);
        if (parentStatus === "CANCELLED") itemStatus = "CANCELLED";
        else if (parentStatus === "ORDER_PLACED") itemStatus = "ORDER_PLACED";
        else itemStatus = "DELIVERED";
      }

      return {
        id: String(it.id || `${orderId}-it-${idx}`),
        name: rawName,
        canonicalName: canonical,
        quantity,
        unit: it.unit || it.pack || undefined,
        price: it.price !== undefined ? Number(it.price) : undefined,
        total: it.total !== undefined ? Number(it.total) : undefined,
        status: itemStatus,
        deliveredAt: itemStatus === "DELIVERED" ? placedAt : undefined,
        category: it.category || undefined
      };
    });

    let status: OrderStatus = "DELIVERED";
    if (rawStatus) {
      status = normalizeOrderStatus(rawStatus);
    }

    return {
      orderId,
      orderCode: rawOrder.order_code || undefined,
      platform,
      status,
      placedAt,
      deliveredAt: status === "DELIVERED" ? placedAt : undefined,
      totalAmount,
      itemsCount: items.length,
      items,
      orderedBy: rawOrder.ordered_by || "Rohan"
    };
  }

  // --- Public Interface ---

  resolve(rawName: string): ResolvedProduct {
    if (!rawName || typeof rawName !== "string") {
      return { canonicalName: "", cleanName: "", quantity: 1 };
    }

    const { cleanName, quantity } = parseQuantityAndCleanName(rawName);
    const lowerClean = cleanName.toLowerCase().trim();

    for (const [canonical, aliases] of this.canonicalMap.entries()) {
      for (const alias of aliases) {
        if (lowerClean.includes(alias)) {
          return { canonicalName: canonical, cleanName, quantity };
        }
      }
    }

    return { canonicalName: cleanName, cleanName, quantity };
  }

  getPrice(itemName: string): number | null {
    const resolved = this.resolve(itemName);
    if (this.canonicalPriceMap.has(resolved.canonicalName)) {
      return this.canonicalPriceMap.get(resolved.canonicalName)!;
    }
    return 60; // Standard staple estimate fallback
  }

  getDefaultHistoricalOrders(): HouseholdOrder[] {
    return this.defaultOrders;
  }

  isItemInActiveOrder(itemName: string, activeOrders: HouseholdOrder[]): boolean {
    if (!activeOrders || activeOrders.length === 0) return false;
    const resolvedTarget = this.resolve(itemName).canonicalName.toLowerCase().trim();

    for (const order of activeOrders) {
      if (order.status !== "ORDER_PLACED") continue;
      for (const item of order.items || []) {
        if (item.status === "CANCELLED") continue;
        const canonItem = (item.canonicalName || this.resolve(item.name).canonicalName).toLowerCase().trim();
        if (canonItem === resolvedTarget || canonItem.includes(resolvedTarget) || resolvedTarget.includes(canonItem)) {
          return true;
        }
      }
    }
    return false;
  }

  getCadence(itemName: string, customOrders?: HouseholdOrder[]): ItemCadenceInfo {
    const resolved = this.resolve(itemName).canonicalName;
    const targetOrders = customOrders && customOrders.length > 0 ? customOrders : this.defaultOrders;

    const targetCanonical = resolved.toLowerCase().trim();
    const purchaseDates: Date[] = [];

    for (const order of targetOrders) {
      const parentStatus = (order.status || "").toUpperCase();
      if (parentStatus === "CANCELLED") continue;

      const orderDateStr = order.deliveredAt || order.placedAt;
      if (!orderDateStr) continue;
      const orderDate = new Date(orderDateStr);
      if (isNaN(orderDate.getTime())) continue;

      for (const it of order.items || []) {
        if (it.status !== "DELIVERED") continue;
        const itCanonical = (it.canonicalName || this.resolve(it.name).canonicalName).toLowerCase().trim();
        if (itCanonical === targetCanonical) {
          purchaseDates.push(orderDate);
          break;
        }
      }
    }

    const uniqueDates = Array.from(new Set(purchaseDates.map((d) => d.toISOString().split("T")[0])))
      .map((d) => new Date(d))
      .sort((a, b) => a.getTime() - b.getTime());

    const purchaseCount = uniqueDates.length;
    const lastDeliveredDate =
      uniqueDates.length > 0 ? uniqueDates[uniqueDates.length - 1].toISOString() : null;
    const daysSinceLastDelivery = lastDeliveredDate ? getCalendarDayDiff(lastDeliveredDate) : null;

    if (uniqueDates.length < 3) {
      return {
        canonicalName: resolved,
        lastDeliveredDate,
        daysSinceLastDelivery,
        typicalReorderDays: null,
        daysUntilDue: null,
        replenishmentStatus: "INSUFFICIENT_HISTORY",
        purchaseCount,
        intervals: [],
        uiCadenceText: null,
        uiDueText: null
      };
    }

    const intervals: number[] = [];
    for (let i = 1; i < uniqueDates.length; i++) {
      const diffDays = Math.round(
        (uniqueDates[i].getTime() - uniqueDates[i - 1].getTime()) / (1000 * 60 * 60 * 24)
      );
      if (diffDays > 0) intervals.push(diffDays);
    }

    const medianInterval = calculateMedian(intervals) || 7;
    const daysUntilDue = daysSinceLastDelivery !== null ? medianInterval - daysSinceLastDelivery : null;

    let replenishmentStatus: ReplenishmentStatus = "NOT_DUE";
    let uiDueText: string | null = null;

    if (daysUntilDue !== null) {
      if (daysUntilDue <= 0) {
        replenishmentStatus = "DUE_NOW";
        uiDueText = daysUntilDue === 0 ? "Due today" : `Overdue by ${Math.abs(daysUntilDue)}d`;
      } else if (daysUntilDue <= 2) {
        replenishmentStatus = "APPROACHING_DUE";
        uiDueText = `Due in ${daysUntilDue}d`;
      } else {
        replenishmentStatus = "NOT_DUE";
        uiDueText = `Due in ${daysUntilDue}d`;
      }
    }

    return {
      canonicalName: resolved,
      lastDeliveredDate,
      daysSinceLastDelivery,
      typicalReorderDays: medianInterval,
      daysUntilDue,
      replenishmentStatus,
      purchaseCount,
      intervals,
      uiCadenceText: `Every ~${medianInterval} days`,
      uiDueText
    };
  }

  getReplenishmentScore(cadence: ItemCadenceInfo, baseScore: number = 0.5): number {
    switch (cadence.replenishmentStatus) {
      case "DUE_NOW":
        return Math.min(1.0, baseScore + 0.45);
      case "APPROACHING_DUE":
        return Math.min(0.95, baseScore + 0.25);
      case "INSUFFICIENT_HISTORY":
        return baseScore;
      case "NOT_DUE":
        return Math.max(0.1, baseScore - 0.35);
      default:
        return baseScore;
    }
  }

  getRecency(itemName: string, customOrders?: HouseholdOrder[]): string | null {
    const cadence = this.getCadence(itemName, customOrders);
    if (!cadence.lastDeliveredDate || cadence.daysSinceLastDelivery === null) return null;
    const days = cadence.daysSinceLastDelivery;
    if (days === 0) return "Ordered today";
    if (days === 1) return "Ordered yesterday";
    return `Ordered ${days} days ago`;
  }

  getPurchaseMemory(itemName: string, customOrders?: HouseholdOrder[]): CanonicalItemPurchaseMemory | null {
    const resolved = this.resolve(itemName).canonicalName;
    const targetOrders = customOrders && customOrders.length > 0 ? customOrders : this.defaultOrders;
    const targetCanonical = resolved.toLowerCase().trim();

    const recentPurchases: RecentPurchaseRecord[] = [];
    let deliveredCount = 0;
    let totalQty = 0;
    let lastOrderedDate: string | null = null;
    let lastDeliveredDate: string | null = null;

    for (const order of targetOrders) {
      const orderDate = order.placedAt;
      for (const it of order.items || []) {
        const itCanon = (it.canonicalName || this.resolve(it.name).canonicalName).toLowerCase().trim();
        if (itCanon === targetCanonical || itCanon.includes(targetCanonical) || targetCanonical.includes(itCanon)) {
          if (!lastOrderedDate) lastOrderedDate = orderDate;
          if (it.status === "DELIVERED" && !lastDeliveredDate) lastDeliveredDate = orderDate;
          if (it.status === "DELIVERED") {
            deliveredCount++;
            totalQty += it.quantity;
          }
          recentPurchases.push({
            orderId: order.orderId,
            orderDate,
            platform: order.platform,
            rawName: it.name,
            quantity: it.quantity,
            price: it.price,
            itemStatus: it.status,
            orderStatus: order.status
          });
        }
      }
    }

    if (recentPurchases.length === 0) return null;

    return {
      canonicalName: resolved,
      lastOrderedDate,
      lastDeliveredDate,
      historicalOrderCount: recentPurchases.length,
      historicalDeliveredCount: deliveredCount,
      historicalQuantity: totalQty,
      recentPurchases,
      mostRecentOrderResultedInDelivery: recentPurchases[0]?.itemStatus === "DELIVERED",
      cadenceDays: this.getCadence(itemName, customOrders).typicalReorderDays
    };
  }

  getMissingItemSuggestions(
    currentItems: string[],
    lastAddedItem: string | null = null,
    orders?: HouseholdOrder[],
    activeOrders?: HouseholdOrder[],
    orderedItemNames?: string[]
  ): CompanionSuggestion[] {
    const activeNames = currentItems.map((n) => n.toLowerCase().trim());
    const activeSet = new Set(activeNames);
    const orderedSet = new Set((orderedItemNames || []).map((n) => n.toLowerCase().trim()));

    const isExcluded = (candidate: string) => {
      const cLower = candidate.toLowerCase().trim();
      for (const inList of activeSet) {
        if (inList.includes(cLower) || cLower.includes(inList)) return true;
      }
      for (const ordered of orderedSet) {
        if (ordered.includes(cLower) || cLower.includes(ordered)) return true;
      }
      if (activeOrders && this.isItemInActiveOrder(candidate, activeOrders)) return true;
      return false;
    };

    const suggestions: Map<string, CompanionSuggestion> = new Map();
    const companionsMap = this.patternRules.companions || {};

    const itemsToEvaluate = lastAddedItem ? [lastAddedItem, ...currentItems] : currentItems;

    for (const item of itemsToEvaluate) {
      const resolved = this.resolve(item).canonicalName;
      const comps = companionsMap[resolved] || [];

      for (const comp of comps) {
        if (isExcluded(comp.companion)) continue;
        const key = comp.companion.toLowerCase().trim();
        if (suggestions.has(key)) continue;

        const cadence = this.getCadence(comp.companion, orders);
        const score = this.getReplenishmentScore(cadence, comp.confidence);

        let reason = `Frequently bought with ${resolved} (${Math.round(comp.confidence * 100)}% match)`;
        if (cadence.replenishmentStatus === "DUE_NOW") {
          reason = `Frequently bought with ${resolved} & due for replenishment (${cadence.uiDueText || "due"})`;
        }

        suggestions.set(key, {
          item: comp.companion,
          triggeredBy: resolved,
          reason,
          confidence: score,
          lastOrderedText: this.getRecency(comp.companion, orders) || undefined,
          cadenceText: cadence.uiCadenceText,
          dueText: cadence.uiDueText,
          replenishmentStatus: cadence.replenishmentStatus,
          daysUntilDue: cadence.daysUntilDue
        });
      }
    }

    return Array.from(suggestions.values()).sort((a, b) => b.confidence - a.confidence);
  }

  getAutonomousRecommendations(
    currentItems: Array<{ name: string; isDone?: boolean; isOrdered?: boolean }>,
    limit: number = 6,
    activeOrders?: HouseholdOrder[],
    ordersHistory?: HouseholdOrder[]
  ): AutonomousRecommendation[] {
    const activeNames = currentItems
      .filter((it) => !it.isDone && !it.isOrdered)
      .map((it) => it.name.toLowerCase().trim());
    const orderedNames = currentItems
      .filter((it) => !it.isDone && it.isOrdered)
      .map((it) => it.name.toLowerCase().trim());

    const activeSet = new Set(activeNames);
    const orderedSet = new Set(orderedNames);

    const isExcluded = (candidate: string) => {
      const cLower = candidate.toLowerCase().trim();
      for (const inList of activeSet) {
        if (inList.includes(cLower) || cLower.includes(inList)) return true;
      }
      for (const ordered of orderedSet) {
        if (ordered.includes(cLower) || cLower.includes(ordered)) return true;
      }
      if (activeOrders && this.isItemInActiveOrder(candidate, activeOrders)) return true;
      return false;
    };

    interface Candidate {
      name: string;
      reason: string;
      category: string;
      score: number;
    }

    const candidateMap = new Map<string, Candidate>();

    // 1. Companion suggestions
    if (activeNames.length > 0) {
      const companions = this.getMissingItemSuggestions(
        activeNames,
        null,
        ordersHistory,
        activeOrders,
        orderedNames
      );
      for (const c of companions) {
        const key = c.item.toLowerCase().trim();
        if (!isExcluded(c.item) && !candidateMap.has(key)) {
          candidateMap.set(key, {
            name: c.item,
            reason: c.reason,
            category: "Staples",
            score: c.confidence
          });
        }
      }
    }

    // 2. Top household staples
    const staples = this.patternRules.top_staples || [];
    for (const staple of staples) {
      const key = staple.name.toLowerCase().trim();
      if (!isExcluded(staple.name) && !candidateMap.has(key)) {
        const cadence = this.getCadence(staple.name, ordersHistory);
        const score = this.getReplenishmentScore(cadence, 0.5);

        let reason = `High-frequency household staple (ordered ${staple.count}x)`;
        if (cadence.replenishmentStatus === "DUE_NOW") {
          reason = `Due for replenishment (usually every ~${cadence.typicalReorderDays} days)`;
        } else if (cadence.replenishmentStatus === "APPROACHING_DUE") {
          reason = `Approaching replenishment (${cadence.uiDueText || "soon"})`;
        }

        candidateMap.set(key, {
          name: staple.name,
          reason,
          category: "Staples",
          score
        });
      }
    }

    // 3. Pet essentials check
    if (!isExcluded("Cat Food") && !isExcluded("Sheba") && !candidateMap.has("cat food")) {
      const petCadence = this.getCadence("Cat Food", ordersHistory);
      const petScore = this.getReplenishmentScore(petCadence, 0.65);
      candidateMap.set("cat food", {
        name: "Cat Food",
        reason:
          petCadence.replenishmentStatus === "DUE_NOW"
            ? "Cat food is due for replenishment for Samba & Milo"
            : "Cat food routine check for Samba & Milo",
        category: "Pet Care & Household",
        score: petScore
      });
    }

    const sorted = Array.from(candidateMap.values()).sort((a, b) => b.score - a.score);

    return sorted.slice(0, limit).map(({ name, reason, category }) => ({
      name,
      reason,
      category
    }));
  }
}

export const itemCatalog = new ItemCatalog();
