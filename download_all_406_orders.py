import urllib.request
import json
import os
import time
from concurrent.futures import ThreadPoolExecutor, as_completed

COOKIE_STR = """device_id=539e356a-34ff-4421-b7ae-26f4c7b0faa4; marketplace=SUPER_SAVER; ext_name=ojplmecpdpgccookcobabopnaifgidhf; pwa=false; unique_browser_id=1786914247106497; user_position=%7B%22latitude%22%3A12.950072012905265%2C%22longitude%22%3A77.69371803422973%7D; latitude=12.950072012905265; longitude=77.69371803422973; bhacls=6f99afb9-ed5a-4b38-a963-a85f3edec354; aws-waf-token=22886959-d610-440f-93bc-6109ab25fb93:BQoAe/x9gI4NAAAA:1EzI5xuAGkZLxbXJ/L68ULwlms4GwxkYIPQJlNqH/lbBgsAjAFiASlesQ4QnSAckU5vGDZH91bXgxaLqtuBiu2b6F/rHpGQLqO+qTKnX8BZv9A7nwjExUukJrp1xIlX61kVGg7ZisRdffTHIdcTOuVUAEMkOnglIW1lp6YdZEFWqmrulasP7XPhKap2cgNXW3iWTje59riifh3tqbfG/6bDuss2M8L0K1dRq3OfO3R/IhS5AbF7Ku/nmoVP7LJaNe+eG4DhP0RPfT5/azXdL6xLKvbqpZ28POKV9nvewgqpQT4bxdxbKk/VKKTbNt6Y=; session_id=0c26fe71-cf49-4fd8-9688-6b72ad7bf699; session_count=52; prev_store_id=6e2378a8-458e-4aff-b783-80685cf86a43; _gcl_au=1.1.46964575.1789149304; _ga=GA1.1.1194769321.1789149304; _fbp=fb.1.1789149305141.419465539747172571; accessToken=eyJhbGciOiJIUzUxMiJ9.eyJ2ZXJzaW9uIjoxLCJzdWIiOiJjNDc5MjIyMS01YTM2LTQ4NDktOWRhNS1hMjFmZWE5MTZiOWUiLCJpYXQiOjE3ODkxNDkzMjMsImV4cCI6MTc4OTE1MjkyM30.Xq65Z_00k6wRfCB8OkWsoZFjVaV7nO6C_zvkd_jR65UkTOGYEFTSge1Phkl894GQoqH2VBeSEvOb6F53DO6b3g; refreshToken=090b8c34-0852-489e-b3f3-53580417a8b2; isAuth=true; user_id=c4792221-5a36-4849-9da5-a21fea916b9e; zeptoPassDetails=false; serviceability=%7B%22primaryStore%22%3A%7B%22etaInMinutes%22%3A%226%22%2C%22isDeliverable%22%3Atrue%2C%22isNightlyStore%22%3Afalse%2C%22serviceable%22%3Atrue%2C%22storeConstruct%22%3A%22PRIMARY_STORE%22%2C%22storeId%22%3A%226e2378a8-458e-4aff-b783-80685cf86a43%22%7D%2C%22secondaryStore%22%3A%7B%22etaInMinutes%22%3A%2229%22%2C%22isDeliverable%22%3Atrue%2C%22isNightlyStore%22%3Afalse%2C%22serviceable%22%3Atrue%2C%22storeConstruct%22%3A%22SECONDARY_STORE%22%2C%22storeId%22%3A%221c9e155e-83a8-457a-a687-01eabb1e7a36%22%7D%2C%22storesData%22%3A%7B%226e2378a8-458e-4aff-b783-80685cf86a43%22%3A%7B%22etaInMinutes%22%3A%226%22%2C%22isDeliverable%22%3Atrue%2C%22isNightlyStore%22%3Afalse%2C%22serviceable%22%3Atrue%2C%22storeConstruct%22%3A%22PRIMARY_STORE%22%2C%22storeId%22%3A%226e2378a8-458e-4aff-b783-80685cf86a43%22%7D%2C%221c9e155e-83a8-457a-a687-01eabb1e7a36%22%3A%7B%22etaInMinutes%22%3A%2229%22%2C%22isDeliverable%22%3Atrue%2C%22isNightlyStore%22%3Afalse%2C%22serviceable%22%3Atrue%2C%22storeConstruct%22%3A%22SECONDARY_STORE%22%2C%22storeId%22%3A%221c9e155e-83a8-457a-a687-01eabb1e7a36%22%7D%7D%2C%22etaInformation%22%3A%7B%22secondaryText%22%3A%226%20minutes%22%7D%2C%22storeDetailedInfo%22%3A%7B%22city%22%3A%22Bengaluru%22%2C%22name%22%3A%22BLR-Aswath%20Nagar%22%7D%2C%22timeSaved%22%3A1789149324631%7D; ssi=%7B%22storeServiceability%22%3A%7B%22data%22%3A%7B%221c9e155e-83a8-457a-a687-01eabb1e7a36%22%3A%7B%22cost%22%3A11756%2C%22eta%22%3A29%2C%22type%22%3A%22SECONDARY_STORE%22%7D%2C%226e2378a8-458e-4aff-b783-80685cf86a43%22%3A%7B%22cost%22%3A341%2C%22eta%22%3A6%2C%22type%22%3A%22PRIMARY_STORE%22%7D%7D%2C%22version%22%3A%22v1%22%7D%2C%22storeServiceabilityView%22%3A%7B%221c9e155e-83a8-457a-a687-01eabb1e7a36%22%3A%7B%22deliverableSubtype%22%3A%22ETA_SURGE_IN_DEMAND%22%2C%22etaInMinutes%22%3A29%2C%22isDeliverable%22%3Atrue%2C%22isNightlyStore%22%3Afalse%2C%22serviceable%22%3Atrue%2C%22storeConstruct%22%3A%22SECONDARY_STORE%22%7D%2C%226e2378a8-458e-4aff-b783-80685cf86a43%22%3A%7B%22deliverableSubtype%22%3A%22ETA_NORMAL_WITH_FULL_DELIVERY%22%2C%22etaInMinutes%22%3A6%2C%22isDeliverable%22%3Atrue%2C%22isNightlyStore%22%3Afalse%2C%22serviceable%22%3Atrue%2C%22storeConstruct%22%3A%22PRIMARY_STORE%22%7D%7D%2C%22timeSaved%22%3A1789149324631%7D; _ga_52LKG2B3L1=GS2.1.s1789149304$o1$g1$t1789149361$j3$l0$h1709502643; csrfSecret=88IUZY1BzR4; XSRF-TOKEN=hktbj33ZmNp_jrlspMxB2%3AawtOqksL5dzWQr2W1g95qYxJLjs.4cL%2FpAUpH70Daxog4RkC1zLqb6PnzUfbQ7sB61Lj1No""".strip()
TOKEN = "eyJhbGciOiJIUzUxMiJ9.eyJ2ZXJzaW9uIjoxLCJzdWIiOiJjNDc5MjIyMS01YTM2LTQ4NDktOWRhNS1hMjFmZWE5MTZiOWUiLCJpYXQiOjE3ODkxNDkzMjMsImV4cCI6MTc4OTE1MjkyM30.Xq65Z_00k6wRfCB8OkWsoZFjVaV7nO6C_zvkd_jR65UkTOGYEFTSge1Phkl894GQoqH2VBeSEvOb6F53DO6b3g"

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36",
    "Cookie": COOKIE_STR,
    "Authorization": f"Bearer {TOKEN}",
    "Accept": "application/json",
    "Referer": "https://www.zepto.com/",
    "Origin": "https://www.zepto.com"
}

