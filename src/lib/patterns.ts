import patternRulesRaw from "../../data/pattern_rules.json";
import categorySectionsRaw from "../../data/category_sections.json";
import { calculateItemLastOrdered } from "./orderRecency";
import { calculateItemCadence, calculateReplenishmentScore, ReplenishmentStatus } from "./replenishment";
import { HouseholdOrder } from "./orderLifecycle";
import { isItemInActiveOrder } from "./purchaseMemory";

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

export interface GroceryItem {
  id: string;
  name: string;
  category: string;
  addedBy: "Lira" | "Rhythm" | "Rohan" | "Pattern Suggestion";
  addedAt: string;
  isDone: boolean;
  purchasedAt?: string;
  createdAt?: string;
  notes?: string;
  isOrdered?: boolean;
  orderedAt?: string;
  orderedBy?: "Rohan" | "Lira" | "Rhythm";
}

export interface PatternRules {
  companions: Record<string, Array<{ companion: string; co_count: number; confidence: number }>>;
  staple_intervals: Record<string, { total_purchases: number; typical_interval_days: number; last_ordered: string }>;
  top_staples: Array<{ name: string; count: number }>;
  category_items: Record<string, string[]>;
}

export interface CategoryItemDef {
  name: string;
  icon: string;
  subtitle?: string;
  imageUrl?: string;
  orderCount: number;
}

export interface CategorySection {
  id: string;
  name: string;
  icon: string;
  badge: string;
  description: string;
  itemCount: number;
  items: CategoryItemDef[];
}

export const patternRules: PatternRules = patternRulesRaw as unknown as PatternRules;
export const CATEGORY_SECTIONS: CategorySection[] = categorySectionsRaw as unknown as CategorySection[];

export const CATEGORY_ICONS: Record<string, string> = {
  "Fruits & Vegetables": "🥦",
  "Dairy, Bread & Eggs": "🥛",
  "Atta, Rice, Oil & Dals": "🌾",
  "Masala & Dry Fruits": "🌶️",
  "Breakfast & Sauces": "🥣",
  "Tea, Coffee & Drinks": "☕",
  "Tea, Coffee & Beverages": "☕",
  "Munchies & Biscuits": "🍿",
  "Munchies & Snacks": "🍿",
  "Pet Care & Household": "🐾",
  "Other Items": "🛒"
};

export interface ItemVisual {
  imageUrl?: string;
  icon: string;
}

// Flat lookup cache for catalog items & categories
const CATALOG_ITEMS: CategoryItemDef[] = [];
const ITEM_TO_CATEGORY_MAP: Record<string, string> = {};
CATEGORY_SECTIONS.forEach((cat) => {
  cat.items.forEach((it) => {
    CATALOG_ITEMS.push(it);
    ITEM_TO_CATEGORY_MAP[it.name.toLowerCase()] = cat.name;
  });
});

/**
 * Resolves product image and icon for an item name by matching against catalog with aliases & fuzzy matches
 */
