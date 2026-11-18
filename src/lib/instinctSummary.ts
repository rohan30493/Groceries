import {
  GroceryItem,
  detectCategory,
  CATEGORY_ICONS,
  CATEGORY_ORDER,
} from "./patterns";
import { estimateBasketValue } from "./handoffNotification";

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
