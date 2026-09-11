import unifiedOrdersRaw from "../../data/unified_orders.json";

export interface OrderItem {
  name: string;
  quantity?: number;
  price?: number;
  [key: string]: any;
}

export interface HistoricalOrder {
  order_id?: string;
  id?: string;
  status?: string;
  placed_at?: string;
  order_date?: string;
  delivery_date?: string;
  delivered_at?: string;
  created_at?: string;
  items?: OrderItem[];
  [key: string]: any;
}

/**
 * Keyword match rules mapping raw variant / brand / order product names to canonical items.
 * Order matters: specific multi-word patterns precede general words.
 */
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
  ["Eggs", ["egg", "eggoz", "hen fruit"]],
  ["Butter", ["butter", "amul butter"]],
  ["Ghee", ["ghee", "desi ghee"]],
  ["Feta Cheese", ["feta", "feta cheese"]],
  ["Buttermilk", ["buttermilk", "chaas"]],
  ["Greek Yogurt", ["greek yogurt"]],
  ["Skyr", ["skyr"]],
  ["Cheese", ["cheese", "cheddar", "mozzarella", "cheese slices", "shredded cheese", "cheese cubes"]],
  ["Bread", ["bread", "milk bread", "brown bread", "whole wheat bread", "sandwich bread", "keto bread", "pav"]],
  ["Fresh Cream", ["fresh cream", "amul fresh cream", "cooking cream"]],

  // Atta, Rice, Oil & Dals
  ["Wheat Flour / Atta", ["atta", "wheat flour", "chakki fresh atta"]],
  ["Rice", ["basmati", "sona masoori", "sona masuri", "rice", "chawal"]],
  ["Masoor Dal", ["masoor"]],
  ["Moong Dal", ["moong dal", "moong dhuli", "moong chilka", "green moong", "yellow moong"]],
  ["Toor / Arhar Dal", ["toor", "arhar", "tuvar"]],
  ["Chana Dal", ["chana dal"]],
  ["White Chana", ["white chana", "safed chana", "kabuli chana", "chole"]],
  ["Black Chana", ["black chana", "kala chana"]],
  ["Rajma", ["rajma", "kidney beans"]],
  ["Besan", ["besan", "gram flour"]],
  ["Cooking Oil", ["sunflower oil", "mustard oil", "cooking oil", "groundnut oil", "refined oil"]],
  ["Olive Oil", ["olive oil", "extra virgin olive oil"]],
  ["Poha", ["poha", "aval"]],
  ["Suji / Semolina", ["suji", "semolina", "rava"]],
  ["Vermicelli / Seviyan", ["vermicelli", "seviyan", "semiya"]],
  ["Oats", ["rolled oats", "instant oats", "quaker oats", "oats"]],
  ["Sugar", ["sugar", "cheeni"]],

  // Masala & Dry Fruits
  ["Salt", ["salt", "namak", "rock salt"]],
  ["Turmeric", ["turmeric", "haldi"]],
  ["Red Chilli Powder", ["red chilli powder", "chilli powder", "kashmiri mirch", "kashmiri chilli"]],
  ["Coriander Powder", ["coriander powder", "dhaniya powder"]],
  ["Cumin Seeds", ["cumin seeds", "jeera whole", "zeera whole", "sabut jeera"]],
  ["Cumin / Jeera", ["cumin", "jeera", "zeera"]],
  ["Garam Masala", ["garam masala"]],
  ["Kitchen King Masala", ["kitchen king"]],
  ["Black Pepper", ["black pepper", "kali mirch", "pepper sprinkler"]],
  ["Chaat Masala", ["chaat masala", "chat masala"]],
  ["Mustard Seeds", ["mustard seeds", "rai"]],
  ["Cardamom", ["cardamom", "elaichi"]],
  ["Cinnamon", ["cinnamon", "dalchini"]],
  ["Cloves", ["clove", "laung"]],
  ["Almonds", ["almond", "badam"]],
  ["Cashews", ["cashew", "kaju"]],
  ["Walnuts", ["walnut", "akhrot"]],
  ["Raisins", ["raisin", "kishmish"]],
  ["Dates", ["dates", "khajoor", "khajur"]],
  ["Mixed Dry Fruits", ["mixed dry fruit", "dry fruit mix"]],
  ["Ginger-Garlic Paste", ["ginger garlic paste", "adrak lehsun paste"]],
  ["Foxnuts / Makhana", ["makhana", "foxnut"]],

  // Breakfast & Sauces
  ["Dosa & Idli Batter", ["dosa batter", "idli batter", "idli & dosa batter"]],
  ["Jam", ["jam", "kissan jam", "fruit jam"]],
  ["Peanut Butter", ["peanut butter"]],
  ["Ketchup", ["ketchup", "tomato ketchup"]],
  ["Mayonnaise", ["mayonnaise", "mayo"]],
  ["Chutney", ["chutney", "mint chutney", "green chutney"]],
  ["Pasta Sauce", ["pasta sauce", "pizza sauce"]],
  ["Hot Sauce", ["hot sauce", "sriracha", "chilli sauce"]],
  ["Soy Sauce", ["soy sauce", "soya sauce"]],
  ["Honey", ["honey"]],

  // Tea, Coffee & Drinks
  ["Tea", ["tea", "chai", "tata tea", "red label"]],
  ["Coffee", ["coffee", "sleepy owl", "nescafe"]],
  ["Stevia", ["stevia", "sugar free green"]],

  // Munchies & Biscuits
  ["Roasted Peanuts", ["roasted peanut", "masala peanut", "salted peanut", "singdana"]],
  ["Namkeen / Mixture", ["namkeen", "mixture", "bhujia", "sev"]],
  ["Biscuits", ["biscuit", "cookie", "marie", "parle-g", "monaco"]],
  ["Chips", ["chips", "crisps", "lays", "bingo", "doritos"]],
  ["Popcorn", ["popcorn", "act ii"]],
  ["Crackers", ["cracker", "peanut cracker"]],

  // Pet Care & Household
  ["Cat Food", ["cat food", "sheba", "me-o", "whiskas", "drools cat"]],
  ["Cat Poop Bags", ["poop bag", "dog poop bag", "pet poop bag"]],
  ["Toilet Paper", ["toilet paper", "toilet roll", "toilet tissue roll"]],
  ["Kitchen Roll", ["kitchen roll", "kitchen towel", "kitchen wipe", "sponge wipe"]],
  ["Colin / Glass Cleaner", ["colin", "glass cleaner"]],
  ["Dishwash", ["dishwash", "vim", "exo", "pril"]],
  ["Laundry Detergent", ["detergent", "surf excel", "ariel", "tide", "henko"]],
  ["Floor Cleaner", ["floor cleaner", "lizol", "nimyle"]],
  ["Handwash Liquid", ["handwash", "liquid handwash", "hand wash"]],
  ["Tissues", ["tissue", "napkin", "facial tissue"]]
];

