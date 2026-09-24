import json
import re

# Load data
with open("data/unified_products.json", "r", encoding="utf-8") as f:
    products = json.load(f)

with open("data/category_sections.json", "r", encoding="utf-8") as f:
    existing_sections = json.load(f)

# Existing item lookup
existing_item_map = {}
for sec in existing_sections:
    for it in sec["items"]:
        existing_item_map[it["name"].lower()] = it

# Target taxonomy definition
TARGET_TAXONOMY = [
    {
        "id": "fruits-vegetables",
        "name": "Fruits & Vegetables",
        "icon": "🥦",
        "badge": "Fresh Daily",
        "description": "Fresh produce, greens & fruits",
        "items": [
            {"name": "Tomatoes", "icon": "🍅", "keywords": ["tomato"], "exclude": ["cherry", "baby", "sauce", "ketchup", "puree", "paste", "soup", "dip", "rice", "curry"]},
            {"name": "Cherry Tomatoes", "icon": "🍅", "keywords": ["cherry tomato", "baby tomato"], "exclude": []},
            {"name": "Onions", "icon": "🧅", "keywords": ["onion", "pyaz", "eerulli", "shallot"], "exclude": ["spring onion", "chip", "dip", "sambar onion", "creme & onion", "cream & onion", "sour cream & onion", "cream and onion"]},
            {"name": "Bananas", "icon": "🍌", "subtitle": "Elaichi / Robusta", "keywords": ["banana", "elaichi banana", "robusta", "yelakki", "yellaki", "kela"], "exclude": ["chip", "chips", "smoothie", "bread"]},
            {"name": "Potatoes", "icon": "🥔", "keywords": ["potato", "aloo", "batata"], "exclude": ["chip", "chips", "sweet potato"]},
            {"name": "Cauliflower", "icon": "🥦", "keywords": ["cauliflower", "gobi"], "exclude": []},
            {"name": "Carrots", "icon": "🥕", "keywords": ["carrot", "gajar"], "exclude": []},
            {"name": "Cucumber", "icon": "🥒", "keywords": ["cucumber", "kheera", "kakdi"], "exclude": []},
            {"name": "Palak / Spinach", "icon": "🥬", "keywords": ["palak", "spinach"], "exclude": []},
            {"name": "Lemons", "icon": "🍋", "keywords": ["lemon", "nimbu", "lime"], "exclude": ["drink", "soda", "pickle", "dishwash", "cleaner", "tea", "water"]},
            {"name": "Coriander", "icon": "🌿", "keywords": ["coriander", "dhaniya", "dhania", "kothmir", "cilantro"], "exclude": ["powder", "seed", "masala"]},
            {"name": "Garlic", "icon": "🧄", "subtitle": "Peeled / Normal", "keywords": ["garlic", "lehsun", "lahsun"], "exclude": ["paste", "powder", "bread", "dip", "mayo"]},
            {"name": "Apples", "icon": "🍎", "keywords": ["apple", "seb", "shimla apple", "fuji apple", "royal gala", "red delicious"], "exclude": ["cider", "juice", "vinegar", "custard apple", "pineapple", "puree"]},
            {"name": "Lettuce / Salad Leaves", "icon": "🥗", "keywords": ["lettuce", "salad leave", "iceberg", "romaine", "rocket", "arugula"], "exclude": []},
            {"name": "Ginger", "icon": "🫚", "keywords": ["ginger", "adrak"], "exclude": ["paste", "powder", "tea", "candy", "ale", "beer", "garlic paste"]},
            {"name": "Capsicum", "icon": "🫑", "keywords": ["capsicum", "bell pepper", "shimla mirch"], "exclude": []},
            {"name": "Cabbage", "icon": "🥬", "keywords": ["cabbage", "patta gobi"], "exclude": []},
            {"name": "Lady Finger / Bhindi", "icon": "🫛", "keywords": ["lady finger", "bhindi", "bindi", "okra"], "exclude": []},
            {"name": "Ridge Gourd / Tori", "icon": "🥒", "keywords": ["ridge gourd", "tori", "thori", "turai"], "exclude": []},
            {"name": "Lauki / Bottle Gourd", "icon": "🍈", "keywords": ["bottle gourd", "lauki", "ghea", "doodhi"], "exclude": []},
            {"name": "Broccoli", "icon": "🥦", "keywords": ["broccoli"], "exclude": []},
            {"name": "Mushrooms", "icon": "🍄", "keywords": ["mushroom", "button mushroom"], "exclude": []},
            {"name": "Green Chillies", "icon": "🌶️", "keywords": ["green chilli", "green chili", "hari mirch"], "exclude": ["sauce", "pickle", "red chilli", "paste"]},
            {"name": "French Beans", "icon": "🫛", "keywords": ["french bean", "haricot", "green beans"], "exclude": ["cluster beans", "broad beans", "soya beans", "kidney beans"]},
            {"name": "Pomegranate", "icon": "🍒", "keywords": ["pomegranate", "anar"], "exclude": ["juice"]},
            {"name": "Mandarin Orange", "icon": "🍊", "keywords": ["mandarin", "orange mini mandarin", "kinnow", "santra", "tangerine"], "exclude": ["juice", "carbonated", "soft drink", "cleaner"]},
            {"name": "Kiwi", "icon": "🥝", "keywords": ["kiwi"], "exclude": []},
            {"name": "Brinjal / Eggplant", "icon": "🍆", "subtitle": "Purple / Bharta", "keywords": ["brinjal", "eggplant", "baingan", "badanekaayi"], "exclude": []}
        ]
    },
    {
        "id": "dairy-bread-eggs",
        "name": "Dairy, Bread & Eggs",
        "icon": "🥛",
        "badge": "Daily Needs",
        "description": "Milk, paneer, eggs, curd & breads",
        "items": [
            {"name": "Milk", "icon": "🥛", "subtitle": "Tetra Pack / Fresh Pouch", "keywords": ["milk", "doodh", "nandini goodlife", "akshayakalpa", "heritage", "toned milk", "cow milk", "buffalo milk"], "exclude": ["milk chocolate", "milk bread", "condensed milk", "milkshake", "coconut milk", "almond milk", "soya milk", "oat milk", "buttermilk"]},
            {"name": "Fresh Paneer", "icon": "🧀", "keywords": ["paneer", "gowardhan", "malai paneer", "cottage cheese"], "exclude": ["masala paneer", "tofu"]},
            {"name": "Curd / Dahi", "icon": "🥣", "keywords": ["curd", "dahi", "milky mist set curd"], "exclude": ["greek yogurt", "yogurt", "buttermilk"]},
            {"name": "Eggs", "icon": "🥚", "keywords": ["egg", "eggoz", "hen fruit"], "exclude": ["eggless"]},
            {"name": "Butter", "icon": "🧈", "keywords": ["butter", "amul butter"], "exclude": ["peanut butter", "buttermilk", "cookie", "biscuit", "ghee", "popcorn", "naan"]},
            {"name": "Ghee", "icon": "🏺", "keywords": ["ghee", "desi ghee", "cow ghee"], "exclude": []},
            {"name": "Feta Cheese", "icon": "🧀", "keywords": ["feta", "feta cheese"], "exclude": []},
            {"name": "Buttermilk", "icon": "🥛", "keywords": ["buttermilk", "chaas", "spiced buttermilk"], "exclude": []},
            {"name": "Greek Yogurt", "icon": "🍶", "keywords": ["greek yogurt", "epigamia greek"], "exclude": []},
            {"name": "Skyr", "icon": "🍶", "keywords": ["skyr"], "exclude": []},
            {"name": "Cheese", "icon": "🧀", "subtitle": "Shredded / Cheddar Slices", "keywords": ["cheese", "cheddar", "mozzarella", "cheese slices", "shredded cheese", "cheese cubes", "dlecta"], "exclude": ["feta", "cottage cheese", "paneer", "cream cheese", "dip", "nachos", "popcorn", "makhana"]},
            {"name": "Bread", "icon": "🍞", "subtitle": "Milk Bread / Regular / Keto", "keywords": ["bread", "milk bread", "brown bread", "whole wheat bread", "sandwich bread", "keto bread", "multigrain bread", "pav", "burger bun", "health factory"], "exclude": ["breadcrumbs", "breadstick", "garlic bread", "cracker"]},
            {"name": "Fresh Cream", "icon": "🍨", "keywords": ["amul fresh cream", "fresh cream", "dlecta dairy fresh cream", "cooking cream"], "exclude": ["ice cream", "face cream", "malai paneer", "biscuit"]}
        ]
    },
    {
        "id": "atta-rice-dals",
        "name": "Atta, Rice, Oil & Dals",
        "icon": "🌾",
        "badge": "Kitchen Staples",
        "description": "Flours, rice, pulses & cooking oils",
        "items": [
            {"name": "Wheat Flour / Atta", "icon": "🌾", "keywords": ["atta", "wheat flour", "chakki fresh atta", "sharbati", "aashirvaad whole wheat"], "exclude": ["maida", "besan", "rice flour", "suji", "rava"]},
            {"name": "Rice", "icon": "🍚", "subtitle": "Basmati / Sona Masuri", "keywords": ["basmati", "sona masoori", "sona masuri", "chawal", "kolam", "daawat", "india gate", "fortune rice"], "exclude": ["poha", "murmura", "rice flour", "vermicelli", "paper boat"]},
            {"name": "Masoor Dal", "icon": "🍲", "keywords": ["masoor", "red lentil"], "exclude": []},
            {"name": "Moong Dal", "icon": "🍲", "subtitle": "Whole / Split", "keywords": ["moong dal", "moong dhuli", "moong chilka", "green moong", "yellow moong"], "exclude": ["namkeen", "halwa", "moong papad"]},
            {"name": "Toor / Arhar Dal", "icon": "🍲", "keywords": ["toor dal", "arhar dal", "tuvar dal", "toor", "arhar"], "exclude": []},
            {"name": "Chana Dal", "icon": "🍲", "keywords": ["chana dal", "bengal gram dal"], "exclude": ["white chana", "black chana", "namkeen", "roasted chana"]},
            {"name": "White Chana", "icon": "🧆", "keywords": ["white chana", "safed chana", "kabuli chana", "chole", "chickpeas"], "exclude": ["black chana", "chana dal", "roasted chana"]},
            {"name": "Black Chana", "icon": "🧆", "keywords": ["black chana", "kala chana", "brown chana"], "exclude": ["white chana", "kabuli"]},
            {"name": "Rajma", "icon": "🍛", "keywords": ["rajma", "kidney beans", "chitra rajma", "jammu rajma"], "exclude": []},
            {"name": "Besan", "icon": "🌾", "keywords": ["fine besan", "besan", "gram flour"], "exclude": ["papdi", "ladoo", "namkeen"]},
            {"name": "Cooking Oil", "icon": "🍾", "keywords": ["sunflower oil", "mustard oil", "groundnut oil", "canola oil", "refined oil", "fortune oil", "dhara oil", "gemini oil"], "exclude": ["olive oil", "hair oil", "body oil", "massage oil", "peanut party"]},
            {"name": "Olive Oil", "icon": "🫒", "keywords": ["olive oil", "extra virgin olive oil", "pomace olive oil", "borges", "figaro", "disano olive"], "exclude": ["makhana", "chips"]},
            {"name": "Poha", "icon": "🥣", "keywords": ["poha", "aval", "flattened rice", "thick poha", "thin poha"], "exclude": ["namkeen"]},
            {"name": "Suji / Semolina", "icon": "🌾", "keywords": ["suji", "semolina", "rava", "sooji"], "exclude": ["rusk"]},
            {"name": "Vermicelli / Seviyan", "icon": "🥢", "keywords": ["vermicelli", "seviyan", "semiya", "bambino"], "exclude": []},
            {"name": "Oats", "icon": "🥣", "keywords": ["rolled oats", "instant oats", "quaker oats", "kellogg oats", "true elements rolled oats", "oats"], "exclude": ["cookie", "bar", "smoothie", "breakfast smoothie"]},
            {"name": "Sugar", "icon": "🍬", "keywords": ["sugar", "cheeni", "sulphurless sugar", "madhur sugar"], "exclude": ["sugar free", "brown sugar", "icing sugar", "vanilla sugar", "smoothie", "drink", "soda"]}
        ]
    },
    {
        "id": "masala-dryfruits",
        "name": "Masala & Dry Fruits",
        "icon": "🌶️",
        "badge": "Spices & Nuts",
        "description": "Spices, dry fruits & masalas",
        "items": [
            {"name": "Salt", "icon": "🧂", "subtitle": "Rock / Crystal", "keywords": ["tata salt", "namak", "rock salt", "sendha namak", "crystal salt", "black salt", "iodized salt"], "exclude": ["salted peanut", "salted almond", "salted popcorn", "cracker", "butter"]},
            {"name": "Turmeric", "icon": "🟡", "keywords": ["turmeric powder", "haldi powder", "turmeric", "haldi"], "exclude": ["mixture", "namkeen"]},
            {"name": "Red Chilli Powder", "icon": "🌶️", "subtitle": "Regular / Kashmiri", "keywords": ["red chilli powder", "chilli powder", "kashmiri mirch", "kashmiri chilli", "lal mirch powder", "teekha lal", "deggi mirch"], "exclude": ["green chilli", "sauce", "flakes"]},
            {"name": "Coriander Powder", "icon": "🌿", "keywords": ["coriander powder", "dhaniya powder", "dhania powder"], "exclude": ["leaves", "fresh coriander"]},
            {"name": "Cumin / Jeera", "icon": "🌱", "subtitle": "Whole / Powder", "keywords": ["jeera powder", "cumin powder", "jeera", "zeera"], "exclude": ["jeera biscuit", "jeera soda", "cumin seeds", "whole"]},
            {"name": "Garam Masala", "icon": "🥘", "keywords": ["garam masala", "catch garam masala", "everest garam masala"], "exclude": []},
            {"name": "Kitchen King Masala", "icon": "🥘", "keywords": ["kitchen king"], "exclude": []},
            {"name": "Black Pepper", "icon": "🧂", "subtitle": "Catch Sprinkler / Whole", "keywords": ["black pepper", "kali mirch", "pepper sprinkler", "catch black pepper"], "exclude": ["bell pepper"]},
            {"name": "Chaat Masala", "icon": "🥘", "keywords": ["chaat masala", "chat masala"], "exclude": ["fruit chaat"]},
            {"name": "Mustard Seeds", "icon": "⚫", "keywords": ["mustard seeds", "rai", "sarson ke dane", "black mustard seeds"], "exclude": ["mustard oil", "mustard sauce", "oats", "mixture"]},
            {"name": "Cumin Seeds", "icon": "🌱", "keywords": ["cumin seeds", "jeera whole", "zeera whole", "sabut jeera", "catch jeera whole"], "exclude": ["powder"]},
            {"name": "Cardamom", "icon": "🟢", "keywords": ["green cardamom", "elaichi", "cardamom"], "exclude": ["elaichi banana", "tea", "rusk", "yelakki"]},
            {"name": "Cinnamon", "icon": "🪵", "keywords": ["cinnamon stick", "dalchini", "cinnamon powder", "cinnamon"], "exclude": ["biscuit"]},
            {"name": "Cloves", "icon": "🟤", "keywords": ["cloves", "clove", "laung", "lavang"], "exclude": []},
            {"name": "Almonds", "icon": "🌰", "keywords": ["california almond", "almond", "badam"], "exclude": ["almond milk", "chocolate", "soap", "smoothie"]},
            {"name": "Cashews", "icon": "🥜", "keywords": ["cashew", "kaju"], "exclude": ["cookies", "biscuit"]},
            {"name": "Walnuts", "icon": "🌰", "keywords": ["walnut kernel", "walnut", "akhrot"], "exclude": []},
            {"name": "Raisins", "icon": "🍇", "keywords": ["seedless raisin", "raisin", "kishmish"], "exclude": []},
            {"name": "Dates", "icon": "🌴", "keywords": ["kimia dates", "dates", "khajoor", "khajur"], "exclude": ["syrup", "smoothie"]},
            {"name": "Mixed Dry Fruits", "icon": "🥜", "keywords": ["mixed dry fruit", "dry fruit mix", "panchmeva", "healthy nut mix"], "exclude": []},
            {"name": "Ginger-Garlic Paste", "icon": "🫙", "keywords": ["ginger garlic paste", "adrak lehsun paste"], "exclude": []},
            {"name": "Foxnuts / Makhana", "icon": "⚪", "keywords": ["makhana", "foxnut", "phool makhana", "roasted makhana"], "exclude": []}
        ]
    },
    {
        "id": "breakfast-sauces",
        "name": "Breakfast & Sauces",
        "icon": "🥣",
        "badge": "Morning & Condiments",
        "description": "Batters, spreads, jams & culinary sauces",
        "items": [
            {"name": "Dosa & Idli Batter", "icon": "🍲", "keywords": ["dosa batter", "idli batter", "idli & dosa batter", "idli and dosa batter", "id fresh batter"], "exclude": []},
            {"name": "Jam", "icon": "🍓", "keywords": ["kissan mixed fruit jam", "kissan jam", "fruit jam", "marmalade", "jam"], "exclude": ["jamun"]},
            {"name": "Peanut Butter", "icon": "🥜", "keywords": ["peanut butter", "pintola", "myfitness"], "exclude": []},
            {"name": "Ketchup", "icon": "🍅", "keywords": ["ketchup", "tomato ketchup", "kissan ketchup", "maggi ketchup", "heinz ketchup"], "exclude": ["chips"]},
            {"name": "Mayonnaise", "icon": "🫙", "keywords": ["mayonnaise", "mayo", "veg mayo"], "exclude": []},
            {"name": "Chutney", "icon": "🥣", "keywords": ["peanut chutney", "chutney", "mint chutney", "green chutney", "imli chutney", "coconut chutney"], "exclude": []},
            {"name": "Pasta Sauce", "icon": "🍝", "keywords": ["pasta sauce", "pizza sauce", "arrabbiata", "marinara", "barilla"], "exclude": []},
            {"name": "Hot Sauce", "icon": "🌶️", "keywords": ["hot sauce", "sriracha", "chilli sauce", "peri peri sauce", "tabasco"], "exclude": []},
            {"name": "Soy Sauce", "icon": "🍶", "keywords": ["soy sauce", "soya sauce", "dark soy sauce"], "exclude": []},
            {"name": "Honey", "icon": "🍯", "keywords": ["dabur honey", "saffola honey", "raw honey", "pure honey", "honey"], "exclude": ["green tea"]}
        ]
    },
    {
        "id": "tea-coffee-beverages",
        "name": "Tea, Coffee & Drinks",
        "icon": "☕",
        "badge": "Brews & Warm Drinks",
        "description": "Tea, specialty coffee & natural sweeteners",
        "items": [
            {"name": "Tea", "icon": "🫖", "keywords": ["tata tea", "red label tea", "taj mahal tea", "wagh bakri", "tea leaves", "black tea"], "exclude": ["green tea", "ice tea", "iced tea", "lemon and honey"]},
            {"name": "Coffee", "icon": "☕", "subtitle": "Sleepy Owl Vanilla", "keywords": ["sleepy owl", "nescafe", "bru coffee", "davidoff coffee", "filter coffee", "instant coffee", "coffee"], "exclude": ["candy", "ice cream", "zero sparkling coffee"]},
            {"name": "Stevia", "icon": "🌿", "keywords": ["sugar free green truly natural made from stevia", "stevia", "meethi tulsi", "natural stevia"], "exclude": []}
        ]
    },
    {
        "id": "munchies-snacks",
        "name": "Munchies & Biscuits",
        "icon": "🍿",
        "badge": "Evening Snacks",
        "description": "Savory snacks, nuts & biscuits",
        "items": [
            {"name": "Roasted Peanuts", "icon": "🥜", "keywords": ["roasted peanut", "masala peanut", "salted peanut", "kaveri's kitchen peanut", "singdana", "dev snacks masala peanut"], "exclude": ["peanut butter", "peanut crackers"]},
            {"name": "Namkeen / Mixture", "icon": "🥨", "keywords": ["namkeen", "mixture", "bhujia", "sev", "haldiram", "bikaji", "boondi", "papdi"], "exclude": []},
            {"name": "Biscuits", "icon": "🍪", "keywords": ["biscuit", "cookie", "cookies", "marie", "parle-g", "monaco", "bourbon", "good day", "hide & seek", "rusk"], "exclude": []},
            {"name": "Chips", "icon": "🥔", "keywords": ["chips", "crisps", "lays", "bingo", "doritos", "nachos", "pringles", "beetroot chips"], "exclude": ["chocolate chips"]},
            {"name": "Popcorn", "icon": "🍿", "keywords": ["popcorn", "act ii", "4700bc"], "exclude": []},
            {"name": "Crackers", "icon": "🍘", "keywords": ["namaskaram peanut crackers", "cracker", "peanut cracker", "cream cracker"], "exclude": ["firecrackers"]}
        ]
    },
    {
        "id": "household-petcare",
        "name": "Pet Care & Household",
        "icon": "🐾",
        "badge": "Home & Pets",
        "description": "Cat care, cleaning & household paper",
        "items": [
            {"name": "Cat Food", "icon": "🐱", "subtitle": "Dry / Wet", "keywords": ["sheba", "me-o", "whiskas adult tuna", "drools ocean fish", "drools double nutrition cat", "wet cat food", "dry cat food", "cat food"], "exclude": ["dog food", "puppy", "cat day poster"]},
            {"name": "Cat Poop Bags", "icon": "🛍️", "keywords": ["poop bags", "dog poop bags", "pet poop bags", "waste bag"], "exclude": []},
            {"name": "Toilet Paper", "icon": "🧻", "keywords": ["toilet roll", "toilet tissue roll", "kotton toilet", "toilet paper"], "exclude": []},
            {"name": "Kitchen Roll", "icon": "🗞️", "keywords": ["kitchen sponge wipe", "kitchen wipe", "microfiber kitchen wipe", "kitchen towel", "kitchen roll"], "exclude": ["gas lighter", "cleaner"]},
            {"name": "Colin / Glass Cleaner", "icon": "🪟", "keywords": ["colin glass cleaner", "glass cleaner", "colin"], "exclude": []},
            {"name": "Dishwash", "icon": "🍽️", "keywords": ["dishwash", "exo anti-bacterial dishwash", "vim", "pril", "dishwasher"], "exclude": ["cherry tomato"]},
            {"name": "Laundry Detergent", "icon": "🧺", "keywords": ["detergent powder", "liquid detergent", "surf excel", "ariel", "tide", "henko matic", "washing powder", "fabric conditioner"], "exclude": []},
            {"name": "Floor Cleaner", "icon": "🧹", "keywords": ["floor cleaner", "nimyle lemongrass", "lizol", "disinfectant floor"], "exclude": []},
            {"name": "Handwash Liquid", "icon": "🧴", "keywords": ["liquid handwash", "handwash", "hand wash", "dettol handwash", "lifebuoy handwash", "beco moisturising liquid handwash"], "exclude": ["body wash", "facewash"]},
            {"name": "Tissues", "icon": "📦", "keywords": ["napkin tissue paper", "facial tissue", "face tissue", "table napkin", "luncheon napkin", "tissues"], "exclude": ["toilet", "pads"]}
        ]
    }
]

