import patternRulesRaw from "../../data/pattern_rules.json";
import categorySectionsRaw from "../../data/category_sections.json";
import { calculateItemLastOrdered } from "./orderRecency";
import {
  calculateItemCadence,
  calculateReplenishmentScore,
  ReplenishmentStatus,
} from "./replenishment";
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
  companions: Record<
    string,
    Array<{ companion: string; co_count: number; confidence: number }>
  >;
  staple_intervals: Record<
    string,
    {
      total_purchases: number;
      typical_interval_days: number;
      last_ordered: string;
    }
  >;
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

export const patternRules: PatternRules =
  patternRulesRaw as unknown as PatternRules;
export const CATEGORY_SECTIONS: CategorySection[] =
  categorySectionsRaw as unknown as CategorySection[];

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
  "Other Items": "🛒",
};

export const CATEGORY_ORDER = [
  "Fruits & Vegetables",
  "Dairy, Bread & Eggs",
  "Atta, Rice, Oil & Dals",
  "Masala & Dry Fruits",
  "Breakfast & Sauces",
  "Tea, Coffee & Drinks",
  "Tea, Coffee & Beverages",
  "Munchies & Biscuits",
  "Munchies & Snacks",
  "Pet Care & Household",
  "Other Items",
];

export interface ItemVisual {
  imageUrl?: string;
  icon: string;
}

// Flat lookup cache for catalog items & categories
const CATALOG_ITEMS: CategoryItemDef[] = [];
const CATALOG_MAP = new Map<string, CategoryItemDef>();
const ITEM_TO_CATEGORY_MAP: Record<string, string> = {};

CATEGORY_SECTIONS.forEach((cat) => {
  cat.items.forEach((it) => {
    CATALOG_ITEMS.push(it);
    CATALOG_MAP.set(it.name.toLowerCase().trim(), it);
    it.name.split("/").forEach((p) => {
      CATALOG_MAP.set(p.trim().toLowerCase(), it);
    });
    ITEM_TO_CATEGORY_MAP[it.name.toLowerCase()] = cat.name;
  });
});

