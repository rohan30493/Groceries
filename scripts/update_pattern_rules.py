import json
import os
import re
from collections import defaultdict
from itertools import combinations
from datetime import datetime

# Load orders & chats
with open("data/unified_orders.json", "r", encoding="utf-8") as f:
    orders = json.load(f)

with open("data/category_sections.json", "r", encoding="utf-8") as f:
    category_sections = json.load(f)

# Build a list of all canonical items with their category
CANONICAL_ITEMS = []
for sec in category_sections:
    for it in sec["items"]:
        CANONICAL_ITEMS.append((it["name"], sec["name"]))

# Keyword mapping to canonical items
MATCH_RULES = [
    # Produce
    ("Cherry Tomatoes", ["cherry tomato", "baby tomato"]),
    ("Tomatoes", ["tomato"]),
    ("Onions", ["onion", "pyaz", "eerulli", "shallot"]),
    ("Bananas", ["banana", "yelakki", "yellaki", "robusta"]),
    ("Potatoes", ["potato", "aloo", "batata"]),
    ("Cauliflower", ["cauliflower", "gobi"]),
    ("Carrots", ["carrot", "gajar"]),
    ("Cucumber", ["cucumber", "kheera", "kakdi"]),
    ("Palak / Spinach", ["palak", "spinach"]),
    ("Lemons", ["lemon", "nimbu", "lime"]),
    ("Coriander", ["coriander", "dhaniya", "dhania", "kothmir"]),
    ("Garlic", ["garlic", "lehsun", "lahsun"]),
    ("Apples", ["apple", "seb"]),
    ("Lettuce / Salad Leaves", ["lettuce", "salad leave", "iceberg", "romaine", "arugula"]),
    ("Ginger", ["ginger", "adrak"]),
    ("Capsicum", ["capsicum", "bell pepper", "shimla mirch"]),
    ("Cabbage", ["cabbage", "patta gobi"]),
    ("Lady Finger / Bhindi", ["lady finger", "bhindi", "bindi", "okra"]),
    ("Ridge Gourd / Tori", ["ridge gourd", "tori", "thori", "turai"]),
    ("Lauki / Bottle Gourd", ["bottle gourd", "lauki", "ghea", "doodhi"]),
    ("Broccoli", ["broccoli"]),
    ("Mushrooms", ["mushroom"]),
    ("Green Chillies", ["green chilli", "green chili", "hari mirch"]),
    ("French Beans", ["french bean", "haricot", "green beans"]),
    ("Pomegranate", ["pomegranate", "anar"]),
    ("Mandarin Orange", ["mandarin", "orange mini mandarin", "kinnow", "santra"]),
    ("Kiwi", ["kiwi"]),

    # Dairy, Bread & Eggs
    ("Fresh Paneer", ["paneer", "gowardhan", "malai paneer", "cottage cheese"]),
    ("Milk", ["milk", "nandini goodlife", "akshayakalpa", "heritage", "toned milk", "cow milk"]),
    ("Curd / Dahi", ["curd", "dahi"]),
    ("Eggs", ["egg", "eggoz", "hen fruit"]),
    ("Butter", ["butter", "amul butter"]),
    ("Ghee", ["ghee", "desi ghee"]),
    ("Feta Cheese", ["feta", "feta cheese"]),
    ("Buttermilk", ["buttermilk", "chaas"]),
    ("Greek Yogurt", ["greek yogurt"]),
    ("Skyr", ["skyr"]),
    ("Cheese", ["cheese", "cheddar", "mozzarella", "cheese slices", "shredded cheese", "cheese cubes"]),
    ("Bread", ["bread", "milk bread", "brown bread", "whole wheat bread", "sandwich bread", "keto bread", "pav"]),
    ("Fresh Cream", ["fresh cream", "amul fresh cream", "cooking cream"]),

    # Atta, Rice, Oil & Dals
    ("Wheat Flour / Atta", ["atta", "wheat flour", "chakki fresh atta"]),
    ("Rice", ["basmati", "sona masoori", "sona masuri", "rice", "chawal"]),
    ("Masoor Dal", ["masoor"]),
    ("Moong Dal", ["moong dal", "moong dhuli", "moong chilka", "green moong", "yellow moong"]),
    ("Toor / Arhar Dal", ["toor", "arhar", "tuvar"]),
    ("Chana Dal", ["chana dal"]),
    ("White Chana", ["white chana", "safed chana", "kabuli chana", "chole"]),
    ("Black Chana", ["black chana", "kala chana"]),
    ("Rajma", ["rajma", "kidney beans"]),
    ("Besan", ["besan", "gram flour"]),
    ("Cooking Oil", ["sunflower oil", "mustard oil", "cooking oil", "groundnut oil", "refined oil"]),
    ("Olive Oil", ["olive oil", "extra virgin olive oil"]),
    ("Poha", ["poha", "aval"]),
    ("Suji / Semolina", ["suji", "semolina", "rava"]),
    ("Vermicelli / Seviyan", ["vermicelli", "seviyan", "semiya"]),
    ("Oats", ["rolled oats", "instant oats", "quaker oats", "oats"]),
    ("Sugar", ["sugar", "cheeni"]),

    # Masala & Dry Fruits
    ("Salt", ["salt", "namak", "rock salt"]),
    ("Turmeric", ["turmeric", "haldi"]),
    ("Red Chilli Powder", ["red chilli powder", "chilli powder", "kashmiri mirch", "kashmiri chilli"]),
    ("Coriander Powder", ["coriander powder", "dhaniya powder"]),
    ("Cumin Seeds", ["cumin seeds", "jeera whole", "zeera whole", "sabut jeera"]),
    ("Cumin / Jeera", ["cumin", "jeera", "zeera"]),
    ("Garam Masala", ["garam masala"]),
    ("Kitchen King Masala", ["kitchen king"]),
    ("Black Pepper", ["black pepper", "kali mirch", "pepper sprinkler"]),
    ("Chaat Masala", ["chaat masala", "chat masala"]),
    ("Mustard Seeds", ["mustard seeds", "rai"]),
    ("Cardamom", ["cardamom", "elaichi"]),
    ("Cinnamon", ["cinnamon", "dalchini"]),
    ("Cloves", ["clove", "laung"]),
    ("Almonds", ["almond", "badam"]),
    ("Cashews", ["cashew", "kaju"]),
    ("Walnuts", ["walnut", "akhrot"]),
    ("Raisins", ["raisin", "kishmish"]),
    ("Dates", ["dates", "khajoor", "khajur"]),
    ("Mixed Dry Fruits", ["mixed dry fruit", "dry fruit mix"]),
    ("Ginger-Garlic Paste", ["ginger garlic paste", "adrak lehsun paste"]),
    ("Foxnuts / Makhana", ["makhana", "foxnut"]),

    # Breakfast & Sauces
    ("Dosa & Idli Batter", ["dosa batter", "idli batter", "idli & dosa batter"]),
    ("Jam", ["jam", "kissan jam", "fruit jam"]),
    ("Peanut Butter", ["peanut butter"]),
    ("Ketchup", ["ketchup", "tomato ketchup"]),
    ("Mayonnaise", ["mayonnaise", "mayo"]),
    ("Chutney", ["chutney", "mint chutney", "green chutney"]),
    ("Pasta Sauce", ["pasta sauce", "pizza sauce"]),
    ("Hot Sauce", ["hot sauce", "sriracha", "chilli sauce"]),
    ("Soy Sauce", ["soy sauce", "soya sauce"]),
    ("Honey", ["honey"]),

    # Tea, Coffee & Drinks
    ("Tea", ["tea", "chai", "tata tea", "red label"]),
    ("Coffee", ["coffee", "sleepy owl", "nescafe"]),
    ("Stevia", ["stevia", "sugar free green"]),

    # Munchies & Biscuits
    ("Roasted Peanuts", ["roasted peanut", "masala peanut", "salted peanut", "singdana"]),
    ("Namkeen / Mixture", ["namkeen", "mixture", "bhujia", "sev"]),
    ("Biscuits", ["biscuit", "cookie", "marie", "parle-g", "monaco"]),
    ("Chips", ["chips", "crisps", "lays", "bingo", "doritos"]),
    ("Popcorn", ["popcorn", "act ii"]),
    ("Crackers", ["cracker", "peanut cracker"]),

    # Pet Care & Household
    ("Cat Food", ["cat food", "sheba", "me-o", "whiskas", "drools cat"]),
    ("Cat Poop Bags", ["poop bag", "dog poop bag", "pet poop bag"]),
    ("Toilet Paper", ["toilet paper", "toilet roll", "toilet tissue roll"]),
    ("Kitchen Roll", ["kitchen roll", "kitchen towel", "kitchen wipe", "sponge wipe"]),
    ("Colin / Glass Cleaner", ["colin", "glass cleaner"]),
    ("Dishwash", ["dishwash", "vim", "exo", "pril"]),
    ("Laundry Detergent", ["detergent", "surf excel", "ariel", "tide", "henko"]),
    ("Floor Cleaner", ["floor cleaner", "lizol", "nimyle"]),
    ("Handwash Liquid", ["handwash", "liquid handwash", "hand wash"]),
    ("Tissues", ["tissue", "napkin", "facial tissue"])
]

