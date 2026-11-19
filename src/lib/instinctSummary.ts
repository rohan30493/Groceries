import {
  GroceryItem,
  detectCategory,
  CATEGORY_ICONS,
  CATEGORY_ORDER,
  parseNaturalLanguageList,
} from "./patterns";
import { estimateBasketValue } from "./handoffNotification";
import {
  toCanonicalItemName,
  formatOrderRecency,
  isValidDeliveredOrder,
  extractOrderDate,
  HistoricalOrder,
  CANONICAL_MATCH_RULES,
} from "./orderRecency";
import { calculateItemCadence, ReplenishmentStatus } from "./replenishment";
import { itemCatalog } from "./itemCatalog";
import { HouseholdOrder } from "./orderLifecycle";

export interface InstinctItemSummary {
  id: string;
  name: string;
  category: string;
  addedBy: string;
  addedAt: string;
  notes?: string;
}

export interface InstinctCategoryGroup {
  category: string;
  icon: string;
  count: number;
  items: InstinctItemSummary[];
}

export interface InstinctSummaryResponse {
  ok: boolean;
  count: number;
  estimatedValue: number | null;
  summary: string;
  categories: InstinctCategoryGroup[];
  items: InstinctItemSummary[];
  generatedAt: string;
}

export function getPendingGroceryItems(items: GroceryItem[]): GroceryItem[] {
  return items.filter((it) => !it.isDone && !it.isOrdered);
}

export function groupPendingByCategory(
  items: GroceryItem[]
): InstinctCategoryGroup[] {
  const categoryMap: Record<string, InstinctItemSummary[]> = {};

  items.forEach((it) => {
    const detected = detectCategory(it.name);
    const cat =
      !it.category ||
      it.category === "Other Items" ||
      detected !== "Other Items"
        ? detected
        : it.category;

    if (!categoryMap[cat]) categoryMap[cat] = [];
    categoryMap[cat].push({
      id: it.id,
      name: it.name,
      category: cat,
      addedBy: it.addedBy,
      addedAt: it.addedAt,
      notes: it.notes || undefined,
    });
  });

  const sortedCats = Object.keys(categoryMap).sort((a, b) => {
    const idxA = CATEGORY_ORDER.indexOf(a);
    const idxB = CATEGORY_ORDER.indexOf(b);
    if (idxA !== -1 && idxB !== -1) return idxA - idxB;
    if (idxA !== -1) return -1;
    if (idxB !== -1) return 1;
    return a.localeCompare(b);
  });

  return sortedCats.map((cat) => ({
    category: cat,
    icon: CATEGORY_ICONS[cat] || "🛒",
    count: categoryMap[cat].length,
    items: [...categoryMap[cat]].sort((a, b) =>
      (a.name || "").localeCompare(b.name || "")
    ),
  }));
}

export function formatWhatsAppSummary(
  pending: GroceryItem[],
  options: {
    now?: Date;
    estimatedValue?: number | null;
  } = {}
): string {
  if (pending.length === 0) {
    return "🛒 *Household Grocery Requirements*\n\nNo pending items! The grocery list is currently empty.";
  }

  const groups = groupPendingByCategory(pending);
  const now = options.now || new Date();
  const formattedTime = now.toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });

  const sections = groups
    .map((g) => {
      const itemLines = g.items
        .map((it) => {
          let line = `• ${it.name}`;
          const details: string[] = [];
          if (it.notes) details.push(`note: ${it.notes}`);
          if (it.addedBy) details.push(`added by ${it.addedBy}`);
          if (details.length > 0) {
            line += ` (${details.join(" | ")})`;
          }
          return line;
        })
        .join("\n");
      return `${g.icon} *${g.category}* (${g.count})\n${itemLines}`;
    })
    .join("\n\n");

  const est =
    options.estimatedValue !== undefined
      ? options.estimatedValue
      : estimateBasketValue(pending);
  const estLine = est ? `\nEstimated total: ~₹${est}` : "";
  const totalLine = `\nTotal: ${pending.length} ${
    pending.length === 1 ? "item" : "items"
  } needed`;

  return `🛒 *Household Grocery Requirements* (Full List - ${pending.length} ${
    pending.length === 1 ? "item" : "items"
  })\n\n${sections}${estLine}${totalLine}\n\n_Updated: ${formattedTime}_`;
}