export function getItemVisual(itemName: string, categoryName?: string): ItemVisual {
  if (!itemName) {
    const fallbackCat = categoryName || "Other Items";
    return { icon: CATEGORY_ICONS[fallbackCat] || "🛒" };
  }

  const clean = itemName.toLowerCase().trim();

  // 1. Direct match against catalog items
  for (const catItem of CATALOG_ITEMS) {
    const catNameLower = catItem.name.toLowerCase();
    
    // Exact match
    if (catNameLower === clean) {
      return { imageUrl: catItem.imageUrl, icon: catItem.icon || "🛒" };
    }

    // Split aliases (e.g. "Lady Finger / Bhindi" -> "lady finger", "bhindi")
    const parts = catNameLower.split("/").map((p) => p.trim());
    for (const p of parts) {
      if (p === clean || clean === p) {
        return { imageUrl: catItem.imageUrl, icon: catItem.icon || "🛒" };
      }
    }
  }

  // 2. Substring & keyword match against catalog
  for (const catItem of CATALOG_ITEMS) {
    const catNameLower = catItem.name.toLowerCase();
    const parts = catNameLower.split("/").map((p) => p.trim());
    for (const p of parts) {
      if (p.length > 2 && (clean.includes(p) || p.includes(clean))) {
        return { imageUrl: catItem.imageUrl, icon: catItem.icon || "🛒" };
      }
    }
  }

  // 3. Common grocery aliases
  if (clean.includes("brinjal") || clean.includes("eggplant") || clean.includes("baingan")) {
    return {
      imageUrl: "https://cdn.zeptonow.com/production/tr:w-600,ar-100-100,pr-true,f-auto,q-80/cms/product_variant/7b489a59-1e3d-49fa-9844-42f06859e4b6.jpeg",
      icon: "🍆"
    };
  }
  if (clean.includes("bindi") || clean.includes("bhindi") || clean.includes("okra")) {
    const bhindi = CATALOG_ITEMS.find((c) => c.name.toLowerCase().includes("bhindi"));
    if (bhindi) return { imageUrl: bhindi.imageUrl, icon: bhindi.icon || "🫛" };
  }
  if (clean.includes("butter") && !clean.includes("peanut") && !clean.includes("milk")) {
    const butter = CATALOG_ITEMS.find((c) => c.name.toLowerCase() === "butter");
    if (butter) return { imageUrl: butter.imageUrl, icon: butter.icon || "🧈" };
  }
  if (clean.includes("bread") || clean.includes("pav") || clean.includes("bun")) {
    const bread = CATALOG_ITEMS.find((c) => c.name.toLowerCase().includes("bread"));
    if (bread) return { imageUrl: bread.imageUrl, icon: bread.icon || "🍞" };
  }
  if (clean.includes("chilli") || clean.includes("mirch")) {
    const chilli = CATALOG_ITEMS.find((c) => c.name.toLowerCase().includes("green chillies"));
    if (chilli) return { imageUrl: chilli.imageUrl, icon: chilli.icon || "🌶️" };
  }

  // 4. Fallback to category icon
  const cat = categoryName || detectCategory(itemName) || "Other Items";
  const catIcon = CATEGORY_ICONS[cat] || "🛒";
  return { icon: catIcon };
}

export function detectCategory(itemName: string): string {
  const lower = itemName.toLowerCase();
  
  // Exact or contains match from canonical catalog
  for (const [canonical, catName] of Object.entries(ITEM_TO_CATEGORY_MAP)) {
    if (lower.includes(canonical) || canonical.includes(lower)) {
      return String(catName);
    }
  }

  if (lower.includes("paneer") || lower.includes("milk") || lower.includes("curd") || lower.includes("cheese") || lower.includes("dahi") || lower.includes("egg") || lower.includes("butter") || lower.includes("batter") || lower.includes("bread") || lower.includes("pav")) {
    return "Dairy, Bread & Eggs";
  }
  if (lower.includes("gobi") || lower.includes("palak") || lower.includes("methi") || lower.includes("bhindi") || lower.includes("onion") || lower.includes("tomato") || lower.includes("potato") || lower.includes("chilli") || lower.includes("carrot") || lower.includes("beans") || lower.includes("cucumber") || lower.includes("lettuce") || lower.includes("lauki") || lower.includes("ghea") || lower.includes("tori") || lower.includes("thori") || lower.includes("brinjal") || lower.includes("baingan") || lower.includes("eggplant") || lower.includes("badanekaayi") || lower.includes("fruit") || lower.includes("apple") || lower.includes("banana")) {
    return "Fruits & Vegetables";
  }
  if (lower.includes("atta") || lower.includes("flour") || lower.includes("dal") || lower.includes("rice") || lower.includes("oil") || lower.includes("ghee") || lower.includes("rajma") || lower.includes("chana") || lower.includes("besan") || lower.includes("poha") || lower.includes("suji")) {
    return "Atta, Rice, Oil & Dals";
  }
  if (lower.includes("salt") || lower.includes("sugar") || lower.includes("jeera") || lower.includes("haldi") || lower.includes("mirch") || lower.includes("garam masala") || lower.includes("hing") || lower.includes("kaju") || lower.includes("badam") || lower.includes("peanut") || lower.includes("spice")) {
    return "Masala & Dry Fruits";
  }
  if (lower.includes("tea") || lower.includes("chai") || lower.includes("coffee") || lower.includes("juice") || lower.includes("coconut water") || lower.includes("coke") || lower.includes("soda")) {
    return "Tea, Coffee & Drinks";
  }
  if (lower.includes("oat") || lower.includes("flake") || lower.includes("honey") || lower.includes("jam") || lower.includes("ketchup") || lower.includes("sauce") || lower.includes("muesli")) {
    return "Breakfast & Sauces";
  }
  if (lower.includes("biscuit") || lower.includes("cookie") || lower.includes("chip") || lower.includes("namkeen") || lower.includes("makhana") || lower.includes("chocolate") || lower.includes("noodle") || lower.includes("pasta")) {
    return "Munchies & Biscuits";
  }
  if (lower.includes("cat food") || lower.includes("sheba") || lower.includes("me-o") || lower.includes("poop bag") || lower.includes("cat litter") || lower.includes("dishwash") || lower.includes("detergent") || lower.includes("tissue") || lower.includes("toilet roll") || lower.includes("kitchen roll") || lower.includes("garbage")) {
    return "Pet Care & Household";
  }
  return "Other Items";
}

