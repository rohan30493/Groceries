import json
import os
import re
from collections import defaultdict
from itertools import combinations
from datetime import datetime

# Standard grocery canonical categories and names
CANONICAL_MAP = {
    # Dairy & Refrigerated
    "paneer": ("Fresh Paneer", "Dairy & Eggs"),
    "gowardhan fresh paneer": ("Fresh Paneer", "Dairy & Eggs"),
    "malai paneer": ("Fresh Paneer", "Dairy & Eggs"),
    "milk": ("Milk", "Dairy & Eggs"),
    "nandini goodlife": ("Milk", "Dairy & Eggs"),
    "toned milk": ("Milk", "Dairy & Eggs"),
    "curd": ("Curd (Dahi)", "Dairy & Eggs"),
    "milky mist set curd": ("Curd (Dahi)", "Dairy & Eggs"),
    "dahi": ("Curd (Dahi)", "Dairy & Eggs"),
    "eggs": ("Eggs", "Dairy & Eggs"),
    "eggoz": ("Eggs", "Dairy & Eggs"),
    "butter": ("Butter", "Dairy & Eggs"),
    "amul butter": ("Butter", "Dairy & Eggs"),
    "ghee": ("Ghee", "Dairy & Eggs"),
    "feta": ("Feta Cheese", "Dairy & Eggs"),
    "cheese": ("Cheese", "Dairy & Eggs"),
    "buttermilk": ("Buttermilk", "Dairy & Eggs"),

    # Vegetables
    "cauliflower": ("Cauliflower", "Fresh Produce"),
    "cabbage": ("Cabbage", "Fresh Produce"),
    "palak": ("Spinach (Palak)", "Fresh Produce"),
    "spinach": ("Spinach (Palak)", "Fresh Produce"),
    "methi": ("Fenugreek (Methi)", "Fresh Produce"),
    "sarson": ("Sarson ka Saag", "Fresh Produce"),
    "lady finger": ("Lady Finger (Bhindi)", "Fresh Produce"),
    "bhindi": ("Lady Finger (Bhindi)", "Fresh Produce"),
    "bindi": ("Lady Finger (Bhindi)", "Fresh Produce"),
    "onion": ("Onions", "Fresh Produce"),
    "eerulli": ("Onions", "Fresh Produce"),
    "potato": ("Potatoes", "Fresh Produce"),
    "aloo": ("Potatoes", "Fresh Produce"),
    "tomato": ("Tomatoes", "Fresh Produce"),
    "cherry tomato": ("Cherry / Baby Tomatoes", "Fresh Produce"),
    "baby tomato": ("Cherry / Baby Tomatoes", "Fresh Produce"),
    "french beans": ("French Beans", "Fresh Produce"),
    "beans": ("Beans", "Fresh Produce"),
    "carrot": ("Carrots", "Fresh Produce"),
    "cucumber": ("Cucumber", "Fresh Produce"),
    "lettuce": ("Lettuce", "Fresh Produce"),
    "capsicum": ("Capsicum / Bell Peppers", "Fresh Produce"),
    "bell pepper": ("Capsicum / Bell Peppers", "Fresh Produce"),
    "ginger": ("Ginger", "Fresh Produce"),
    "garlic": ("Garlic", "Fresh Produce"),
    "green chilli": ("Green Chillies", "Fresh Produce"),
    "dania": ("Coriander (Dhaniya)", "Fresh Produce"),
    "coriander": ("Coriander (Dhaniya)", "Fresh Produce"),
    "lemon": ("Lemons (Nimbu)", "Fresh Produce"),
    "nimbu": ("Lemons (Nimbu)", "Fresh Produce"),
    "broccoli": ("Broccoli", "Fresh Produce"),
    "mushroom": ("Mushroom", "Fresh Produce"),
    "bottle gourd": ("Bottle Gourd (Lauki)", "Fresh Produce"),
    "ghea": ("Bottle Gourd (Lauki)", "Fresh Produce"),
    "lauki": ("Bottle Gourd (Lauki)", "Fresh Produce"),
    "ridge gourd": ("Ridge Gourd (Tori)", "Fresh Produce"),
    "thori": ("Ridge Gourd (Tori)", "Fresh Produce"),
    "tori": ("Ridge Gourd (Tori)", "Fresh Produce"),
    "karela": ("Bitter Gourd (Karela)", "Fresh Produce"),
    "brinjal": ("Brinjal (Baingan)", "Fresh Produce"),
    "baigan": ("Brinjal (Baingan)", "Fresh Produce"),
    "frozen green peas": ("Green Peas", "Fresh Produce"),
    "green peas": ("Green Peas", "Fresh Produce"),

    # Bakery & Breakfast
    "bread": ("Bread", "Bakery & Breakfast"),
    "milk bread": ("Milk Bread", "Bakery & Breakfast"),
    "keto bread": ("Keto / Health Bread", "Bakery & Breakfast"),
    "dosa batter": ("Dosa & Idli Batter", "Bakery & Breakfast"),
    "idli batter": ("Dosa & Idli Batter", "Bakery & Breakfast"),
    "poha": ("Poha", "Bakery & Breakfast"),
    "suji": ("Suji / Semolina", "Bakery & Breakfast"),

    # Pantry & Dals
    "atta": ("Wheat Flour (Atta)", "Pantry & Dals"),
    "keto atta": ("Keto / Low Carb Flour", "Pantry & Dals"),
    "low carb flour": ("Keto / Low Carb Flour", "Pantry & Dals"),
    "rice": ("Rice", "Pantry & Dals"),
    "sona masoori": ("Rice", "Pantry & Dals"),
    "masoor dal": ("Masoor Dal", "Pantry & Dals"),
    "moong dal": ("Moong Dal", "Pantry & Dals"),
    "toor dal": ("Toor / Arhar Dal", "Pantry & Dals"),
    "chana dal": ("Chana Dal", "Pantry & Dals"),
    "rajma": ("Rajma", "Pantry & Dals"),
    "white chana": ("White Chana", "Pantry & Dals"),
    "black chana": ("Black Chana", "Pantry & Dals"),
    "salt": ("Salt", "Pantry & Dals"),
    "sugar": ("Sugar", "Pantry & Dals"),
    "tea": ("Tea Leaves", "Pantry & Dals"),
    "coffee": ("Coffee", "Pantry & Dals"),

    # Snacks
    "peanut": ("Roasted Peanuts", "Snacks"),
    "groundnut": ("Peanuts", "Snacks"),
    "biscuit": ("Biscuits", "Snacks"),
    "marie": ("Marie Biscuits", "Snacks"),
    "monaco": ("Monaco Biscuits", "Snacks"),
    "namkeen": ("Namkeen / Mixture", "Snacks"),

    # Pet Food
    "cat food": ("Cat Food (Sheba / Me-O)", "Pet Care"),
    "sheba": ("Sheba Cat Food", "Pet Care"),
    "me-o": ("Me-O Delite Cat Food", "Pet Care"),
    "poop bag": ("Dog Poop Bags", "Pet Care"),

    # Household & Personal
    "colin": ("Colin Glass Cleaner", "Household"),
    "toothpaste": ("Toothpaste", "Household"),
    "soap": ("Bath Soap", "Household"),
    "toilet roll": ("Toilet Paper", "Household")
}

