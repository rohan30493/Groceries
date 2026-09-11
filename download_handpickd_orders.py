import urllib.request
import json
import os
import time
from concurrent.futures import ThreadPoolExecutor, as_completed

TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJ1cmwiLCJ1c2VySWQiOiI0MWJjNzk4Yy02YTJjLTRjMDUtOWY1Mi1iZjg0YjA5YzM1Y2YiLCJyb2xlcyI6WyJWSVNJVE9SIiwiQ09OU1VNRVIiXSwiaWF0IjoxNzg5MTUwMzUxLCJleHAiOjE3ODkxNzE5NTF9.3U50ZMLOd9P2EodJmhp35d89f77uN3k3t1HJZDDk7Dc"

HEADERS = {
    "Accept": "*/*",
    "Authorization": f"Bearer {TOKEN}",
    "appId": "com.sorted.consumerflutterapp",
    "appVersion": "1.1.250",
    "storeid": "10102",
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36",
    "Origin": "https://app.handpickd.in",
    "Referer": "https://app.handpickd.in/"
}

IMAGE_CDN_BASE = "https://d69ugcdrlg41w.cloudfront.net/"

def fetch_json(url):
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=12) as resp:
        return json.loads(resp.read().decode("utf-8"))

def fetch_order_detail(order_item):
    oid = order_item.get("id")
    url = f"https://consumerapp.handpickd.farm/orders/{oid}"
    try:
        data = fetch_json(url)
        return data
    except Exception as e:
        print(f"Error fetching order {oid}: {e}")
        return order_item

def main():
    os.makedirs("data", exist_ok=True)
    print("🌿 Fetching Handpickd customer orders list...")
    list_url = "https://consumerapp.handpickd.farm/orders/customer"
    orders_list = fetch_json(list_url)
    print(f"✅ Found {len(orders_list)} total Handpickd orders!")

    print(f"⚡ Downloading detailed line items for all {len(orders_list)} orders...")
    detailed_orders = []
    with ThreadPoolExecutor(max_workers=6) as executor:
        futures = [executor.submit(fetch_order_detail, o) for o in orders_list]
        for f in as_completed(futures):
            detailed_orders.append(f.result())

    detailed_orders.sort(key=lambda x: x.get("submittedAt") or x.get("createdAt") or "", reverse=True)

    # Save raw
    with open("data/handpickd_orders_raw.json", "w", encoding="utf-8") as f:
        json.dump(detailed_orders, f, indent=2, ensure_ascii=False)
    print("💾 Saved raw payload to data/handpickd_orders_raw.json")

    # Normalize
    parsed_orders = []
    products_map = {}

    for o in detailed_orders:
        oid = o.get("id")
        code = o.get("displayOrderId") or oid
        status = o.get("status")
        placed_at = o.get("submittedAt") or o.get("createdAt")
        final_bill = o.get("finalBillAmount") or o.get("estimatedBillAmount") or 0.0

        items = []
        for it in (o.get("orderItems") or []):
            name = it.get("productName")
            if not name:
                continue
            cat = it.get("categoryName")
            qty = it.get("finalQuantity") or it.get("orderedQty") or 1
            uom = it.get("uom")
            price = it.get("finalAmount") or it.get("spGrossAmount") or 0.0
            mrp = it.get("mrpGrossAmount") or it.get("markedPrice") or price
            img = it.get("imageUrl")
            img_url = f"{IMAGE_CDN_BASE}{img}" if img else None
            meta = it.get("metadata") or {}
            pack_desc = meta.get("packetDescription")
            sku = it.get("skuCode")

            item_rec = {
                "sku": sku,
                "name": name,
                "category": cat,
                "quantity": qty,
                "unit": uom,
                "pack_description": pack_desc,
                "price": price,
                "mrp": mrp,
                "image_url": img_url
            }
            items.append(item_rec)

            p_key = name.strip()
            if p_key not in products_map:
                products_map[p_key] = {
                    "sku": sku,
                    "name": name,
                    "category": cat,
                    "unit": uom,
                    "pack_description": pack_desc,
                    "image_url": img_url,
                    "latest_price": price,
                    "times_ordered": 0,
                    "total_quantity": 0,
                    "total_spent": 0.0,
                    "first_ordered": placed_at,
                    "last_ordered": placed_at
                }
            pm = products_map[p_key]
            pm["times_ordered"] += 1
            pm["total_quantity"] = round(pm["total_quantity"] + qty, 2)
            pm["total_spent"] = round(pm["total_spent"] + price, 2)
            if not pm["image_url"] and img_url:
                pm["image_url"] = img_url
            if placed_at:
                if not pm["last_ordered"] or placed_at > pm["last_ordered"]:
                    pm["last_ordered"] = placed_at
                    pm["latest_price"] = price

        parsed_orders.append({
            "order_id": oid,
            "order_code": code,
            "platform": "HANDPICKD",
            "status": status,
            "placed_at": placed_at,
            "delivery_date": o.get("deliveryDate"),
            "total_amount": final_bill,
            "item_total": o.get("totalSpGrossAmount") or final_bill,
            "items_count": len(items),
            "items": items
        })

    with open("data/handpickd_orders.json", "w", encoding="utf-8") as f:
        json.dump(parsed_orders, f, indent=2, ensure_ascii=False)
    print(f"💾 Saved {len(parsed_orders)} orders to data/handpickd_orders.json")

    sorted_catalog = sorted(products_map.values(), key=lambda x: (x["times_ordered"], x["total_quantity"]), reverse=True)
    with open("data/handpickd_products.json", "w", encoding="utf-8") as f:
        json.dump(sorted_catalog, f, indent=2, ensure_ascii=False)
    print(f"💾 Saved {len(sorted_catalog)} Handpickd products to data/handpickd_products.json")

    total_spent = sum(o["total_amount"] for o in parsed_orders if "CANCELLED" not in (o["status"] or ""))
    earliest = parsed_orders[-1]["placed_at"][:10] if parsed_orders and parsed_orders[-1]["placed_at"] else "N/A"
    latest = parsed_orders[0]["placed_at"][:10] if parsed_orders and parsed_orders[0]["placed_at"] else "N/A"

    print("\n================ HANDPICKD REPORT ================")
    print(f"Total Handpickd Orders:   {len(parsed_orders)}")
    print(f"Order Range:              {earliest} to {latest}")
    print(f"Unique Vegetables/Fruits: {len(sorted_catalog)}")
    print(f"Total Amount Spent:       ₹{total_spent:,.2f}")
    print("\nTop 15 Most Frequently Ordered Produce on Handpickd:")
    for i, p in enumerate(sorted_catalog[:15], 1):
        print(f"  {i:2d}. {p['name']} ({p.get('category')}) - Ordered {p['times_ordered']}x | Total: {p['total_quantity']} {p.get('unit','')} | ₹{p['total_spent']:,.2f}")
    print("===================================================\n")

if __name__ == "__main__":
    main()