// Canonical alias dictionary with word-boundary matching.
// Specific disambiguations placed first to avoid false positives.
const ITEM_ALIASES: Array<[string[], string]> = [
  // Disambiguations first (more specific)
  [["cherry tomato", "cherry tomatoes", "baby tomato"], "Cherry Tomatoes"],
  [["peanut butter"], "Peanut Butter"],
  [["olive oil", "extra virgin olive oil"], "Olive Oil"],
  [["coconut milk", "almond milk", "soya milk", "oat milk"], "Milk"],
  [
    [
      "red chilli powder",
      "lal mirch",
      "kashmiri mirch",
      "chilli powder",
      "deggi mirch",
      "teekha lal",
    ],
    "Red Chilli Powder",
  ],
  [
    ["green chilli", "green chillies", "green chili", "hari mirch"],
    "Green Chillies",
  ],
  [["spring onion", "hara pyaz"], "Onions"],
  [
    [
      "kitchen roll",
      "kitchen towel",
      "paper towel",
      "paper towels",
      "paper roll",
    ],
    "Kitchen Roll",
  ],
  [["toilet paper", "toilet roll", "toilet tissue"], "Toilet Paper"],
  [["glass cleaner", "colin"], "Colin / Glass Cleaner"],
  [["floor cleaner", "lizol"], "Floor Cleaner"],
  [["eggplant", "brinjal", "baingan", "aubergine"], "Brinjal / Eggplant"],

  // Single word & standard staples
  [["egg", "eggs", "anda", "ande", "white egg", "country egg"], "Eggs"],
  [["raisin", "raisins", "kishmish"], "Raisins"],
  [
    [
      "mustard seed",
      "mustard seeds",
      "sarson",
      "rai",
      "sarso",
      "black mustard",
    ],
    "Mustard Seeds",
  ],
  [
    ["atta", "wheat flour", "gehun ka atta", "gehu", "chakki atta"],
    "Wheat Flour / Atta",
  ],
  [
    [
      "cooking oil",
      "sunflower oil",
      "mustard oil",
      "groundnut oil",
      "refined oil",
      "oil",
    ],
    "Cooking Oil",
  ],
  [["butter", "makkhan", "makhan"], "Butter"],
  [["ghee", "desi ghee", "cow ghee"], "Ghee"],
  [["milk", "doodh", "toned milk", "cow milk"], "Milk"],
  [
    ["bread", "pav", "bun", "sliced bread", "brown bread", "white bread"],
    "Bread",
  ],
  [["salt", "namak", "sendha namak", "rock salt", "pink salt"], "Salt"],
  [["tomato", "tomatoes", "tamatar"], "Tomatoes"],
  [["onion", "onions", "pyaz", "pyaaz"], "Onions"],
  [["potato", "potatoes", "aloo", "batata"], "Potatoes"],
  [["chilli", "chillies", "mirch", "mirchi"], "Green Chillies"],
  [
    [
      "coriander",
      "coriander leaves",
      "dhaniya",
      "dhania",
      "kothmir",
      "cilantro",
    ],
    "Coriander",
  ],
  [["coriander powder", "dhaniya powder", "dhania powder"], "Coriander Powder"],
  [["ginger", "adrak"], "Ginger"],
  [["garlic", "lehsun", "lahsun"], "Garlic"],
  [["turmeric", "haldi", "turmeric powder", "haldi powder"], "Turmeric"],
  [["jeera", "cumin", "cumin seeds", "zeera"], "Cumin Seeds"],
  [["jeera powder", "cumin powder"], "Cumin / Jeera"],
  [["cardamom", "elaichi", "green cardamom"], "Cardamom"],
  [["cinnamon", "dalchini", "cinnamon stick", "cinnamon sticks"], "Cinnamon"],
  [["clove", "cloves", "laung", "lavang"], "Cloves"],
  [["banana", "bananas", "kela", "yelakki", "robusta"], "Bananas"],
  [["apple", "apples", "seb"], "Apples"],
  [["cucumber", "kheera", "kakdi"], "Cucumber"],
  [["palak", "spinach"], "Palak / Spinach"],
  [["cauliflower", "gobi", "phool gobi"], "Cauliflower"],
  [["cabbage", "patta gobi"], "Cabbage"],
  [["capsicum", "shimla mirch", "bell pepper"], "Capsicum"],
  [["lemon", "lemons", "nimbu", "lime"], "Lemons"],
  [["bhindi", "bindi", "okra", "lady finger"], "Lady Finger / Bhindi"],
  [["lauki", "bottle gourd", "doodhi", "ghea"], "Lauki / Bottle Gourd"],
  [["tori", "thori", "turai", "ridge gourd"], "Ridge Gourd / Tori"],
  [["french beans", "beans", "haricot"], "French Beans"],
  [["lettuce", "iceberg", "salad leaves", "romaine"], "Lettuce / Salad Leaves"],
  [["mushroom", "mushrooms", "button mushroom"], "Mushrooms"],
  [["pomegranate", "anar"], "Pomegranate"],
  [["orange", "mandarin", "santra", "kinnow"], "Mandarin Orange"],
  [["kiwi"], "Kiwi"],
  [["tea", "chai", "chai patti"], "Tea"],
  [["coffee", "nescafe", "bru", "instant coffee"], "Coffee"],
  [["rice", "basmati", "chawal"], "Rice"],
  [["paneer", "cottage cheese"], "Fresh Paneer"],
  [["dahi", "curd", "yogurt"], "Curd / Dahi"],
  [["chips", "potato chips", "lays", "wafers"], "Chips"],
  [["biscuit", "biscuits", "cookie", "cookies", "parle g", "rusk"], "Biscuits"],
  [["tissue", "tissues", "napkin", "napkins", "tissue paper"], "Tissues"],
  [["dishwash", "vim", "pril", "exo"], "Dishwash"],
  [
    ["detergent", "surf excel", "ariel", "tide", "washing powder"],
    "Laundry Detergent",
  ],
  [["almond", "almonds", "badam"], "Almonds"],
  [["cashew", "cashews", "kaju"], "Cashews"],
  [["walnut", "walnuts", "akhrot"], "Walnuts"],
  [["date", "dates", "khajur", "khajoor"], "Dates"],
  [["makhana", "foxnuts", "foxnut", "lotus seeds"], "Foxnuts / Makhana"],
  [["peanut", "peanuts", "roasted peanuts", "singdana"], "Roasted Peanuts"],
  [["namkeen", "mixture", "bhujia", "sev"], "Namkeen / Mixture"],
  [["popcorn"], "Popcorn"],
  [["jam", "fruit jam"], "Jam"],
  [["ketchup", "tomato ketchup"], "Ketchup"],
  [["mayo", "mayonnaise"], "Mayonnaise"],
  [["honey", "madhu", "shahad"], "Honey"],
  [["cat food", "whiskas", "sheba"], "Cat Food"],
  [["stevia"], "Stevia"],
  [["pasta sauce"], "Pasta Sauce"],
  [["hot sauce", "sriracha"], "Hot Sauce"],
  [["soy sauce", "soya sauce"], "Soy Sauce"],
  [["chutney"], "Chutney"],
  [["batter", "dosa batter", "idli batter"], "Dosa & Idli Batter"],
  [["poha", "aval"], "Poha"],
  [["suji", "sooji", "rava", "semolina"], "Suji / Semolina"],
  [["oats", "rolled oats"], "Oats"],
  [["sugar", "cheeni", "shakar"], "Sugar"],
  [["besan", "gram flour"], "Besan"],
  [["rajma", "kidney beans"], "Rajma"],
  [["masoor", "masoor dal"], "Masoor Dal"],
  [["moong", "moong dal"], "Moong Dal"],
  [["toor dal", "arhar dal"], "Toor / Arhar Dal"],
  [["chana dal"], "Chana Dal"],
  [["white chana", "kabuli chana", "chole"], "White Chana"],
  [["black chana", "kala chana"], "Black Chana"],
];

