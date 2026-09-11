import json
import os
from collections import defaultdict

def parse():
    raw_path = "data/zepto_orders_raw.json"
    if not os.path.exists(raw_path):
        print(f"Error: {raw_path} not found!")
        return

    with open(raw_path, "r", encoding="utf-8") as f:
        raw_orders = json.load(f)

    print(f"Processing {len(raw_orders)} raw orders...")

    parsed_orders = []
    products_map = {}
    monthly_spending = defaultdict(lambda: {"spent": 0.0, "orders": 0, "items": 0})
    category_map = defaultdict(lambda: {"count": 0, "total_spent": 0.0})

    for o in raw_orders:
        placed_at = o.get("placedTime")
        month_key = placed_at[:7] if placed_at else "Unknown"

        order_info = {
            "order_id": o.get("id"),
            "order_code": o.get("code"),
            "status": o.get("formattedStatus") or o.get("status"),
            "placed_at": placed_at,
            "total_amount": (o.get("grandTotalAmount", 0) or 0) / 100.0,
            "item_total": (o.get("itemTotalAmount", 0) or 0) / 100.0,
            "items_count": o.get("itemQuantityCount", 0),
            "delivery_address": o.get("userAddressFormatted"),
            "store_id": o.get("storeId"),
            "items": []
        }

        # Track monthly
        if order_info["status"] != "CANCELLED":
            monthly_spending[month_key]["spent"] += order_info["total_amount"]
            monthly_spending[month_key]["orders"] += 1

        shipments = (o.get("orderShipmentDetails") or []) + (o.get("childOrderShipmentDetails") or [])
        for s in shipments:
            if not isinstance(s, dict):
                continue
            order_products_v2 = s.get("orderProductsV2") or {}
            if isinstance(order_products_v2, dict):
                sections = order_products_v2.get("sectionData") or []
                for sec in sections:
                    if not isinstance(sec, dict):
                        continue
                    order_products = sec.get("orderProducts") or []
                    for op in order_products:
                        if not isinstance(op, dict):
                            continue

                        sp = op.get("storeProduct") or {}
                        prod = sp.get("product") or op.get("product") or {}
                        pv = sp.get("productVariant") or op.get("productVariant") or {}

                        p_id = prod.get("id") or op.get("id") or sp.get("id")
                        name = prod.get("name") or op.get("name") or "Unknown Product"
                        pack_size = pv.get("formattedPacksize") or prod.get("packsize") or prod.get("unit") or pv.get("packsize")
                        unit_selling_price = op.get("unitSellingPrice") or op.get("unitFinalSellingPrice") or sp.get("discountedSellingPrice") or op.get("unitMRP") or sp.get("mrp") or 0
                        unit_mrp = op.get("unitMRP") or sp.get("mrp") or unit_selling_price or 0
                        price = round(unit_selling_price / 100.0, 2)
                        mrp = round(unit_mrp / 100.0, 2)
                        qty = op.get("quantityOrdered") or op.get("quantityFulfilled") or op.get("quantity") or 1

                        # Product images
                        image_paths = pv.get("images") or prod.get("images") or []
                        image_url = None
                        if image_paths and isinstance(image_paths, list):
                            first_img = image_paths[0]
                            path_str = first_img.get("path") if isinstance(first_img, dict) else str(first_img)
                            if path_str:
                                image_url = f"https://cdn.zeptonow.com/production/tr:w-600,ar-100-100,pr-true,f-auto,q-80/{path_str}"

                        brand = prod.get("brand") or prod.get("brandName")
                        sub_category_id = prod.get("primarySubCategoryId")

                        item_record = {
                            "product_id": p_id,
                            "name": name,
                            "pack_size": pack_size,
                            "quantity": qty,
                            "price": price,
                            "mrp": mrp,
                            "total": round(price * qty, 2),
                            "image_url": image_url,
                            "brand": brand,
                            "sub_category_id": sub_category_id
                        }
                        order_info["items"].append(item_record)

                        if order_info["status"] != "CANCELLED":
                            monthly_spending[month_key]["items"] += qty

                        # Update product catalog
                        if p_id and name != "Unknown Product":
                            if p_id not in products_map:
                                products_map[p_id] = {
                                    "id": p_id,
                                    "name": name,
                                    "pack_size": pack_size,
                                    "price": price,
                                    "mrp": mrp,
                                    "image_url": image_url,
                                    "brand": brand,
                                    "sub_category_id": sub_category_id,
                                    "times_ordered": 0,
                                    "total_qty_ordered": 0,
                                    "total_spent_on_item": 0.0,
                                    "first_ordered_at": placed_at,
                                    "last_ordered_at": placed_at
                                }
                            p_entry = products_map[p_id]
                            p_entry["times_ordered"] += 1
                            p_entry["total_qty_ordered"] += qty
                            p_entry["total_spent_on_item"] = round(p_entry["total_spent_on_item"] + (price * qty), 2)
                            # Keep best image and pack size if available
                            if not p_entry["image_url"] and image_url:
                                p_entry["image_url"] = image_url
                            if not p_entry["pack_size"] and pack_size:
                                p_entry["pack_size"] = pack_size
                            if placed_at:
                                if not p_entry["last_ordered_at"] or placed_at > p_entry["last_ordered_at"]:
                                    p_entry["last_ordered_at"] = placed_at
                                    # latest price
                                    p_entry["price"] = price
                                    p_entry["mrp"] = mrp
                                if not p_entry["first_ordered_at"] or placed_at < p_entry["first_ordered_at"]:
                                    p_entry["first_ordered_at"] = placed_at

        # If items_count was 0 or None, recalculate
        if not order_info["items_count"] and order_info["items"]:
            order_info["items_count"] = sum(it["quantity"] for it in order_info["items"])

        parsed_orders.append(order_info)

    # Sort parsed orders by placed_at descending
    parsed_orders.sort(key=lambda x: x.get("placed_at") or "", reverse=True)

    # Save orders.json
    orders_path = "data/orders.json"
    with open(orders_path, "w", encoding="utf-8") as f:
        json.dump(parsed_orders, f, indent=2, ensure_ascii=False)
    print(f"💾 Saved {len(parsed_orders)} orders to {orders_path}")

    # Catalog sorted by frequency and quantity
    catalog = sorted(products_map.values(), key=lambda x: (x["times_ordered"], x["total_qty_ordered"]), reverse=True)
    products_path = "data/products.json"
    with open(products_path, "w", encoding="utf-8") as f:
        json.dump(catalog, f, indent=2, ensure_ascii=False)
    print(f"💾 Saved {len(catalog)} unique products to {products_path}")

    # Stats & Metrics
    total_spent = sum(o["total_amount"] for o in parsed_orders if o["status"] != "CANCELLED")
    delivered_orders = [o for o in parsed_orders if o["status"] == "DELIVERED"]
    earliest = parsed_orders[-1]["placed_at"][:10] if parsed_orders and parsed_orders[-1]["placed_at"] else "N/A"
    latest = parsed_orders[0]["placed_at"][:10] if parsed_orders and parsed_orders[0]["placed_at"] else "N/A"

    stats = {
        "total_orders": len(parsed_orders),
        "delivered_orders": len(delivered_orders),
        "cancelled_orders": len(parsed_orders) - len(delivered_orders),
        "total_unique_products": len(catalog),
        "total_amount_spent": round(total_spent, 2),
        "earliest_order_date": earliest,
        "latest_order_date": latest,
        "monthly_spending": dict(sorted(monthly_spending.items()))
    }
    with open("data/stats.json", "w", encoding="utf-8") as f:
        json.dump(stats, f, indent=2)
    print("💾 Saved high-level metrics to data/stats.json")

    print("\n================ COMPREHENSIVE ORDERS REPORT ================")
    print(f"Total Orders:          {stats['total_orders']}")
    print(f"Delivered Orders:      {stats['delivered_orders']}")
    print(f"History Range:         {earliest} to {latest}")
    print(f"Total Unique Products: {stats['total_unique_products']}")
    print(f"Total Money Spent:     ₹{stats['total_amount_spent']:,.2f}")
    print("\nTop 20 Most Frequently Ordered Products:")
    for i, p in enumerate(catalog[:20], 1):
        brand_str = f"[{p['brand']}] " if p.get('brand') else ""
        print(f"  {i:2d}. {brand_str}{p['name']} ({p['pack_size'] or 'Standard'}) - Ordered {p['times_ordered']}x | Total: {p['total_qty_ordered']} units | Total: ₹{p['total_spent_on_item']:,.2f}")
    print("============================================================\n")

if __name__ == "__main__":
    parse()
