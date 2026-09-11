import json
import re
from difflib import SequenceMatcher
from collections import defaultdict

def similarity(a, b):
    return SequenceMatcher(None, a.lower(), b.lower()).ratio()

def clean_name(name):
    # Remove Kannada transliterations in brackets like (Eerulli), (Hoo Kosu), (Aloo Gadde)
    name = re.sub(r"\s*\([^)]*[\u0C80-\u0CFFa-zA-Z\s]*\)\s*", " ", name)
    # Remove excessive whitespaces
    return " ".join(name.split()).strip()

def merge_datasets():
    with open("data/orders.json", "r", encoding="utf-8") as f:
        zepto_orders = json.load(f)
    for o in zepto_orders:
        o["platform"] = "ZEPTO"

    with open("data/swiggy_orders.json", "r", encoding="utf-8") as f:
        swiggy_orders = json.load(f)
    for o in swiggy_orders:
        o["platform"] = "SWIGGY_INSTAMART"

    with open("data/handpickd_orders.json", "r", encoding="utf-8") as f:
        handpickd_orders = json.load(f)
    for o in handpickd_orders:
        o["platform"] = "HANDPICKD"

    all_orders = zepto_orders + swiggy_orders + handpickd_orders
    all_orders.sort(key=lambda x: x.get("placed_at") or "", reverse=True)

    with open("data/unified_orders.json", "w", encoding="utf-8") as f:
        json.dump(all_orders, f, indent=2, ensure_ascii=False)

    print(f"✅ Merged {len(all_orders)} total orders ({len(zepto_orders)} Zepto + {len(swiggy_orders)} Swiggy + {len(handpickd_orders)} Handpickd)")

    # Read Zepto products catalog
    with open("data/products.json", "r", encoding="utf-8") as f:
        zepto_products = json.load(f)

    # Build master product catalog
    master_catalog = {}

    for p in zepto_products:
        c_name = clean_name(p["name"])
        master_catalog[c_name.lower()] = {
            "canonical_name": p["name"],
            "clean_name": c_name,
            "brand": p.get("brand"),
            "category": "Groceries",
            "pack_size": p.get("pack_size"),
            "image_url": p.get("image_url"),
            "latest_zepto_price": p.get("price"),
            "latest_swiggy_price": None,
            "latest_handpickd_price": None,
            "zepto_orders_count": p.get("times_ordered", 0),
            "swiggy_orders_count": 0,
            "handpickd_orders_count": 0,
            "total_orders_count": p.get("times_ordered", 0),
            "total_units_bought": p.get("total_qty_ordered", 0),
            "total_spent": p.get("total_spent_on_item", 0.0),
            "platforms": ["ZEPTO"],
            "last_ordered_at": p.get("last_ordered_at")
        }

    # Merge Swiggy products
    with open("data/swiggy_products.json", "r", encoding="utf-8") as f:
        swiggy_products = json.load(f)

    for sp in swiggy_products:
        c_name = clean_name(sp["name"])
        key = c_name.lower()

        matched_key = None
        if key in master_catalog:
            matched_key = key
        else:
            for existing_key in list(master_catalog.keys()):
                if similarity(key, existing_key) > 0.82:
                    matched_key = existing_key
                    break

        if matched_key:
            entry = master_catalog[matched_key]
            entry["swiggy_orders_count"] += sp["times_ordered"]
            entry["total_orders_count"] += sp["times_ordered"]
            entry["total_units_bought"] += sp["total_qty_ordered"]
            entry["total_spent"] = round(entry["total_spent"] + sp["total_spent"], 2)
            entry["latest_swiggy_price"] = sp["latest_price"]
            if "SWIGGY_INSTAMART" not in entry["platforms"]:
                entry["platforms"].append("SWIGGY_INSTAMART")
            if sp["last_ordered"] and (not entry["last_ordered_at"] or sp["last_ordered"] > entry["last_ordered_at"]):
                entry["last_ordered_at"] = sp["last_ordered"]
        else:
            master_catalog[key] = {
                "canonical_name": sp["name"],
                "clean_name": c_name,
                "brand": None,
                "category": "Groceries",
                "pack_size": None,
                "image_url": None,
                "latest_zepto_price": None,
                "latest_swiggy_price": sp["latest_price"],
                "latest_handpickd_price": None,
                "zepto_orders_count": 0,
                "swiggy_orders_count": sp["times_ordered"],
                "handpickd_orders_count": 0,
                "total_orders_count": sp["times_ordered"],
                "total_units_bought": sp["total_qty_ordered"],
                "total_spent": sp["total_spent"],
                "platforms": ["SWIGGY_INSTAMART"],
                "last_ordered_at": sp["last_ordered"]
            }

    # Merge Handpickd products
    with open("data/handpickd_products.json", "r", encoding="utf-8") as f:
        handpickd_products = json.load(f)

    for hp in handpickd_products:
        c_name = clean_name(hp["name"])
        if "insert card" in c_name.lower():
            continue
        key = c_name.lower()

        matched_key = None
        if key in master_catalog:
            matched_key = key
        else:
            for existing_key in list(master_catalog.keys()):
                if similarity(key, existing_key) > 0.80:
                    matched_key = existing_key
                    break

        if matched_key:
            entry = master_catalog[matched_key]
            entry["handpickd_orders_count"] += hp["times_ordered"]
            entry["total_orders_count"] += hp["times_ordered"]
            entry["total_units_bought"] = round(entry["total_units_bought"] + hp["total_quantity"], 2)
            entry["total_spent"] = round(entry["total_spent"] + hp["total_spent"], 2)
            entry["latest_handpickd_price"] = hp["latest_price"]
            if not entry.get("image_url") and hp.get("image_url"):
                entry["image_url"] = hp["image_url"]
            if "HANDPICKD" not in entry["platforms"]:
                entry["platforms"].append("HANDPICKD")
            if hp["last_ordered"] and (not entry["last_ordered_at"] or hp["last_ordered"] > entry["last_ordered_at"]):
                entry["last_ordered_at"] = hp["last_ordered"]
        else:
            master_catalog[key] = {
                "canonical_name": hp["name"],
                "clean_name": c_name,
                "brand": "Handpickd Farm",
                "category": hp.get("category") or "Vegetables",
                "pack_size": hp.get("pack_description") or hp.get("unit"),
                "image_url": hp.get("image_url"),
                "latest_zepto_price": None,
                "latest_swiggy_price": None,
                "latest_handpickd_price": hp["latest_price"],
                "zepto_orders_count": 0,
                "swiggy_orders_count": 0,
                "handpickd_orders_count": hp["times_ordered"],
                "total_orders_count": hp["times_ordered"],
                "total_units_bought": hp["total_quantity"],
                "total_spent": hp["total_spent"],
                "platforms": ["HANDPICKD"],
                "last_ordered_at": hp["last_ordered"]
            }

    sorted_catalog = sorted(master_catalog.values(), key=lambda x: (x["total_orders_count"], x["total_units_bought"]), reverse=True)

    with open("data/unified_products.json", "w", encoding="utf-8") as f:
        json.dump(sorted_catalog, f, indent=2, ensure_ascii=False)
    print(f"✅ Created unified catalog with {len(sorted_catalog)} unique products in data/unified_products.json")

    # Grand statistics
    zepto_spent = sum(o.get("total_amount", 0) for o in zepto_orders if o.get("status") != "CANCELLED")
    swiggy_spent = sum(o.get("total_amount", 0) for o in swiggy_orders)
    handpickd_spent = sum(o.get("total_amount", 0) for o in handpickd_orders if "CANCELLED" not in (o.get("status") or ""))
    total_spent = zepto_spent + swiggy_spent + handpickd_spent

    stats = {
        "total_orders": len(all_orders),
        "zepto_orders": len(zepto_orders),
        "swiggy_orders": len(swiggy_orders),
        "handpickd_orders": len(handpickd_orders),
        "zepto_spent": round(zepto_spent, 2),
        "swiggy_spent": round(swiggy_spent, 2),
        "handpickd_spent": round(handpickd_spent, 2),
        "total_spent": round(total_spent, 2),
        "total_unique_products": len(sorted_catalog),
        "earliest_order": all_orders[-1]["placed_at"][:10] if all_orders and all_orders[-1]["placed_at"] else "N/A",
        "latest_order": all_orders[0]["placed_at"][:10] if all_orders and all_orders[0]["placed_at"] else "N/A"
    }

    with open("data/unified_stats.json", "w", encoding="utf-8") as f:
        json.dump(stats, f, indent=2)
    print("✅ Saved overall analytics to data/unified_stats.json")

    print("\n================ UNIFIED GROCERY ECOSYSTEM REPORT ================")
    print(f"Total Orders Across Platforms: {stats['total_orders']}")
    print(f"  • Zepto Orders:              {stats['zepto_orders']} (₹{stats['zepto_spent']:,.2f})")
    print(f"  • Swiggy Instamart Orders:   {stats['swiggy_orders']} (₹{stats['swiggy_spent']:,.2f})")
    print(f"Grand Total Grocery Spend:     ₹{stats['total_spent']:,.2f}")
    print(f"History Range:                 {stats['earliest_order']} to {stats['latest_order']}")
    print(f"Unified Unique Products:       {stats['total_unique_products']}")
    print("\nTop 20 Cross-Platform Grocery Staples (All Time):")
    for i, p in enumerate(sorted_catalog[:20], 1):
        plats = " + ".join(p["platforms"])
        print(f"  {i:2d}. {p['clean_name']} - {p['total_orders_count']} orders ({p['total_units_bought']} units) | ₹{p['total_spent']:,.2f} | [{plats}]")
    print("==================================================================\n")

if __name__ == "__main__":
    merge_datasets()