export function buildInstinctSummaryPayload(
  items: GroceryItem[],
  now: Date = new Date()
): InstinctSummaryResponse {
  const pending = getPendingGroceryItems(items);
  const groups = groupPendingByCategory(pending);
  const est = estimateBasketValue(pending);
  const summaryText = formatWhatsAppSummary(pending, {
    now,
    estimatedValue: est,
  });

  const allPendingItems: InstinctItemSummary[] = groups.flatMap((g) => g.items);

  return {
    ok: true,
    count: pending.length,
    estimatedValue: est,
    summary: summaryText,
    categories: groups,
    items: allPendingItems,
    generatedAt: now.toISOString(),
  };
}

export function validateApiToken(
  tokenProvided: string | null | undefined,
  configuredSecret: string | null | undefined
): boolean {
  if (!configuredSecret || configuredSecret.trim() === "") {
    return true; // No secret configured in environment; open access
  }
  return tokenProvided === configuredSecret;
}

export interface AddItemInput {
  name: string;
  notes?: string;
  addedBy?: "Instinct" | "Lira" | "Rhythm" | "Rohan";
}

export interface AddItemsResult {
  ok: boolean;
  added: GroceryItem[];
  duplicates: string[];
  totalPending: number;
  summary: string;
}

export interface CompleteItemResult {
  ok: boolean;
  completed: GroceryItem[];
  message: string;
}

export interface ReplenishmentReminderItem {
  canonicalName: string;
  status: ReplenishmentStatus;
  daysSinceLastDelivery: number | null;
  typicalReorderDays: number | null;
  daysUntilDue: number | null;
  uiCadenceText: string | null;
  uiDueText: string | null;
}

export interface ReplenishmentRemindersResponse {
  ok: boolean;
  count: number;
  items: ReplenishmentReminderItem[];
  summary: string;
  generatedAt: string;
}

export interface RecencyLookupResult {
  ok: boolean;
  found: boolean;
  query: string;
  canonicalName?: string;
  productName?: string;
  platform?: string;
  lastOrderedDate?: string;
  relativeTime?: string;
  quantity?: number;
  price?: number;
  summary: string;
}

/**
 * Parses user or Instinct inputs into structured AddItemInput records.
 * Supports comma-separated strings, bullet lists, arrays of strings, or arrays of objects.
 */
export function parseInputItems(raw: unknown): AddItemInput[] {
  if (!raw) return [];

  if (typeof raw === "string") {
    const parsed = parseNaturalLanguageList(raw);
    return parsed
      .map((name) => {
        const noteMatch =
          name.match(/^(.*?)\s*[\(\[]note:\s*([^\)\]]+)[\)\]]$/i) ||
          name.match(/^(.*?)\s*[\(\[](.*?)[\)\]]$/);
        if (noteMatch) {
          return {
            name: noteMatch[1].trim(),
            notes: noteMatch[2].trim(),
          };
        }
        return { name: name.trim() };
      })
      .filter((it) => it.name.length > 0);
  }

  if (Array.isArray(raw)) {
    const list: AddItemInput[] = [];
    for (const item of raw) {
      if (typeof item === "string" && item.trim().length > 0) {
        list.push({ name: item.trim() });
      } else if (
        item &&
        typeof item === "object" &&
        "name" in item &&
        typeof item.name === "string" &&
        item.name.trim().length > 0
      ) {
        const itemObj = item as {
          name: string;
          notes?: string;
          addedBy?: "Instinct" | "Lira" | "Rhythm" | "Rohan";
        };
        list.push({
          name: itemObj.name.trim(),
          notes:
            typeof itemObj.notes === "string"
              ? itemObj.notes.trim()
              : undefined,
          addedBy: itemObj.addedBy,
        });
      }
    }
    return list;
  }

  return [];
}

/**
 * Pure domain logic: adds items to the pending list while deduplicating against active items.
 */
