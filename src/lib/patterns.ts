import patternRulesRaw from "../../data/pattern_rules.json";
import categorySectionsRaw from "../../data/category_sections.json";

export interface CompanionSuggestion {
  item: string;
  triggeredBy: string;
  reason: string;
  confidence: number;
}

export interface GroceryItem {
  id: string;
  name: string;
  category: string;
  addedBy: "Lira" | "Rohan" | "Pattern Suggestion";
  addedAt: string;
  isDone: boolean;
  purchasedAt?: string;
  createdAt?: string;
  notes?: string;
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

// Fast lookup map for canonical categories
const ITEM_TO_CATEGORY_MAP: Record<string, string> = {};
CATEGORY_SECTIONS.forEach((cat) => {
  cat.items.forEach((it) => {
    ITEM_TO_CATEGORY_MAP[it.name.toLowerCase()] = cat.name;
  });
});

export function detectCategory(itemName: string): string {
  const lower = itemName.toLowerCase();
  
  // Exact or contains match from canonical catalog
  for (const [canonical, catName] of Object.entries(ITEM_TO_CATEGORY_MAP)) {
    if (lower.includes(canonical) || canonical.includes(lower)) {
      return catName;
    }
  }

  if (lower.includes("paneer") || lower.includes("milk") || lower.includes("curd") || lower.includes("cheese") || lower.includes("dahi") || lower.includes("egg") || lower.includes("butter") || lower.includes("batter") || lower.includes("bread") || lower.includes("pav")) {
    return "Dairy, Bread & Eggs";
  }
  if (lower.includes("gobi") || lower.includes("palak") || lower.includes("methi") || lower.includes("bhindi") || lower.includes("onion") || lower.includes("tomato") || lower.includes("potato") || lower.includes("chilli") || lower.includes("carrot") || lower.includes("beans") || lower.includes("cucumber") || lower.includes("lettuce") || lower.includes("lauki") || lower.includes("ghea") || lower.includes("tori") || lower.includes("thori") || lower.includes("fruit") || lower.includes("apple") || lower.includes("banana")) {
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
  "french beans", "lady finger", "bottle gourd", "ridge gourd", "baby tomatoes",
  "cherry tomatoes", "spring onions", "green chillies", "green chilli", "green peas",
  "frozen green peas", "feta cheese", "cheese cubes", "cheese slices", "cheddar cheese",
  "shredded cheese", "dosa batter", "idli batter", "amul butter", "milk bread",
  "white bread", "regular bread", "brown bread", "keto bread", "low carb flour",
  "keto atta", "regular atta", "fresh milk", "milk tetrapack", "milk tetra pack",
  "cat food", "poop bags", "cat litter", "toilet roll", "toilet rolls",
  "kitchen roll", "kitchen rolls", "kitchen towel", "kitchen towels", "facial tissues",
  "wet wipes", "tea leaves", "green tea", "sona masoori", "sona masuri", "basmati rice",
  "masoor dal", "moong dal", "yellow moong dal", "green moong dal", "toor dal",
  "arhar dal", "chana dal", "white chana", "black chana", "green moong", "agar agar",
  "sarson ka saag", "fresh paneer", "malai paneer", "toned milk", "cow milk",
  "set curd", "curd tub", "dahi", "amul butter", "desi ghee", "kashmiri chilli",
  "teekha chilli", "jeera powder", "jeera whole", "cumin seeds", "coriander powder",
  "dhaniya powder", "garam masala", "mustard seeds", "kasuri methi", "chaat masala",
  "peanut butter", "tomato ketchup", "pasta sauce", "tender coconut water",
  "coconut water", "soft drinks", "cold drinks",

  // Single word items
  "paneer", "milk", "curd", "eggs", "egg", "butter", "ghee", "cheese",
  "bread", "tomatoes", "tomato", "potatoes", "potato", "onions", "onion",
  "cauliflower", "cabbage", "spinach", "palak", "methi", "carrots", "carrot",
  "cucumber", "lettuce", "apples", "apple", "bananas", "banana", "oranges",
  "orange", "pomegranate", "strawberries", "strawberry", "jamun", "broccoli",
  "mushroom", "capsicum", "brinjal", "baingan", "baigan", "karela", "lauki",
  "ghea", "tori", "thori", "pumpkin", "ginger", "garlic", "coriander",
  "dhaniya", "dania", "lemons", "lemon", "nimbu", "atta", "flour", "rice",
  "suji", "poha", "besan", "daliya", "noodles", "sugar", "salt", "tea",
  "coffee", "peanuts", "peanut", "groundnuts", "groundnut", "biscuits",
  "biscuit", "namkeen", "murmura", "kulcha", "stevia", "jaggery", "gur", "vinegar"
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
  if (n.includes("tomato")) return "Tomatoes";
  if (n.includes("cauliflower") || n.includes("gobi")) return "Cauliflower";
  if (n.includes("potato") || n.includes("aloo")) return "Potatoes";
  if (n.includes("onion")) return "Onions";
  if (n.includes("cucumber")) return "Cucumber";
  if (n.includes("lettuce")) return "Lettuce";
  if (n.includes("palak") || n.includes("spinach")) return "Spinach (Palak)";
  if (n.includes("bhindi") || n.includes("lady finger")) return "Lady Finger";
  if (n.includes("coriander") || n.includes("dhaniya")) return "Coriander (Dhaniya)";
  if (n.includes("bread")) return "Bread";
  if (n.includes("atta")) return "Atta";
  if (n.includes("rice")) return "Rice";
  if (n.includes("tea")) return "Tea Leaves";
  if (n.includes("sugar")) return "Sugar";
  return name;
}

/**
 * Predicts what items might be missing based on co-occurrence with already added items.
 * Only returns suggestions when items have actually been added!
 */
export function getMissingItemSuggestions(
  currentList: string[],
  lastAddedItem?: string | null
): CompanionSuggestion[] {
  // Never show suggestions on empty list - only when items have been added!
  if (!currentList || currentList.length === 0) {
    return [];
  }

  const currentLowerSet = new Set(currentList.map((x) => x.toLowerCase().trim()));
  const suggestionsMap = new Map<string, CompanionSuggestion>();

  // Helper to check if item is already in list
  const isAlreadyInList = (candidate: string) => {
    const cLower = candidate.toLowerCase();
    for (const inList of currentLowerSet) {
      if (inList.includes(cLower) || cLower.includes(inList)) {
        return true;
      }
    }
    return false;
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
          if (!isAlreadyInList(comp.companion)) {
            const isFromLastAdded = lastAddedItem && rawItem === lastAddedItem;
            const boost = isFromLastAdded ? 0.3 : 0;
            const effectiveConfidence = comp.confidence + boost;

            const existing = suggestionsMap.get(comp.companion);
            if (!existing || effectiveConfidence > existing.confidence) {
              suggestionsMap.set(comp.companion, {
                item: comp.companion,
                triggeredBy: rawItem,
                reason: `Usually ordered with ${rawItem} (${Math.round(comp.confidence * 100)}% of the time in past orders)`,
                confidence: effectiveConfidence
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
  if (hasProduceOrDairy && !isAlreadyInList("Cat Food") && !isAlreadyInList("Sheba")) {
    suggestionsMap.set("Cat Food (Sheba / Me-O)", {
      item: "Cat Food (Sheba / Me-O)",
      triggeredBy: "Samba & Milo",
      reason: "Cat food reminder for Samba & Milo",
      confidence: 0.65
    });
  }

  // Sort by confidence descending
  const sorted = Array.from(suggestionsMap.values()).sort((a, b) => b.confidence - a.confidence);
  return sorted.slice(0, 5);
}