def fetch_json(url, retries=3):
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, headers=HEADERS)
            with urllib.request.urlopen(req, timeout=12) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except Exception as e:
            if attempt == retries - 1:
                raise e
            time.sleep(0.5 * (attempt + 1))

def fetch_order_detail(order_summary):
    order_id = order_summary.get("id")
    url = f"https://bff-gateway.zeptonow.com/api/v2/order/{order_id}/"
    try:
        detail = fetch_json(url)
        return detail
    except Exception as e:
        print(f"Error fetching order {order_id}: {e}")
        return order_summary

def main():
    os.makedirs("data", exist_ok=True)
    
    # 1. Fetch order list
    all_summary_orders = []
    print("📦 Step 1: Discovering all orders across history...")
    page_number = 1
    while True:
        url = f"https://bff-gateway.zeptonow.com/api/v2/order/?page_number={page_number}"
        try:
            res = fetch_json(url)
            orders = res.get("orders", [])
            if not orders:
                break
            all_summary_orders.extend(orders)
            print(f"  Page {page_number:2d}: +{len(orders)} orders (Total: {len(all_summary_orders)})")
            page_number += 1
            time.sleep(0.1)
        except Exception as e:
            print(f"Error fetching page {page_number}: {e}")
            break

    print(f"\n🎉 Total discovered orders: {len(all_summary_orders)}")

    # 2. Fetch full itemized details using multi-threading
    print(f"\n⚡ Step 2: Downloading full details for all {len(all_summary_orders)} orders (with 8 concurrent workers)...")
    detailed_orders = []
    completed = 0
    total = len(all_summary_orders)

    with ThreadPoolExecutor(max_workers=8) as executor:
        future_to_order = {executor.submit(fetch_order_detail, o): o for o in all_summary_orders}
        for future in as_completed(future_to_order):
            try:
                res = future.result()
                detailed_orders.append(res)
            except Exception as e:
                orig = future_to_order[future]
                detailed_orders.append(orig)
            completed += 1
            if completed % 25 == 0 or completed == total:
                print(f"  Progress: {completed}/{total} orders downloaded ({completed*100//total}%)")

    # Sort detailed orders by placedTime descending
    detailed_orders.sort(key=lambda x: x.get("placedTime") or "", reverse=True)

    # Save raw data
    raw_path = "data/zepto_orders_raw.json"
    with open(raw_path, "w", encoding="utf-8") as f:
        json.dump(detailed_orders, f, indent=2, ensure_ascii=False)
    print(f"\n💾 Saved raw payload to {raw_path}")

    # 3. Normalize into structured orders & product catalog
    print("\n🔍 Step 3: Parsing order items, prices, pack sizes, images and categories...")
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

        # Check orderShipmentDetails or childOrderShipmentDetails
        shipments = o.get("orderShipmentDetails") or o.get("childOrderShipmentDetails") or []
        for s in shipments:
            order_products_v2 = s.get("orderProductsV2", {})
            if isinstance(order_products_v2, dict):
                sections = order_products_v2.get("sectionData", [])
                for sec in sections:
                    for op in sec.get("orderProducts", []):
                        sp = op.get("storeProduct", {})
                        prod = sp.get("product", {})
                        pv = sp.get("productVariant", {})

                        p_id = prod.get("id") or op.get("id")
                        name = prod.get("name")
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

                        brand = prod.get("brand") or prod.get("brandName")
                        item_record = {
                            "product_id": p_id,
                            "name": name,
                            "pack_size": pack_size,
                            "quantity": qty,
                            "price": price,
                            "mrp": mrp,
                            "total": round(price * qty, 2),
                            "image_url": image_url,
                            "brand": brand
                        }
                        order_info["items"].append(item_record)

                        if p_id and name:
                            if p_id not in products_map:
                                products_map[p_id] = {
                                    "id": p_id,
                                    "name": name,
                                    "pack_size": pack_size,
                                    "price": price,
                                    "mrp": mrp,
                                    "image_url": image_url,
                                    "brand": brand,
                                    "times_ordered": 0,
                                    "total_qty_ordered": 0,
                                    "last_ordered_at": order_info["placed_at"]
                                }
                            products_map[p_id]["times_ordered"] += 1
                            products_map[p_id]["total_qty_ordered"] += qty
                            if order_info["placed_at"] and (not products_map[p_id]["last_ordered_at"] or order_info["placed_at"] > products_map[p_id]["last_ordered_at"]):
                                products_map[p_id]["last_ordered_at"] = order_info["placed_at"]

        # If order items count wasn't filled or shipments empty, count items
        if not order_info["items_count"] and order_info["items"]:
            order_info["items_count"] = sum(it["quantity"] for it in order_info["items"])

        parsed_orders.append(order_info)

    # Save normalized orders
    with open("data/orders.json", "w", encoding="utf-8") as f:
        json.dump(parsed_orders, f, indent=2, ensure_ascii=False)
    print("💾 Saved structured orders to data/orders.json")

    # Sort catalog by frequency
    sorted_catalog = sorted(products_map.values(), key=lambda x: (x["times_ordered"], x["total_qty_ordered"]), reverse=True)
    with open("data/products.json", "w", encoding="utf-8") as f:
        json.dump(sorted_catalog, f, indent=2, ensure_ascii=False)
    print(f"💾 Saved catalog of {len(sorted_catalog)} unique products to data/products.json")

    # Overall statistics
    total_spent = sum(o["total_amount"] for o in parsed_orders)
    total_items = sum(len(o["items"]) for o in parsed_orders)
    earliest_date = parsed_orders[-1]["placed_at"][:10] if parsed_orders and parsed_orders[-1]["placed_at"] else "N/A"
    latest_date = parsed_orders[0]["placed_at"][:10] if parsed_orders and parsed_orders[0]["placed_at"] else "N/A"

    print("\n================ FINAL SUMMARY ================")
    print(f"Total Orders Downloaded: {len(parsed_orders)}")
    print(f"Order History Range:     {earliest_date} to {latest_date}")
    print(f"Total Items Purchased:   {total_items}")
    print(f"Unique Products Catalog: {len(sorted_catalog)}")
    print(f"Total Amount Spent:      ₹{total_spent:,.2f}")
    print("\nTop 15 Most Frequently Ordered Products:")
    for i, p in enumerate(sorted_catalog[:15], 1):
        print(f"  {i:2d}. {p['name']} ({p['pack_size']}) - Ordered {p['times_ordered']}x | Total: {p['total_qty_ordered']} units")
    print("================================================\n")

if __name__ == "__main__":
    main()