export function processAddItems(
  inputs: AddItemInput[],
  currentItems: GroceryItem[],
  now: Date = new Date()
): {
  added: GroceryItem[];
  duplicates: string[];
  updatedItems: GroceryItem[];
} {
  const activePending = getPendingGroceryItems(currentItems);
  const activeNames = new Set(
    activePending.map((it) => it.name.trim().toLowerCase())
  );
  const activeCanons = new Set(
    activePending
      .map((it) => toCanonicalItemName(it.name)?.toLowerCase())
      .filter((c): c is string => Boolean(c))
  );

  const added: GroceryItem[] = [];
  const duplicates: string[] = [];
  const updatedItems = [...currentItems];

  inputs.forEach((input, index) => {
    const cleanName = input.name.trim();
    if (!cleanName) return;

    const lowerName = cleanName.toLowerCase();
    const canon = toCanonicalItemName(cleanName)?.toLowerCase();

    // Deduplication check against active basket items
    const isDup =
      activeNames.has(lowerName) || (canon && activeCanons.has(canon));

    if (isDup) {
      duplicates.push(cleanName);
      return;
    }

    const detectedCat = detectCategory(cleanName);
    const newItem: GroceryItem = {
      id: `item-${now.getTime()}-${index}-${Math.random().toString(36).slice(2, 6)}`,
      name: cleanName,
      category: detectedCat,
      addedBy: input.addedBy || "Instinct",
      addedAt: now.toISOString(),
      isDone: false,
      notes: input.notes,
    };

    added.push(newItem);
    updatedItems.unshift(newItem);
    activeNames.add(lowerName);
    if (canon) activeCanons.add(canon);
  });

  return { added, duplicates, updatedItems };
}

/**
 * Pure domain logic: completes an item by ID or fuzzy name match.
 */
export function processCompleteItem(
  query: string,
  currentItems: GroceryItem[],
  now: Date = new Date()
): {
  completed: GroceryItem[];
  updatedItems: GroceryItem[];
} {
  const cleanQuery = query.trim().toLowerCase();
  if (!cleanQuery) {
    return { completed: [], updatedItems: currentItems };
  }

  const canonQuery = toCanonicalItemName(cleanQuery)?.toLowerCase();
  const completed: GroceryItem[] = [];

  const updatedItems = currentItems.map((item) => {
    if (item.isDone || item.isOrdered) return item;

    const matchesId = item.id === query.trim();
    const matchesName = item.name.toLowerCase().includes(cleanQuery);
    const itemCanon = toCanonicalItemName(item.name)?.toLowerCase();
    const matchesCanon = Boolean(canonQuery && itemCanon === canonQuery);

    if (matchesId || matchesName || matchesCanon) {
      const updated: GroceryItem = {
        ...item,
        isDone: true,
        purchasedAt: now.toISOString(),
      };
      completed.push(updated);
      return updated;
    }

    return item;
  });

  return { completed, updatedItems };
}

/**
 * Computes replenishment reminders for items that are due now or approaching due,
 * filtering out items that are already active in the pending list.
 */
export function computeReplenishmentReminders(
  activeItems: GroceryItem[],
  historicalOrders?: HouseholdOrder[],
  now: Date = new Date()
): ReplenishmentRemindersResponse {
  const pending = getPendingGroceryItems(activeItems);
  const pendingCanons = new Set(
    pending
      .map((it) => toCanonicalItemName(it.name)?.toLowerCase())
      .filter((c): c is string => Boolean(c))
  );

  const orders = historicalOrders || itemCatalog.getDefaultHistoricalOrders();

  // Distinct canonical items
  const canonicalNames = Array.from(
    new Set(CANONICAL_MATCH_RULES.map(([canon]) => canon))
  );

  const dueList: ReplenishmentReminderItem[] = [];

  for (const canon of canonicalNames) {
    // Suppress if already pending in current basket
    if (pendingCanons.has(canon.toLowerCase())) continue;

    const cadence = calculateItemCadence(canon, orders, now);
    if (
      cadence.replenishmentStatus === "DUE_NOW" ||
      cadence.replenishmentStatus === "APPROACHING_DUE"
    ) {
      dueList.push({
        canonicalName: canon,
        status: cadence.replenishmentStatus,
        daysSinceLastDelivery: cadence.daysSinceLastDelivery,
        typicalReorderDays: cadence.typicalReorderDays,
        daysUntilDue: cadence.daysUntilDue,
        uiCadenceText: cadence.uiCadenceText,
        uiDueText: cadence.uiDueText,
      });
    }
  }

  // Sort: DUE_NOW first, then by daysUntilDue ascending
  dueList.sort((a, b) => {
    if (a.status === "DUE_NOW" && b.status !== "DUE_NOW") return -1;
    if (b.status === "DUE_NOW" && a.status !== "DUE_NOW") return 1;
    return (a.daysUntilDue ?? 0) - (b.daysUntilDue ?? 0);
  });

  let summaryText = "";
  if (dueList.length === 0) {
    summaryText =
      "🔔 *Grocery Replenishment Reminders*\n\nAll staples are well-stocked! No items are currently due.";
  } else {
    const lines = dueList
      .map((item) => {
        const cadencePart = item.typicalReorderDays
          ? `typically every ~${item.typicalReorderDays} days`
          : "";
        const lastPart =
          item.daysSinceLastDelivery !== null
            ? `last ordered ${item.daysSinceLastDelivery} days ago`
            : "";
        const statusBadge =
          item.status === "DUE_NOW" ? "Due now" : item.uiDueText || "Due soon";
        const details = [cadencePart, lastPart, statusBadge]
          .filter(Boolean)
          .join(" · ");
        return `• *${item.canonicalName}* (${details})`;
      })
      .join("\n");

    summaryText = `🔔 *Grocery Replenishment Reminders* (${dueList.length} ${
      dueList.length === 1 ? "item" : "items"
    } due)\n\n${lines}\n\n_Reply "Add <item>" to add to your list._`;
  }

  return {
    ok: true,
    count: dueList.length,
    items: dueList,
    summary: summaryText,
    generatedAt: now.toISOString(),
  };
}