/**
 * Resolves product image and icon for an item name by matching against catalog with aliases & fuzzy matches
 */
export function getItemVisual(
  itemName: string,
  categoryName?: string
): ItemVisual {
  if (!itemName) {
    const fallbackCat = categoryName || "Other Items";
    return { icon: CATEGORY_ICONS[fallbackCat] || "🛒" };
  }

  const clean = itemName.toLowerCase().trim();

  // 1. Direct exact match against catalog items and subparts
  const exact = CATALOG_MAP.get(clean);
  if (exact) {
    return { imageUrl: exact.imageUrl, icon: exact.icon || "🛒" };
  }

  // 2. Alias match with word boundary
  for (const [kwList, target] of ITEM_ALIASES) {
    for (const kw of kwList) {
      const reg = new RegExp(
        `\\b${kw.replace(/[-\\/\\\\^$*+?.()|[\\]{}]/g, "\\$&")}\\b`,
        "i"
      );
      if (reg.test(clean)) {
        const cat = CATALOG_MAP.get(target.toLowerCase());
        if (cat) {
          return { imageUrl: cat.imageUrl, icon: cat.icon || "🛒" };
        }
      }
    }
  }

  // 3. Word-boundary match against catalog item names & parts (no accidental substring overlaps)
  for (const catItem of CATALOG_ITEMS) {
    const parts = catItem.name.split("/").map((p) => p.trim().toLowerCase());
    for (const p of parts) {
      if (p.length > 2) {
        const reg = new RegExp(
          `\\b${p.replace(/[-\\/\\\\^$*+?.()|[\\]{}]/g, "\\$&")}\\b`,
          "i"
        );
        if (reg.test(clean)) {
          return { imageUrl: catItem.imageUrl, icon: catItem.icon || "🛒" };
        }
      }
    }
  }

  // 4. Fallback to category icon
  const cat = categoryName || detectCategory(itemName) || "Other Items";
  const catIcon = CATEGORY_ICONS[cat] || "🛒";
  return { icon: catIcon };
}