// Comprehensive household vocabulary for multi-item continuous speech segmenting
const GROCERY_VOCABULARY = [
  // Multi-word produce & staples (must match first)
  "cherry tomatoes", "french beans", "lady finger", "bottle gourd", "ridge gourd",
  "mandarin orange", "salad leaves", "green chillies", "feta cheese", "greek yogurt",
  "fresh paneer", "fresh cream", "milk bread", "keto bread", "wheat flour",
  "basmati rice", "sona masuri", "sona masoori", "masoor dal", "moong dal",
  "toor dal", "arhar dal", "chana dal", "white chana", "black chana",
  "cooking oil", "olive oil", "red chilli powder", "kashmiri chilli", "coriander powder",
  "garam masala", "kitchen king masala", "black pepper", "chaat masala", "mustard seeds",
  "cumin seeds", "dry fruits", "mixed dry fruits", "ginger garlic paste", "peanut butter",
  "pasta sauce", "hot sauce", "soy sauce", "sleepy owl", "roasted peanuts",
  "cat food", "cat poop bags", "toilet paper", "kitchen roll", "glass cleaner",
  "laundry detergent", "floor cleaner", "handwash liquid", "facial tissues", "dosa batter",
  "idli batter", "cheddar cheese", "shredded cheese", "bharta brinjal", "purple brinjal",

  // Single word items
  "tomatoes", "tomato", "onions", "onion", "bananas", "banana", "potatoes", "potato",
  "cauliflower", "gobi", "carrots", "carrot", "cucumber", "palak", "spinach", "lemons",
  "lemon", "coriander", "dhaniya", "garlic", "apples", "apple", "lettuce", "ginger",
  "capsicum", "cabbage", "bhindi", "tori", "lauki", "broccoli", "mushrooms", "mushroom",
  "brinjal", "baingan", "eggplant",
  "pomegranate", "kiwi", "milk", "paneer", "curd", "dahi", "eggs", "egg", "butter",
  "ghee", "buttermilk", "skyr", "cheese", "bread", "atta", "rice", "rajma", "besan",
  "poha", "suji", "semolina", "vermicelli", "seviyan", "oats", "sugar", "salt",
  "turmeric", "cumin", "jeera", "cardamom", "cinnamon", "cloves", "almonds", "cashews",
  "walnuts", "raisins", "dates", "makhana", "foxnuts", "jam", "ketchup", "mayonnaise",
  "chutney", "honey", "tea", "coffee", "stevia", "namkeen", "mixture", "biscuits",
  "chips", "popcorn", "crackers", "dishwash", "tissues"
];

// Sort descending by length for greedy longest match
GROCERY_VOCABULARY.sort((a, b) => b.length - a.length);

/**
 * Parses freeform natural language text from WhatsApp or voice input into structured individual items
 */