/**
 * Detailed recency lookup for any query string against delivered order history.
 */
export function lookupItemRecencyDetails(
  query: string,
  orders?: Array<HistoricalOrder | HouseholdOrder>,
  now: Date = new Date()
): RecencyLookupResult {
  const cleanQuery = query.trim().toLowerCase();
  if (!cleanQuery) {
    return {
      ok: false,
      found: false,
      query,
      summary: "Please provide an item name to check order recency.",
    };
  }

  const canonQuery = toCanonicalItemName(cleanQuery)?.toLowerCase();
  const allOrders =
    orders ||
    (itemCatalog.getDefaultHistoricalOrders() as unknown as HistoricalOrder[]);

  // Sort orders descending by order date
  const sortedOrders = [...allOrders]
    .filter(isValidDeliveredOrder)
    .sort((a, b) => {
      const dateA = new Date(extractOrderDate(a) || 0).getTime();
      const dateB = new Date(extractOrderDate(b) || 0).getTime();
      return dateB - dateA;
    });

  for (const ord of sortedOrders) {
    const dateStr = extractOrderDate(ord);
    if (!dateStr) continue;
    const orderDate = new Date(dateStr);
    if (isNaN(orderDate.getTime())) continue;

    for (const it of ord.items || []) {
      if (!it || !it.name) continue;
      const itName = it.name.toLowerCase();
      const itCanon = toCanonicalItemName(it.name)?.toLowerCase();

      const isMatch =
        itName.includes(cleanQuery) ||
        Boolean(canonQuery && itCanon === canonQuery);

      if (isMatch) {
        const canonical = toCanonicalItemName(it.name) || it.name;
        const relative = formatOrderRecency(orderDate, now) || "Recently";
        const dateFormatted = orderDate.toLocaleDateString("en-IN", {
          timeZone: "Asia/Kolkata",
          day: "numeric",
          month: "short",
          year: "numeric",
        });

        const platform =
          (typeof ord.platform === "string" && ord.platform) ||
          ((ord as { order_code?: string }).order_code
            ? "Zepto"
            : "Quick Commerce");

        const qty = it.quantity || 1;
        const price = it.price ? `₹${it.price}` : null;
        const priceText = price ? ` · ${price}` : "";

        const summary = `📦 *${canonical}* (${it.name})\nLast ordered: *${relative}* (${dateFormatted})\nPlatform: *${platform}* (Qty: ${qty}${priceText})`;

        return {
          ok: true,
          found: true,
          query,
          canonicalName: canonical,
          productName: it.name,
          platform,
          lastOrderedDate: dateStr,
          relativeTime: relative,
          quantity: qty,
          price: it.price,
          summary,
        };
      }
    }
  }

  return {
    ok: true,
    found: false,
    query,
    summary: `📦 No delivered order history found for "${query}".`,
  };
}