# Build the structured category_sections list
final_sections = []

for sec in TARGET_TAXONOMY:
    sec_items = []
    for item_def in sec["items"]:
        kws = item_def["keywords"]
        excs = item_def["exclude"]
        
        # Match unified products
        matches = []
        for p in products:
            pname = p["canonical_name"].lower()
            pbrand = (p.get("brand") or "").lower()
            combined = f"{pname} {pbrand}"
            
            if any(exc in combined for exc in excs):
                continue
            if any(kw in combined for kw in kws):
                matches.append(p)
        
        matches.sort(key=lambda x: x.get("total_orders_count", 0), reverse=True)
        top_product = matches[0] if matches else None
        
        # Determine orderCount
        calc_orders = sum(m.get("total_orders_count", 0) for m in matches)
        
        # Check existing item map
        existing = existing_item_map.get(item_def["name"].lower())
        if not existing:
            # check variants
            for ex_name, ex_val in existing_item_map.items():
                if item_def["name"].lower() in ex_name or ex_name in item_def["name"].lower():
                    existing = ex_val
                    break
        
        final_count = max(calc_orders, existing.get("orderCount", 0) if existing else 0)
        if final_count == 0:
            final_count = 3  # default reasonable baseline for configured canonical staple
            
        image_url = None
        if top_product and top_product.get("image_url"):
            image_url = top_product["image_url"]
        elif existing and existing.get("imageUrl"):
            image_url = existing["imageUrl"]
            
        item_obj = {
            "name": item_def["name"],
            "icon": item_def["icon"],
            "orderCount": final_count
        }
        if item_def.get("subtitle"):
            item_obj["subtitle"] = item_def["subtitle"]
        if image_url:
            item_obj["imageUrl"] = image_url
            
        sec_items.append(item_obj)
        
    final_sections.append({
        "id": sec["id"],
        "name": sec["name"],
        "icon": sec["icon"],
        "badge": sec["badge"],
        "description": sec["description"],
        "itemCount": len(sec_items),
        "items": sec_items
    })

print(f"Generated {len(final_sections)} sections with {sum(s['itemCount'] for s in final_sections)} total canonical items.")

with open("data/category_sections.json", "w", encoding="utf-8") as f:
    json.dump(final_sections, f, indent=2, ensure_ascii=False)

print("Saved to data/category_sections.json successfully!")