def map_to_canonical(name):
    lower = name.lower()
    for canon, kws in MATCH_RULES:
        for kw in kws:
            if kw in lower:
                return canon
    return None

# Parse baskets
all_baskets = []
item_counts = defaultdict(int)

for o in orders:
    if o.get("status") == "CANCELLED":
        continue
    basket = set()
    for it in o.get("items", []):
        name = it.get("name")
        if not name:
            continue
        canon = map_to_canonical(name)
        if canon:
            basket.add(canon)
            item_counts[canon] += 1
    if basket:
        all_baskets.append(list(basket))

print(f"Total baskets: {len(all_baskets)}")
print(f"Distinct canonical items found in orders: {len(item_counts)}")

# Compute Co-occurrences
pair_counts = defaultdict(int)
for b in all_baskets:
    unique_items = list(set(b))
    for item1, item2 in combinations(unique_items, 2):
        pair = tuple(sorted([item1, item2]))
        pair_counts[pair] += 1

companions_map = defaultdict(list)
for (item1, item2), count in pair_counts.items():
    if count >= 4:
        conf1 = count / item_counts[item1] if item_counts[item1] else 0
        conf2 = count / item_counts[item2] if item_counts[item2] else 0
        if conf1 > 0.12:
            companions_map[item1].append({"companion": item2, "co_count": count, "confidence": round(conf1, 2)})
        if conf2 > 0.12:
            companions_map[item2].append({"companion": item1, "co_count": count, "confidence": round(conf2, 2)})

for k in companions_map:
    companions_map[k].sort(key=lambda x: (x["confidence"], x["co_count"]), reverse=True)
    companions_map[k] = companions_map[k][:6]

top_staples = sorted([{"name": k, "count": v} for k, v in item_counts.items()], key=lambda x: x["count"], reverse=True)[:35]

category_items_map = {}
for sec in category_sections:
    category_items_map[sec["name"]] = [it["name"] for it in sec["items"]]

rules_payload = {
    "companions": companions_map,
    "staple_intervals": {},
    "top_staples": top_staples,
    "category_items": category_items_map
}

with open("data/pattern_rules.json", "w", encoding="utf-8") as f:
    json.dump(rules_payload, f, indent=2, ensure_ascii=False)

print("✅ data/pattern_rules.json updated with strictly canonical items!")
