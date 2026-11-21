/**
 * Canonical match rules mapping raw variant, brand, or regional product names to canonical items.
 * Order matters: specific multi-word patterns precede general single words.
 * Single source of truth across ItemCatalog, OrderRecency, and all consumers.
 */
export const CANONICAL_MATCH_RULES: Array<[string, string[]]> = [
  // Produce
  ["Cherry Tomatoes", ["cherry tomato", "baby tomato"]],
  ["Tomatoes", ["tomato"]],
  [
    "Onions",
    ["onion", "pyaz", "eerulli", "shallot", "spring onion", "hara pyaz"],
  ],
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
  [
    "Lettuce / Salad Leaves",
    ["lettuce", "salad leave", "iceberg", "romaine", "arugula"],
  ],
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
  ["Brinjal / Eggplant", ["eggplant", "brinjal", "baingan", "aubergine"]],

  // Dairy, Bread & Eggs
  [
    "Fresh Paneer",
    ["paneer", "gowardhan", "malai paneer", "cottage cheese", "milky mist"],
  ],
  ["Buttermilk", ["buttermilk", "chaas", "chaach"]],
  [
    "Milk",
    [
      "milk",
      "nandini goodlife",
      "akshayakalpa",
      "heritage",
      "toned milk",
      "cow milk",
    ],
  ],
  ["Curd / Dahi", ["curd", "dahi"]],
  ["Eggs", ["egg", "eggs", "country egg", "white egg", "eggoz", "hen fruit"]],
  [
    "Bread",
    [
      "bread",
      "whole wheat bread",
      "white bread",
      "multigrain",
      "pav",
      "burger bun",
      "milk bread",
      "milk-bread",
      "milkbread",
      "brown bread",
      "sandwich bread",
      "keto bread",
    ],
  ],
  ["Butter", ["butter", "amul butter"]],
  ["Ghee", ["ghee", "desi ghee"]],
  ["Feta Cheese", ["feta", "feta cheese"]],
  ["Greek Yogurt", ["greek yogurt", "epigamia"]],
  ["Skyr", ["skyr"]],
  [
    "Cheese",
    [
      "cheese",
      "cheddar",
      "mozzarella",
      "cheese slice",
      "cheese slices",
      "shredded cheese",
      "cheese cubes",
      "cheddar slice",
    ],
  ],
  ["Fresh Cream", ["fresh cream", "amul fresh cream", "cooking cream"]],

  // Atta, Rice, Oil & Dals
  [
    "Atta / Wheat Flour",
    [
      "atta",
      "aashirvaad atta",
      "wheat flour",
      "chakki atta",
      "chakki fresh atta",
    ],
  ],
  ["Basmati Rice", ["basmati", "daawat", "india gate", "biryani rice"]],
  [
    "Sona Masoori Rice",
    ["sona masoori", "sona masuri", "raw rice", "boiled rice"],
  ],
  ["Rice", ["rice", "chawal"]],
  ["Masoor Dal", ["masoor"]],
  ["Toor Dal", ["toor dal", "arhar dal", "tuvar", "toor", "arhar"]],
  [
    "Moong Dal",
    [
      "moong dal",
      "yellow moong",
      "split moong",
      "moong dhuli",
      "moong chilka",
      "green moong",
    ],
  ],
  ["Chana Dal", ["chana dal", "bengal gram"]],
  ["White Chana", ["white chana", "safed chana", "kabuli chana", "chole"]],
  ["Black Chana", ["black chana", "kala chana"]],
  ["Rajma", ["rajma", "kidney beans"]],
  ["Besan", ["besan", "gram flour"]],
  ["Olive Oil", ["olive oil", "extra virgin olive oil"]],
  [
    "Cooking Oil",
    [
      "oil",
      "fortune sunlite",
      "sunflower oil",
      "mustard oil",
      "groundnut oil",
      "refined oil",
      "cooking oil",
    ],
  ],
  ["Poha", ["poha", "aval"]],
  ["Suji / Semolina", ["suji", "semolina", "rava"]],
  ["Vermicelli / Seviyan", ["vermicelli", "seviyan", "semiya"]],
  ["Oats", ["rolled oats", "instant oats", "quaker oats", "oats"]],
  ["Sugar", ["sugar", "cheeni", "shakar"]],
  ["Salt", ["salt", "tata salt", "namak", "rock salt"]],

  // Masalas & Spices
  [
    "Jeera / Cumin Seeds",
    [
      "jeera",
      "cumin",
      "zeera",
      "cumin seeds",
      "jeera whole",
      "zeera whole",
      "sabut jeera",
    ],
  ],
  ["Turmeric / Haldi", ["haldi", "turmeric"]],
  [
    "Red Chilli Powder",
    [
      "red chilli powder",
      "lal mirch powder",
      "chilli powder",
      "kashmiri mirch",
      "kashmiri chilli",
    ],
  ],
  ["Dhania / Coriander Powder", ["dhania powder", "coriander powder"]],
  ["Garam Masala", ["garam masala", "everest garam"]],
  ["Kitchen King Masala", ["kitchen king"]],
  ["Black Pepper", ["black pepper", "kali mirch", "pepper sprinkler"]],
  ["Chaat Masala", ["chaat masala", "chat masala"]],
  ["Mustard Seeds / Rai", ["mustard seed", "mustard seeds", "rai", "sarson"]],
  ["Cardamom", ["cardamom", "elaichi"]],
  ["Cinnamon", ["cinnamon", "dalchini"]],
  ["Cloves", ["clove", "laung"]],
  ["Ginger-Garlic Paste", ["ginger garlic paste", "adrak lehsun paste"]],

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

  // Tea, Coffee & Beverages
  ["Tea / Chai Patti", ["tea", "chai", "red label", "taj mahal", "tata tea"]],
  [
    "Coffee Powder",
    ["coffee", "nescafe", "bru", "instant coffee", "sleepy owl"],
  ],
  ["Stevia", ["stevia", "sugar free green"]],
  [
    "Coconut Water",
    ["coconut water", "tender coconut", "raw pressery coconut"],
  ],

  // Snacks & Munchies
  [
    "Biscuits / Cookies",
    [
      "biscuit",
      "cookie",
      "hide & seek",
      "bourbon",
      "marie light",
      "marie",
      "parle-g",
      "monaco",
      "krackjack",
      "good day",
    ],
  ],
  [
    "Roasted Peanuts",
    ["roasted peanut", "masala peanut", "salted peanut", "singdana"],
  ],
  ["Namkeen / Mixture", ["namkeen", "mixture", "bhujia", "sev"]],
  ["Popcorn", ["popcorn", "act ii"]],
  ["Crackers", ["cracker", "peanut cracker"]],
  ["Makhana", ["makhana", "fox nut", "foxnut", "lotus seeds"]],
  [
    "Dry Fruits & Nuts",
    [
      "almond",
      "badam",
      "cashew",
      "kaju",
      "walnut",
      "akhrot",
      "raisin",
      "kishmish",
      "dates",
      "khajoor",
      "khajur",
      "mixed dry fruit",
      "dry fruit mix",
    ],
  ],
  [
    "Potato Chips",
    ["potato chips", "chips", "crisps", "lays", "doritos", "bingo", "pringles"],
  ],
  ["Instant Noodles", ["maggi", "noodles", "yippee"]],

  // Pet Care & Household Essentials
  [
    "Cat Food",
    [
      "cat food",
      "whiskas",
      "sheba",
      "purina",
      "felix",
      "drools cat",
      "royal canin",
      "cat treat",
      "me-o",
    ],
  ],
  ["Cat Poop Bags", ["poop bag", "dog poop bag", "pet poop bag"]],
  ["Cat Litter", ["cat litter", "bentonite", "tofu litter"]],
  ["Dishwash Liquid", ["dishwash", "vim", "pril", "exo"]],
  [
    "Detergent",
    [
      "detergent",
      "surf excel",
      "ariel",
      "tide",
      "henko",
      "liquid detergent",
      "front load",
      "top load",
    ],
  ],
  ["Toilet Cleaner", ["harpic", "toilet cleaner", "sanifresh"]],
  ["Floor Cleaner", ["floor cleaner", "lizol", "nimyle"]],
  ["Colin / Glass Cleaner", ["colin", "glass cleaner"]],
  ["Handwash Liquid", ["handwash", "liquid handwash", "hand wash"]],
  ["Garbage Bags", ["garbage bag", "trash bag", "dustbin cover"]],
  ["Toilet Paper", ["toilet paper", "toilet roll", "toilet tissue roll"]],
  [
    "Kitchen Tissues / Paper Towels",
    [
      "kitchen towel",
      "kitchen roll",
      "tissue paper",
      "paper roll",
      "facial tissue",
      "kitchen wipe",
      "sponge wipe",
      "tissue",
      "napkin",
    ],
  ],
];