export function parseNaturalLanguageList(input: string): string[] {
  if (!input || !input.trim()) return [];

  // 1. Remove WhatsApp metadata like [15/12/25, 7:31:07 AM] Lira Suri:
  let text = input.replace(/\[\d{1,2}\/\d{1,2}\/\d{2,4}[^\]]*\]\s*[^:]+:\s*/g, " ");

  // 2. Remove conversational introductory phrases (especially common in voice input)
  text = text.replace(/^(?:we need|i need|can you get|please order|order|please get|can you please get|get me|get|buy|please buy|bring)\s+/gi, "");
  text = text.replace(/(?:need vegetables|please order|also order|can you get|order for me|get me)\s*:/gi, " ");

  // 3. Normalize spoken conjunctions into delimiters: "and", "then", "also", "plus", "with"
  text = text.replace(/\b(?:and|then|also|plus|with|as well as)\b/gi, ",");

  // 4. Split by explicit delimiters: newlines, commas, semicolons
  const rawChunks = text
    .split(/[\n,;+]+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 2 && !/^(also|some|etc|ok|yes|no)$/i.test(s));

  const finalItems: string[] = [];

  // 5. Intelligent chunk segmentation (handles spoken continuous items with NO commas, e.g. "paneer tomatoes curd milk")
  const escapedVocab = GROCERY_VOCABULARY.map((v) => v.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const vocabRegex = new RegExp(`\\b(${escapedVocab.join("|")})\\b`, "gi");

  rawChunks.forEach((chunk) => {
    // Check how many known grocery words are in this chunk
    const matches = Array.from(chunk.matchAll(vocabRegex));

    if (matches.length > 1) {
      // Multiple items spoken together without commas (e.g. "paneer tomatoes curd milk")
      // Extract each matched item individually
      matches.forEach((m) => {
        const itemStr = m[1].trim();
        const capitalized = itemStr.charAt(0).toUpperCase() + itemStr.slice(1);
        if (!finalItems.some((it) => it.toLowerCase() === capitalized.toLowerCase())) {
          finalItems.push(capitalized);
        }
      });
    } else {
      // Single item or item with quantity (e.g. "2 packets milk", "1 kg potatoes")
      let clean = chunk.replace(/^[\d\s*x.-]+/, "").trim();
      // Remove filler words like "some", "a packet of", "kg of"
      clean = clean.replace(/^(?:some|a packet of|packet of|kg of|box of)\s+/gi, "").trim();

      if (clean.length >= 2) {
        const capitalized = clean.charAt(0).toUpperCase() + clean.slice(1);
        if (!finalItems.some((it) => it.toLowerCase() === capitalized.toLowerCase())) {
          finalItems.push(capitalized);
        }
      }
    }
  });

  return finalItems;
}

function normalizeForCompanions(name: string): string {
  const n = name.toLowerCase();
  if (n.includes("paneer")) return "Fresh Paneer";
  if (n.includes("milk")) return "Milk";
  if (n.includes("egg")) return "Eggs";
  if (n.includes("cherry tomato")) return "Cherry Tomatoes";
  if (n.includes("tomato")) return "Tomatoes";
  if (n.includes("cauliflower") || n.includes("gobi")) return "Cauliflower";
  if (n.includes("potato") || n.includes("aloo")) return "Potatoes";
  if (n.includes("onion")) return "Onions";
  if (n.includes("cucumber")) return "Cucumber";
  if (n.includes("lettuce")) return "Lettuce / Salad Leaves";
  if (n.includes("palak") || n.includes("spinach")) return "Palak / Spinach";
  if (n.includes("bhindi") || n.includes("lady finger")) return "Lady Finger / Bhindi";
  if (n.includes("coriander") || n.includes("dhaniya")) return "Coriander";
  if (n.includes("bread")) return "Bread";
  if (n.includes("atta")) return "Wheat Flour / Atta";
  if (n.includes("rice")) return "Rice";
  if (n.includes("tea")) return "Tea";
  if (n.includes("coffee")) return "Coffee";
  if (n.includes("sugar")) return "Sugar";
  if (n.includes("peanut")) return "Roasted Peanuts";
  return name;
}

/**
 * Predicts what items might be missing based on co-occurrence with already added items,
 * ranked and qualified by cadence-aware replenishment intelligence.
 * Only returns suggestions when items have actually been added!
 */
