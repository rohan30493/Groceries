import re
import json
from collections import defaultdict
from datetime import datetime

# Known grocery item dictionary for entity extraction
KNOWN_ITEMS = {
    # Vegetables & Herbs
    "paneer": "Fresh Paneer",
    "cauliflower": "Cauliflower (Gobi)",
    "cabbage": "Cabbage (Patta Gobi)",
    "palak": "Spinach (Palak)",
    "spinach": "Spinach (Palak)",
    "methi": "Fenugreek (Methi)",
    "sarson": "Sarson ka Saag",
    "bhindi": "Lady Finger (Bhindi)",
    "bindi": "Lady Finger (Bhindi)",
    "okra": "Lady Finger (Bhindi)",
    "french beans": "French Beans",
    "beans": "Beans",
    "carrot": "Carrots",
    "carrots": "Carrots",
    "broccoli": "Broccoli",
    "mushroom": "Mushroom",
    "ghea": "Bottle Gourd (Lauki / Ghea)",
    "lauki": "Bottle Gourd (Lauki / Ghea)",
    "thori": "Ridge Gourd (Tori)",
    "tori": "Ridge Gourd (Tori)",
    "karela": "Bitter Gourd (Karela)",
    "baigan": "Brinjal (Baingan)",
    "brinjal": "Brinjal (Baingan)",
    "capsicum": "Capsicum / Bell Peppers",
    "bell pepper": "Capsicum / Bell Peppers",
    "bell peppers": "Capsicum / Bell Peppers",
    "tomato": "Tomatoes",
    "tomatoes": "Tomatoes",
    "baby tomato": "Cherry / Baby Tomatoes",
    "baby tomatoes": "Cherry / Baby Tomatoes",
    "lettuce": "Lettuce",
    "cucumber": "Cucumber",
    "onion": "Onions",
    "onions": "Onions",
    "spring onion": "Spring Onions",
    "spring onions": "Spring Onions",
    "potato": "Potatoes",
    "potatoes": "Potatoes",
    "ginger": "Ginger (Adrak)",
    "garlic": "Garlic (Lahsun)",
    "green chilli": "Green Chillies",
    "green chillies": "Green Chillies",
    "dania": "Coriander (Dhaniya Patta)",
    "dhaniya": "Coriander (Dhaniya Patta)",
    "lemon": "Lemons (Nimbu)",
    "nimbu": "Lemons (Nimbu)",
    "pumpkin": "Pumpkin (Kaddu)",
    "frozen green peas": "Frozen Green Peas",
    "green peas": "Green Peas",
    "peas": "Green Peas",
    "asparagus": "Asparagus",
    "lobia": "Lobia",

    # Dairy & Eggs
    "milk": "Milk",
    "milk pouch": "Milk Pouch",
    "tetra pack": "Milk (Tetra Pack)",
    "curd": "Curd (Dahi)",
    "dahi": "Curd (Dahi)",
    "butter": "Amul Butter",
    "amul butter": "Amul Butter",
    "ghee": "Desi Ghee",
    "cheese": "Cheese",
    "feta": "Feta Cheese",
    "cheese cubes": "Cheese Cubes",
    "cheese slice": "Cheese Slices",
    "eggs": "Eggs",
    "egg": "Eggs",
    "buttermilk": "Buttermilk (Chaas)",

    # Bakery, Batter & Grains
    "bread": "Bread",
    "normal bread": "Normal Bread",
    "milk bread": "Milk Bread",
    "keto bread": "Keto Bread",
    "dosa batter": "iD Dosa Batter",
    "idli batter": "iD Idli Batter",
    "kulcha": "Kulcha",
    "atta": "Atta (Wheat Flour)",
    "low carb flour": "Low Carb / Keto Atta",
    "keto atta": "Low Carb / Keto Atta",
    "poha": "Poha",
    "thin poha": "Thin Poha",
    "suji": "Suji (Semolina)",
    "besan": "Besan (Gram Flour)",
    "daliya": "Daliya",
    "rice": "Rice",
    "sona masoori": "Sona Masoori Rice",
    "murmura": "Murmura (Puffed Rice)",
    "noodles": "Noodles",

    # Pulses & Dals
    "masoor dal": "Masoor Dal (Red)",
    "moong dal": "Moong Dal (Yellow)",
    "green moong": "Green Moong Dal",
    "chana dal": "Chana Dal",
    "white chana": "White Chana (Kabuli)",
    "black chana": "Black Chana",
    "rajma": "Rajma",
    "sambhar dal": "Toor / Arhar Dal (Sambhar)",
    "urad": "Black Urad Dal",

    # Fruits
    "apple": "Apples",
    "apples": "Apples",
    "banana": "Bananas",
    "orange": "Oranges",
    "pomegranate": "Pomegranate (Anaar)",
    "strawberry": "Strawberries",
    "jamun": "Jamun",

    # Snacks, Drinks & Breakfast
    "peanut": "Peanuts",
    "peanuts": "Peanuts",
    "groundnut": "Peanuts / Groundnuts",
    "groundnuts": "Peanuts / Groundnuts",
    "masala peanut": "Dev Snacks / Masala Peanuts",
    "biscuit": "Biscuits",
    "biscuits": "Biscuits",
    "marie": "Marie Biscuits",
    "monaco": "Monaco Biscuits",
    "besan mixture": "Besan Mixture / Namkeen",
    "namkeen": "Namkeen",
    "bundi": "Boondi for Raita",
    "tea leaves": "Tea Leaves",
    "coffee": "Coffee",
    "smoothie": "Smoothie / Protein Shake",

    # Pet Food
    "cat food": "Cat Food",
    "sheba": "Sheba Cat Food (Tuna & Chicken)",
    "me-o": "Me-O Delite Cat Food",
    "meo": "Me-O Delite Cat Food",
    "poop bag": "Pet Poop Bags",
    "poop bags": "Pet Poop Bags",

    # Spices & Condiments
    "haldi": "Haldi (Turmeric Powder)",
    "sambhar powder": "Sambhar Powder",
    "jeera": "Jeera Powder",
    "zeera": "Jeera Powder",
    "garam masala": "Garam Masala",
    "amchur": "Amchur Powder",
    "kashmiri mirch": "Kashmiri Mirch Powder",
    "salt": "Salt",
    "sugar": "Sugar",
    "stevia": "Stevia Sweetener",
    "jaggery": "Jaggery Powder",
    "vinegar": "Vinegar",
    "sauce": "Sauce",
    "chilli sauce": "Chilli Sauce",
    "maggie sauce": "Maggi Hot & Sweet Sauce",
    "agar agar": "Agar Agar Powder (Gummies)",

    # Personal & Home Care
    "colin": "Colin Glass Cleaner",
    "toothpaste": "Colgate Toothpaste",
    "colgate": "Colgate Toothpaste",
    "soap": "Mysore Sandal Soap",
    "coconut oil": "Coconut Oil",
    "toilet roll": "Toilet Paper Roll",
    "wet wipes": "Wet Wipes"
}

