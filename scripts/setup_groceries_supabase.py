import sys, json, urllib.request

if len(sys.argv) < 3:
    print("Usage: python3 setup_groceries_supabase.py <SUPABASE_URL> <SUPABASE_ANON_OR_SERVICE_KEY>")
    sys.exit(1)

SUPABASE_URL = sys.argv[1].rstrip("/")
SUPABASE_KEY = sys.argv[2]

headers = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "resolution=merge-duplicates"
}

def post_batch(table, records):
    url = f"{SUPABASE_URL}/rest/v1/{table}"
    data = json.dumps(records).encode("utf-8")
    req = urllib.request.Request(url, data=data, headers=headers, method="POST")
    try:
        with urllib.request.urlopen(req) as resp:
            return resp.status
    except Exception as e:
        print(f"Error inserting into {table}: {e}")
        if hasattr(e, "read"):
            print(e.read().decode())
        return None

print(f"Connecting to Groceries Supabase at {SUPABASE_URL}...")

# 1. Category Sections
with open("data/category_sections.json") as f:
    cat_sections = json.load(f)

print(f"Uploading {len(cat_sections)} category sections...")
cat_records = [{
    "id": c["id"],
    "name": c["name"],
    "icon": c["icon"],
    "badge": c.get("badge", ""),
    "description": c.get("description", ""),
    "items": c.get("items", [])
} for c in cat_sections]
post_batch("household_category_sections", cat_records)

# 2. Pattern Rules
with open("data/pattern_rules.json") as f:
    pr = json.load(f)

print("Uploading pattern co-occurrence rules...")
post_batch("household_pattern_rules", [{
    "id": "household_master_rules",
    "companions": pr.get("companions", {}),
    "staples": pr.get("top_staples", [])
}])

# 3. Products
with open("data/unified_products.json") as f:
    products = json.load(f)

print(f"Uploading {len(products)} products in batches...")
prod_records = [{
    "id": f"prod-{idx+1}",
    "name": p.get("canonical_name", p.get("clean_name", f"Item-{idx+1}")),
    "category": p.get("category", "Groceries"),
    "order_count": p.get("total_orders_count", 0),
    "platforms": p.get("platforms", []),
    "last_ordered": None
} for idx, p in enumerate(products)]

for i in range(0, len(prod_records), 100):
    post_batch("household_products", prod_records[i:i+100])

# 4. Orders
with open("data/unified_orders.json") as f:
    orders = json.load(f)

print(f"Uploading {len(orders)} orders in batches...")
order_records = [{
    "order_id": str(o.get("order_id", o.get("id"))),
    "platform": o.get("platform", "Zepto"),
    "order_date": str(o.get("order_date", o.get("delivered_at", ""))),
    "total_amount": float(o.get("total_amount", 0) or 0),
    "items_count": len(o.get("items", [])),
    "items": o.get("items", [])
} for o in orders]

for i in range(0, len(order_records), 50):
    post_batch("household_orders", order_records[i:i+50])

print("Groceries Supabase database fully initialized!")