export function detectCategory(itemName: string): string {
  const clean = itemName.trim().toLowerCase();

  // 1. Alias lookup with word boundaries (handles Egg vs Eggplant, Rai vs Raisins, etc.)
  for (const [aliases, target] of ITEM_ALIASES) {
    for (const a of aliases) {
      const reg = new RegExp(
        `\\b${a.replace(/[-\\/\\\\^$*+?.()|[\\]{}]/g, "\\$&")}\\b`,
        "i"
      );
      if (reg.test(clean)) {
        const cat = ITEM_TO_CATEGORY_MAP[target.toLowerCase()];
        if (cat) return cat;
      }
    }
  }

  // 2. Exact match from canonical catalog
  if (ITEM_TO_CATEGORY_MAP[clean]) {
    return ITEM_TO_CATEGORY_MAP[clean];
  }

  // 3. Word-boundary match against catalog items
  for (const catItem of CATALOG_ITEMS) {
    const parts = catItem.name.split("/").map((p) => p.trim().toLowerCase());
    for (const p of parts) {
      if (p.length > 2) {
        const reg = new RegExp(
          `\\b${p.replace(/[-\\/\\\\^$*+?.()|[\\]{}]/g, "\\$&")}\\b`,
          "i"
        );
        if (reg.test(clean)) {
          const cat = ITEM_TO_CATEGORY_MAP[catItem.name.toLowerCase()];
          if (cat) return cat;
        }
      }
    }
  }

  // 4. Keyword heuristics with word boundaries to prevent substring bleed
  const testWords = (words: string[]) => {
    return words.some((w) => {
      const reg = new RegExp(
        `\\b${w.replace(/[-\\/\\\\^$*+?.()|[\\]{}]/g, "\\$&")}`,
        "i"
      );
      return reg.test(clean);
    });
  };

  if (
    testWords([
      "paneer",
      "milk",
      "curd",
      "cheese",
      "dahi",
      "egg",
      "eggs",
      "anda",
      "butter",
      "batter",
      "bread",
      "pav",
      "yogurt",
      "cream",
    ])
  ) {
    return "Dairy, Bread & Eggs";
  }

  if (
    testWords([
      "gobi",
      "palak",
      "spinach",
      "methi",
      "bhindi",
      "bindi",
      "okra",
      "lady finger",
      "onion",
      "tomato",
      "potato",
      "chilli",
      "mirch",
      "carrot",
      "beans",
      "cucumber",
      "lettuce",
      "lauki",
      "ghea",
      "tori",
      "thori",
      "brinjal",
      "baingan",
      "eggplant",
      "badanekaayi",
      "fruit",
      "apple",
      "banana",
      "lemon",
      "nimbu",
      "ginger",
      "adrak",
      "garlic",
      "lehsun",
      "avocado",
      "orange",
      "pomegranate",
      "grapes",
      "watermelon",
    ])
  ) {
    return "Fruits & Vegetables";
  }

  if (
    testWords([
      "atta",
      "flour",
      "dal",
      "daal",
      "rice",
      "oil",
      "ghee",
      "rajma",
      "chana",
      "besan",
      "poha",
      "suji",
      "sooji",
      "rava",
      "maida",
    ])
  ) {
    return "Atta, Rice, Oil & Dals";
  }

  if (
    testWords([
      "salt",
      "sugar",
      "jeera",
      "haldi",
      "garam masala",
      "hing",
      "kaju",
      "badam",
      "peanut",
      "peanuts",
      "spice",
      "spices",
      "clove",
      "cinnamon",
      "elaichi",
      "cardamom",
      "cashew",
      "almond",
      "walnut",
      "pista",
      "mustard seed",
      "rai",
    ])
  ) {
    return "Masala & Dry Fruits";
  }

  if (
    testWords([
      "tea",
      "chai",
      "coffee",
      "juice",
      "coconut water",
      "coke",
      "soda",
      "drink",
      "beverage",
    ])
  ) {
    return "Tea, Coffee & Drinks";
  }

  if (
    testWords([
      "oat",
      "oats",
      "flake",
      "flakes",
      "honey",
      "jam",
      "ketchup",
      "sauce",
      "muesli",
      "cereal",
      "mayo",
      "mayonnaise",
    ])
  ) {
    return "Breakfast & Sauces";
  }

  if (
    testWords([
      "biscuit",
      "biscuits",
      "cookie",
      "cookies",
      "chip",
      "chips",
      "namkeen",
      "makhana",
      "chocolate",
      "noodle",
      "noodles",
      "pasta",
      "snack",
      "snacks",
      "popcorn",
    ])
  ) {
    return "Munchies & Biscuits";
  }

  if (
    testWords([
      "cat food",
      "sheba",
      "me-o",
      "poop bag",
      "cat litter",
      "dishwash",
      "detergent",
      "tissue",
      "toilet roll",
      "toilet paper",
      "kitchen roll",
      "garbage",
      "cleaner",
      "soap",
      "shampoo",
      "scrub",
    ])
  ) {
    return "Pet Care & Household";
  }

  return "Other Items";
}