def parse_chats():
    chat_files = ["data/chat_1.txt", "data/chat_2.txt"]
    all_shopping_events = []
    item_frequency = defaultdict(int)

    for cf in chat_files:
        with open(cf, "r", encoding="utf-8") as f:
            text = f.read()

        msgs = re.findall(r"\[(\d{1,2}/\d{1,2}/\d{2,4},\s*[\d:]+\s*(?:AM|PM|am|pm)?)\]\s*([^:]+):\s*(.*)", text)
        for dt_str, sender, content in msgs:
            content_lower = content.lower()
            
            # Skip package delivery status alerts
            if any(k in content_lower for k in ["is out for delivery", "awb:", "xpressbees", "ekart update", "myntra", "bluetokai", "otp to proceed"]):
                continue

            # Identify grocery items in this message
            matched_items = set()
            for kw, norm_name in KNOWN_ITEMS.items():
                pattern = r"\b" + re.escape(kw) + r"\b"
                if re.search(pattern, content_lower):
                    matched_items.add(norm_name)

            if matched_items:
                for item in matched_items:
                    item_frequency[item] += 1

                all_shopping_events.append({
                    "timestamp": dt_str,
                    "sender": sender.strip(),
                    "raw_message": content.strip(),
                    "detected_items": sorted(list(matched_items))
                })

    # Save extracted requests
    with open("data/chat_grocery_requests.json", "w", encoding="utf-8") as f:
        json.dump(all_shopping_events, f, indent=2, ensure_ascii=False)
    print(f"✅ Extracted {len(all_shopping_events)} grocery-request messages into data/chat_grocery_requests.json")

    # Save frequencies
    freq_sorted = sorted([{"item": k, "chat_mentions": v} for k, v in item_frequency.items()], key=lambda x: x["chat_mentions"], reverse=True)
    with open("data/chat_items_frequency.json", "w", encoding="utf-8") as f:
        json.dump(freq_sorted, f, indent=2, ensure_ascii=False)
    print(f"✅ Saved frequency breakdown for {len(freq_sorted)} distinct items in data/chat_items_frequency.json")

    print("\n================ CHAT GROCERY REQUESTS SUMMARY ================")
    print(f"Total Grocery Chat Messages: {len(all_shopping_events)}")
    print(f"Unique Items Requested:     {len(freq_sorted)}")
    print("\nTop 25 Most Frequently Requested Items in WhatsApp Chat:")
    for i, entry in enumerate(freq_sorted[:25], 1):
        print(f"  {i:2d}. {entry['item']} — requested {entry['chat_mentions']} times in chat")
    print("===============================================================\n")

if __name__ == "__main__":
    parse_chats()