const CANONICAL_NAMES_SET = new Set(CANONICAL_MATCH_RULES.map(([canon]) => canon.toLowerCase()));

/**
 * Maps any variant/brand or raw item name to its normalized canonical identity.
 */
export function toCanonicalItemName(rawName: string): string | null {
  if (!rawName || !rawName.trim()) return null;
  const trimmed = rawName.trim();
  const lower = trimmed.toLowerCase();

  // If already an exact canonical name
  for (const [canon] of CANONICAL_MATCH_RULES) {
    if (canon.toLowerCase() === lower) {
      return canon;
    }
  }

  // Match keywords
  for (const [canon, keywords] of CANONICAL_MATCH_RULES) {
    for (const kw of keywords) {
      if (lower.includes(kw)) {
        return canon;
      }
    }
  }

  return null;
}

/**
 * Checks whether an order is a valid delivered/completed order.
 * Ignores cancelled, returned, or failed orders.
 */
export function isValidDeliveredOrder(order: HistoricalOrder): boolean {
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
export function extractOrderDate(order: HistoricalOrder): string | null {
  const d = order.placed_at || order.order_date || order.delivery_date || order.delivered_at || order.created_at;
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

  const diffDays = Math.round((startOfNow - startOfOrder) / (1000 * 60 * 60 * 24));

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

// Pre-index the latest valid order date for each canonical item from historical orders
const DEFAULT_HISTORICAL_ORDERS: HistoricalOrder[] = unifiedOrdersRaw as unknown as HistoricalOrder[];

const PRECOMPUTED_LATEST_DATES: Map<string, Date> = new Map();

for (const order of DEFAULT_HISTORICAL_ORDERS) {
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
  orders?: HistoricalOrder[],
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
  const latest = PRECOMPUTED_LATEST_DATES.get(canon);
  if (!latest) return null;
  return formatOrderRecency(latest, now);
}