// Comprehensive household vocabulary for multi-item continuous speech segmenting
const GROCERY_VOCABULARY = [
  // Multi-word produce & staples (must match first)
  "cherry tomatoes",
  "french beans",
  "lady finger",
  "bottle gourd",
  "ridge gourd",
  "mandarin orange",
  "salad leaves",
  "green chillies",
  "feta cheese",
  "greek yogurt",
  "fresh paneer",
  "fresh cream",
  "milk bread",
  "keto bread",
  "wheat flour",
  "basmati rice",
  "sona masuri",
  "sona masoori",
  "masoor dal",
  "moong dal",
  "toor dal",
  "arhar dal",
  "chana dal",
  "white chana",
  "black chana",
  "cooking oil",
  "olive oil",
  "red chilli powder",
  "kashmiri chilli",
  "coriander powder",
  "garam masala",
  "kitchen king masala",
  "black pepper",
  "chaat masala",
  "mustard seeds",
  "cumin seeds",
  "dry fruits",
  "mixed dry fruits",
  "ginger garlic paste",
  "peanut butter",
  "pasta sauce",
  "hot sauce",
  "soy sauce",
  "sleepy owl",
  "roasted peanuts",
  "cat food",
  "cat poop bags",
  "toilet paper",
  "kitchen roll",
  "glass cleaner",
  "laundry detergent",
  "floor cleaner",
  "handwash liquid",
  "facial tissues",
  "dosa batter",
  "idli batter",
  "cheddar cheese",
  "shredded cheese",
  "bharta brinjal",
  "purple brinjal",

  // Single word items
  "tomatoes",
  "tomato",
  "onions",
  "onion",
  "bananas",
  "banana",
  "potatoes",
  "potato",
  "cauliflower",
  "gobi",
  "carrots",
  "carrot",
  "cucumber",
  "palak",
  "spinach",
  "lemons",
  "lemon",
  "coriander",
  "dhaniya",
  "garlic",
  "apples",
  "apple",
  "lettuce",
  "ginger",
  "capsicum",
  "cabbage",
  "bhindi",
  "tori",
  "lauki",
  "broccoli",
  "mushrooms",
  "mushroom",
  "brinjal",
  "baingan",
  "eggplant",
  "pomegranate",
  "kiwi",
  "milk",
  "paneer",
  "curd",
  "dahi",
  "eggs",
  "egg",
  "butter",
  "ghee",
  "buttermilk",
  "skyr",
  "cheese",
  "bread",
  "atta",
  "rice",
  "rajma",
  "besan",
  "poha",
  "suji",
  "semolina",
  "vermicelli",
  "seviyan",
  "oats",
  "sugar",
  "salt",
  "turmeric",
  "cumin",
  "jeera",
  "cardamom",
  "cinnamon",
  "cloves",
  "almonds",
  "cashews",
  "walnuts",
  "raisins",
  "dates",
  "makhana",
  "foxnuts",
  "jam",
  "ketchup",
  "mayonnaise",
  "chutney",
  "honey",
  "tea",
  "coffee",
  "stevia",
  "namkeen",
  "mixture",
  "biscuits",
  "chips",
  "popcorn",
  "crackers",
  "dishwash",
  "tissues",
];

// Sort descending by length for greedy longest match
GROCERY_VOCABULARY.sort((a, b) => b.length - a.length);

/**
 * Parses freeform natural language text from WhatsApp or voice input into structured individual items
 */