def normalize_item_name(name):
    lower = name.lower()
    for kw, (canon, cat) in CANONICAL_MAP.items():
        if kw in lower:
            return canon, cat
    # Fallback
    clean = re.sub(r"\s*\([^)]*\)", "", name).strip()
    return clean, "Other Staples"

def main():
    os.makedirs("data", exist_ok=True)
    os.makedirs("src/lib", exist_ok=True)

    # 1. Load historical orders & chats
    with open("data/unified_orders.json", "r", encoding="utf-8") as f:
        orders = json.load(f)

    with open("data/chat_grocery_requests.json", "r", encoding="utf-8") as f:
        chats = json.load(f)

    # Combine shopping events
    all_baskets = []
    item_dates = defaultdict(list)
    item_counts = defaultdict(int)

    # From orders
    for o in orders:
        if o.get("status") == "CANCELLED":
            continue
        basket = set()
        dt_str = o.get("placed_at")
        for it in o.get("items", []):
            name = it.get("name")
            if not name:
                continue
            canon, _ = normalize_item_name(name)
            basket.add(canon)
            item_counts[canon] += 1
            if dt_str:
                item_dates[canon].append(dt_str[:10])
        if basket:
            all_baskets.append(list(basket))

    # From chats
    for c in chats:
        basket = set()
        for it in c.get("detected_items", []):
            canon, _ = normalize_item_name(it)
            basket.add(canon)
            item_counts[canon] += 1
        if basket:
            all_baskets.append(list(basket))

    print(f"Total baskets analyzed: {len(all_baskets)}")

    # 2. Compute Co-occurrences (Which items frequently go together)
    pair_counts = defaultdict(int)
    for b in all_baskets:
        unique_items = list(set(b))
        for item1, item2 in combinations(unique_items, 2):
            pair = tuple(sorted([item1, item2]))
            pair_counts[pair] += 1

    # Associations: For each item, find top companions with high conditional probability
    companions_map = defaultdict(list)
    for (item1, item2), count in pair_counts.items():
        if count >= 8:  # Significant historical co-occurrence
            # Confidence item1 -> item2
            conf1 = count / item_counts[item1] if item_counts[item1] else 0
            conf2 = count / item_counts[item2] if item_counts[item2] else 0
            
            if conf1 > 0.15:
                companions_map[item1].append({"companion": item2, "co_count": count, "confidence": round(conf1, 2)})
            if conf2 > 0.15:
                companions_map[item2].append({"companion": item1, "co_count": count, "confidence": round(conf2, 2)})

    # Sort each companion list by confidence
    for k in companions_map:
        companions_map[k].sort(key=lambda x: (x["confidence"], x["co_count"]), reverse=True)
        # Keep top 6
        companions_map[k] = companions_map[k][:6]

    # 3. Calculate replenishment intervals (median days between purchases)
    staple_intervals = {}
    for item, dates in item_dates.items():
        if len(dates) >= 5:
            # Sort unique dates
            sorted_dates = sorted(list(set(dates)))
            diffs = []
            for i in range(1, len(sorted_dates)):
                try:
                    d1 = datetime.strptime(sorted_dates[i-1], "%Y-%m-%d")
                    d2 = datetime.strptime(sorted_dates[i], "%Y-%m-%d")
                    diff_days = (d2 - d1).days
                    if 1 <= diff_days <= 45:
                        diffs.append(diff_days)
                except:
                    pass
            if len(diffs) >= 4:
                diffs.sort()
                median_days = diffs[len(diffs)//2]
                staple_intervals[item] = {
                    "total_purchases": item_counts[item],
                    "typical_interval_days": median_days,
                    "last_ordered": sorted_dates[-1]
                }

    # Top frequent staples for 1-tap quick add
    top_staples = sorted([{"name": k, "count": v} for k, v in item_counts.items()], key=lambda x: x["count"], reverse=True)[:30]

    # 4. Save pattern rules JSON
    rules_payload = {
        "companions": companions_map,
        "staple_intervals": staple_intervals,
        "top_staples": top_staples,
        "category_items": {
            "Dairy & Eggs": ["Fresh Paneer", "Milk", "Curd (Dahi)", "Eggs", "Butter", "Ghee", "Feta Cheese", "Buttermilk"],
            "Fresh Produce": ["Tomatoes", "Onions", "Potatoes", "Spinach (Palak)", "Cauliflower", "Lady Finger (Bhindi)", "French Beans", "Carrots", "Cucumber", "Lettuce", "Capsicum / Bell Peppers", "Coriander (Dhaniya)", "Green Chillies", "Ginger", "Garlic", "Lemons (Nimbu)", "Broccoli", "Bottle Gourd (Lauki)", "Ridge Gourd (Tori)", "Green Peas"],
            "Bakery & Breakfast": ["Bread", "Milk Bread", "Keto / Health Bread", "Dosa & Idli Batter", "Poha", "Suji / Semolina"],
            "Pantry & Dals": ["Wheat Flour (Atta)", "Rice", "Masoor Dal", "Moong Dal", "Toor / Arhar Dal", "White Chana", "Black Chana", "Rajma", "Tea Leaves", "Coffee", "Salt", "Sugar"],
            "Snacks": ["Roasted Peanuts", "Biscuits", "Namkeen / Mixture"],
            "Pet Care": ["Cat Food (Sheba / Me-O)", "Sheba Cat Food", "Me-O Delite Cat Food", "Dog Poop Bags"],
            "Household": ["Colin Glass Cleaner", "Toothpaste", "Bath Soap", "Toilet Paper"]
        }
    }

    with open("data/pattern_rules.json", "w", encoding="utf-8") as f:
        json.dump(rules_payload, f, indent=2, ensure_ascii=False)
    print("✅ Successfully generated data/pattern_rules.json")

if __name__ == "__main__":
    main()