export function getMissingItemSuggestions(
  currentList: string[],
  lastAddedItem?: string | null,
  orders?: HouseholdOrder[],
  activeOrders?: HouseholdOrder[],
  excludedItems?: string[]
): CompanionSuggestion[] {
  // Never show suggestions on empty list - only when items have been added!
  if (!currentList || currentList.length === 0) {
    return [];
  }

  const currentLowerSet = new Set(currentList.map((x) => x.toLowerCase().trim()));
  const excludedLowerSet = new Set((excludedItems || []).map((x) => x.toLowerCase().trim()));
  const suggestionsMap = new Map<string, CompanionSuggestion>();

  // Helper to check if item is already in list
  const isAlreadyInList = (candidate: string) => {
    const cLower = candidate.toLowerCase().trim();
    for (const inList of currentLowerSet) {
      if (inList.includes(cLower) || cLower.includes(inList)) {
        return true;
      }
    }
    return false;
  };

  // Helper to check if item is in excluded items (e.g. already ordered by user)
  const isAlreadyExcluded = (candidate: string) => {
    const cLower = candidate.toLowerCase().trim();
    for (const excl of excludedLowerSet) {
      if (excl.includes(cLower) || cLower.includes(excl)) {
        return true;
      }
    }
    return false;
  };

  // Helper to check if item is in active order (suppress from recommendations)
  const isAlreadyInActiveOrder = (candidate: string) => {
    if (!activeOrders || activeOrders.length === 0) return false;
    return isItemInActiveOrder(candidate, activeOrders);
  };

  const isExcluded = (candidate: string) => {
    return isAlreadyInList(candidate) || isAlreadyExcluded(candidate) || isAlreadyInActiveOrder(candidate);
  };

  // Prioritize last added item first if available
  const itemsToCheck = lastAddedItem
    ? [lastAddedItem, ...currentList.filter((it) => it !== lastAddedItem)]
    : currentList;

  // 1. Check Co-occurrence rules for each item currently added
  for (const rawItem of itemsToCheck) {
    const normalizedKey = normalizeForCompanions(rawItem);

    // Match against keys in patternRules.companions
    for (const [key, companions] of Object.entries(patternRules.companions)) {
      if (
        normalizedKey.toLowerCase().includes(key.toLowerCase()) ||
        key.toLowerCase().includes(normalizedKey.toLowerCase()) ||
        rawItem.toLowerCase().includes(key.toLowerCase())
      ) {
        for (const comp of companions) {
          if (!isExcluded(comp.companion)) {
            const isFromLastAdded = lastAddedItem && rawItem === lastAddedItem;
            const boost = isFromLastAdded ? 0.3 : 0;
            const effectiveConfidence = comp.confidence + boost;

            const cadence = calculateItemCadence(comp.companion, orders);
            const replenishmentScore = calculateReplenishmentScore(cadence, effectiveConfidence);

            const existing = suggestionsMap.get(comp.companion);
            if (!existing || replenishmentScore > existing.confidence) {
              const recencyText = calculateItemLastOrdered(comp.companion, orders) || undefined;
              suggestionsMap.set(comp.companion, {
                item: comp.companion,
                triggeredBy: rawItem,
                reason: `Usually ordered with ${rawItem} (${Math.round(comp.confidence * 100)}% of the time in past orders)`,
                confidence: replenishmentScore,
                lastOrderedText: recencyText,
                cadenceText: cadence.uiCadenceText,
                dueText: cadence.uiDueText,
                replenishmentStatus: cadence.replenishmentStatus,
                daysUntilDue: cadence.daysUntilDue
              });
            }
          }
        }
      }
    }
  }

  // 2. Proactively check if pet care items are missing when doing big grocery runs
  const hasProduceOrDairy = currentList.some((it) => {
    const cat = detectCategory(it);
    return cat === "Fruits & Vegetables" || cat === "Dairy, Bread & Eggs";
  });
  if (hasProduceOrDairy && !isExcluded("Cat Food") && !isExcluded("Sheba")) {
    const catFoodCadence = calculateItemCadence("Cat Food", orders);
    const catFoodScore = calculateReplenishmentScore(catFoodCadence, 0.65);
    const recencyText = calculateItemLastOrdered("Cat Food", orders) || undefined;

    suggestionsMap.set("Cat Food", {
      item: "Cat Food",
      triggeredBy: "Samba & Milo",
      reason: "Cat food reminder for Samba & Milo",
      confidence: catFoodScore,
      lastOrderedText: recencyText,
      cadenceText: catFoodCadence.uiCadenceText,
      dueText: catFoodCadence.uiDueText,
      replenishmentStatus: catFoodCadence.replenishmentStatus,
      daysUntilDue: catFoodCadence.daysUntilDue
    });
  }

  // Sort by replenishment-adjusted confidence descending
  const sorted = Array.from(suggestionsMap.values()).sort((a, b) => b.confidence - a.confidence);
  return sorted.slice(0, 5);
}