export function parseNaturalLanguageList(input: string): string[] {
  if (!input || !input.trim()) return [];

  // 1. Remove WhatsApp metadata like [15/12/25, 7:31:07 AM] Lira Suri:
  let text = input.replace(
    /\[\d{1,2}\/\d{1,2}\/\d{2,4}[^\]]*\]\s*[^:]+:\s*/g,
    " "
  );

  // 2. Remove conversational introductory phrases (especially common in voice input)
  text = text.replace(
    /^(?:we need|i need|can you get|please order|order|please get|can you please get|get me|get|buy|please buy|bring)\s+/gi,
    ""
  );
  text = text.replace(
    /(?:need vegetables|please order|also order|can you get|order for me|get me)\s*:/gi,
    " "
  );

  // 3. Normalize spoken conjunctions into delimiters: "and", "then", "also", "plus", "with"
  text = text.replace(/\b(?:and|then|also|plus|with|as well as)\b/gi, ",");

  // 4. Split by explicit delimiters: newlines, commas, semicolons
  const rawChunks = text
    .split(/[\n,;+]+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 2 && !/^(also|some|etc|ok|yes|no)$/i.test(s));

  const finalItems: string[] = [];

  // 5. Intelligent chunk segmentation (handles spoken continuous items with NO commas, e.g. "paneer tomatoes curd milk")
  const escapedVocab = GROCERY_VOCABULARY.map((v) =>
    v.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  );
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
        if (
          !finalItems.some(
            (it) => it.toLowerCase() === capitalized.toLowerCase()
          )
        ) {
          finalItems.push(capitalized);
        }
      });
    } else {
      // Single item or item with quantity (e.g. "2 packets milk", "1 kg potatoes")
      let clean = chunk.replace(/^[\d\s*x.-]+/, "").trim();
      // Remove filler words like "some", "a packet of", "kg of"
      clean = clean
        .replace(/^(?:some|a packet of|packet of|kg of|box of)\s+/gi, "")
        .trim();

      if (clean.length >= 2) {
        const capitalized = clean.charAt(0).toUpperCase() + clean.slice(1);
        if (
          !finalItems.some(
            (it) => it.toLowerCase() === capitalized.toLowerCase()
          )
        ) {
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
  if (n.includes("bhindi") || n.includes("lady finger"))
    return "Lady Finger / Bhindi";
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

  const currentLowerSet = new Set(
    currentList.map((x) => x.toLowerCase().trim())
  );
  const excludedLowerSet = new Set(
    (excludedItems || []).map((x) => x.toLowerCase().trim())
  );
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
    return (
      isAlreadyInList(candidate) ||
      isAlreadyExcluded(candidate) ||
      isAlreadyInActiveOrder(candidate)
    );
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
            const replenishmentScore = calculateReplenishmentScore(
              cadence,
              effectiveConfidence
            );

            const existing = suggestionsMap.get(comp.companion);
            if (!existing || replenishmentScore > existing.confidence) {
              const recencyText =
                calculateItemLastOrdered(comp.companion, orders) || undefined;
              suggestionsMap.set(comp.companion, {
                item: comp.companion,
                triggeredBy: rawItem,
                reason: `Usually ordered with ${rawItem} (${Math.round(comp.confidence * 100)}% of the time in past orders)`,
                confidence: replenishmentScore,
                lastOrderedText: recencyText,
                cadenceText: cadence.uiCadenceText,
                dueText: cadence.uiDueText,
                replenishmentStatus: cadence.replenishmentStatus,
                daysUntilDue: cadence.daysUntilDue,
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
    const recencyText =
      calculateItemLastOrdered("Cat Food", orders) || undefined;

    suggestionsMap.set("Cat Food", {
      item: "Cat Food",
      triggeredBy: "Samba & Milo",
      reason: "Cat food reminder for Samba & Milo",
      confidence: catFoodScore,
      lastOrderedText: recencyText,
      cadenceText: catFoodCadence.uiCadenceText,
      dueText: catFoodCadence.uiDueText,
      replenishmentStatus: catFoodCadence.replenishmentStatus,
      daysUntilDue: catFoodCadence.daysUntilDue,
    });
  }

  // Sort by replenishment-adjusted confidence descending
  const sorted = Array.from(suggestionsMap.values()).sort(
    (a, b) => b.confidence - a.confidence
  );
  return sorted.slice(0, 5);
}
