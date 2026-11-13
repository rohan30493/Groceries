import urllib.request
import json
import os
import time

COOKIE_STR = os.getenv("ZEPTO_COOKIE", "").strip()
TOKEN = os.getenv("ZEPTO_TOKEN", "").strip()

if not COOKIE_STR or not TOKEN:
    print("Warning: ZEPTO_COOKIE or ZEPTO_TOKEN not set in environment. Scrape requests may fail.")

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36",
    "Cookie": COOKIE_STR,
    "Authorization": f"Bearer {TOKEN}",
    "Accept": "application/json",
    "Referer": "https://www.zepto.com/",
    "Origin": "https://www.zepto.com"
}

def fetch_json(url):
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=15) as resp:
        return json.loads(resp.read().decode("utf-8"))

def main():
    os.makedirs("data", exist_ok=True)
    all_summary_orders = []
    page = 1
    limit = 20

    print("🚀 Starting download of all Zepto orders...")
    while True:
        url = f"https://bff-gateway.zeptonow.com/api/v2/order/?page={page}&limit={limit}"
        print(f"Fetching order list page {page}...")
        try:
            res = fetch_json(url)
            orders = res.get("orders", [])
            if not orders:
                print(f"No more orders on page {page}.")
                break
            all_summary_orders.extend(orders)
            print(f"  Got {len(orders)} orders (Total so far: {len(all_summary_orders)})")
            if len(orders) < limit:
                break
            page += 1
            time.sleep(0.3)
        except Exception as e:
            print(f"Error fetching page {page}: {e}")
            break

    print(f"\n✅ Total orders found in history: {len(all_summary_orders)}")

    # Now fetch detailed information for each order
    detailed_orders = []
    for idx, o in enumerate(all_summary_orders, 1):
        order_id = o.get("id")
        code = o.get("code", order_id)
        print(f"[{idx}/{len(all_summary_orders)}] Fetching details for Order #{code} ({order_id})...")
        try:
            detail_url = f"https://bff-gateway.zeptonow.com/api/v2/order/{order_id}/"
            detail = fetch_json(detail_url)
            detailed_orders.append(detail)
            time.sleep(0.2)
        except Exception as e:
            print(f"  Failed fetching details for {order_id}: {e}")
            detailed_orders.append(o)

    # Save raw data
    raw_path = "data/zepto_orders_raw.json"
    with open(raw_path, "w", encoding="utf-8") as f:
        json.dump(detailed_orders, f, indent=2, ensure_ascii=False)
    print(f"💾 Raw orders saved to {raw_path}")

    # Process and normalize data for app consumption
    parsed_orders = []
    products_map = {}

    for o in detailed_orders:
        order_info = {
            "order_id": o.get("id"),
            "order_code": o.get("code"),
            "status": o.get("formattedStatus") or o.get("status"),
            "placed_at": o.get("placedTime"),
            "total_amount": (o.get("grandTotalAmount", 0) or 0) / 100.0,
            "item_total": (o.get("itemTotalAmount", 0) or 0) / 100.0,
            "items_count": o.get("itemQuantityCount", 0),
            "delivery_address": o.get("userAddressFormatted"),
            "items": []
        }

        # Extract items from shipments
        shipments = o.get("orderShipmentDetails", [])
        for s in shipments:
            order_products_v2 = s.get("orderProductsV2", {})
            if isinstance(order_products_v2, dict):
                sections = order_products_v2.get("sectionData", [])
                for sec in sections:
                    for op in sec.get("orderProducts", []):
                        sp = op.get("storeProduct", {})
                        prod = sp.get("product", {})
                        p_id = prod.get("id") or op.get("id")
                        name = prod.get("name")
                        # Extract variant and pricing details
                        pv = sp.get("productVariant", {})
                        pack_size = pv.get("formattedPacksize") or prod.get("packsize") or prod.get("unit")
                        unit_selling_price = op.get("unitSellingPrice") or op.get("unitFinalSellingPrice") or sp.get("discountedSellingPrice") or op.get("unitMRP") or sp.get("mrp") or 0
                        unit_mrp = op.get("unitMRP") or sp.get("mrp") or unit_selling_price or 0
                        price = unit_selling_price / 100.0
                        mrp = unit_mrp / 100.0
                        qty = op.get("quantityOrdered") or op.get("quantityFulfilled") or 1
                        
                        image_paths = pv.get("images") or prod.get("images") or []
                        image_url = None
                        if image_paths and isinstance(image_paths, list):
                            first_img = image_paths[0]
                            path_str = first_img.get("path") if isinstance(first_img, dict) else str(first_img)
                            if path_str:
                                image_url = f"https://cdn.zeptonow.com/production/tr:w-600,ar-100-100,pr-true,f-auto,q-80/{path_str}"

                        item_record = {
                            "product_id": p_id,
                            "name": name,
                            "pack_size": pack_size,
                            "quantity": qty,
                            "price": price,
                            "mrp": mrp,
                            "total": round(price * qty, 2),
                            "image_url": image_url,
                            "brand": prod.get("brand") or prod.get("brandName")
                        }
                        order_info["items"].append(item_record)

                        # Add to product catalog
                        if p_id:
                            if p_id not in products_map:
                                products_map[p_id] = {
                                    "id": p_id,
                                    "name": name,
                                    "pack_size": pack_size,
                                    "price": price,
                                    "mrp": mrp,
                                    "image_url": image_url,
                                    "brand": item_record["brand"],
                                    "times_ordered": 0,
                                    "total_qty_ordered": 0,
                                    "last_ordered_at": order_info["placed_at"]
                                }
                            products_map[p_id]["times_ordered"] += 1
                            products_map[p_id]["total_qty_ordered"] += qty

        parsed_orders.append(order_info)

    # Save normalized orders
    with open("data/orders.json", "w", encoding="utf-8") as f:
        json.dump(parsed_orders, f, indent=2, ensure_ascii=False)
    print("💾 Cleaned orders saved to data/orders.json")

    # Save unique catalog
    sorted_catalog = sorted(products_map.values(), key=lambda x: x["times_ordered"], reverse=True)
    with open("data/products.json", "w", encoding="utf-8") as f:
        json.dump(sorted_catalog, f, indent=2, ensure_ascii=False)
    print(f"💾 Product catalog ({len(sorted_catalog)} items) saved to data/products.json")

    print("\n================ SUMMARY ================")
    print(f"Total Orders Downloaded: {len(parsed_orders)}")
    print(f"Total Unique Products:   {len(sorted_catalog)}")
    total_spent = sum(o["total_amount"] for o in parsed_orders)
    print(f"Total Spent across all orders: ₹{total_spent:,.2f}")
    print("\nTop 10 Most Frequently Ordered Items:")
    for i, p in enumerate(sorted_catalog[:10], 1):
        print(f"  {i}. {p['name']} ({p['pack_size']}) - Ordered {p['times_ordered']}x (Total qty: {p['total_qty_ordered']})")
    print("=========================================\n")

if __name__ == "__main__":
    main()