function matchesKeyword(text: string, kw: string): boolean {
  const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`(^|\\W)${escaped}(?:s|es)?(\\W|$)`, "i");
  return regex.test(text);
}

/**
 * Resolves any variant, brand, or raw item name to its normalized canonical identity.
 * 1. Checks exact canonical name match (case-insensitive).
 * 2. Checks whole-word keyword patterns, prioritizing the longest matching keyword.
 *    Ties are broken by the order of rules defined in CANONICAL_MATCH_RULES.
 */
export function matchCanonicalName(rawName: string): string | null {
  if (!rawName || typeof rawName !== "string") return null;
  const trimmed = rawName.trim();
  if (!trimmed) return null;
  const lower = trimmed.toLowerCase();

  // 1. Exact match against canonical name
  for (const [canon] of CANONICAL_MATCH_RULES) {
    if (canon.toLowerCase() === lower) {
      return canon;
    }
  }

  // 2. Keyword matching: longest matching whole-word keyword wins
  let bestMatch: {
    canon: string;
    keywordLength: number;
    ruleIndex: number;
  } | null = null;

  for (
    let ruleIndex = 0;
    ruleIndex < CANONICAL_MATCH_RULES.length;
    ruleIndex++
  ) {
    const [canon, keywords] = CANONICAL_MATCH_RULES[ruleIndex];
    for (const kw of keywords) {
      if (matchesKeyword(lower, kw)) {
        if (!bestMatch || kw.length > bestMatch.keywordLength) {
          bestMatch = { canon, keywordLength: kw.length, ruleIndex };
        }
      }
    }
  }

  return bestMatch ? bestMatch.canon : null;
}
