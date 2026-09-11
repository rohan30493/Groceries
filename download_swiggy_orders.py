import imaplib
import email
import email.utils
import json
import os
import re
import time
from datetime import datetime
from html.parser import HTMLParser
from collections import defaultdict

class TextExtractor(HTMLParser):
    def __init__(self):
        super().__init__()
        self.text = []
    def handle_data(self, d):
        s = d.strip()
        if s:
            self.text.append(s)

def parse_email_body(msg):
    body = ""
    if msg.is_multipart():
        for part in msg.walk():
            ct = part.get_content_type()
            cd = str(part.get("Content-Disposition"))
            if ct == "text/html" and "attachment" not in cd:
                body = part.get_payload(decode=True).decode("utf-8", errors="ignore")
                break
            elif ct == "text/plain" and not body:
                body = part.get_payload(decode=True).decode("utf-8", errors="ignore")
    else:
        body = msg.get_payload(decode=True).decode("utf-8", errors="ignore")
    return body

def parse_instamart_text(text, email_date_str):
    lines = [l.strip() for l in text.splitlines() if l.strip()]
    
    order_id = None
    address = None
    items = []
    summary = {}
    
    state = "INIT"
    for i, line in enumerate(lines):
        line_lower = line.lower()
        if "order id:" in line_lower:
            if i + 1 < len(lines):
                order_id = lines[i+1].strip()
        elif "order #" in line_lower and not order_id:
            m = re.search(r"order\s*#([0-9]+)", line_lower)
            if m:
                order_id = m.group(1)
        elif line_lower == "deliver to:":
            if i + 1 < len(lines):
                address = lines[i+1].strip()
        elif line_lower == "order items":
            state = "ITEMS"
        elif line_lower in ["order summary", "bill summary"]:
            state = "SUMMARY"
        elif state == "ITEMS":
            # Check for item lines like "1 x Nandini GoodLife Toned Milk" or "2 x Gowardhan Fresh Paneer"
            m = re.match(r"^(\d+)\s*x\s*(.+)$", line)
            if m:
                qty = int(m.group(1))
                name = m.group(2).strip()
                price = 0.0
                if i + 1 < len(lines) and lines[i+1].startswith("₹"):
                    try:
                        price = float(lines[i+1].replace("₹", "").replace(",", "").strip())
                    except:
                        pass
                items.append({
                    "name": name,
                    "quantity": qty,
                    "price": round(price / qty if qty > 0 and price > 0 else price, 2),
                    "total": price
                })
        elif state == "SUMMARY":
            if line.startswith("₹") and i > 0:
                key = lines[i-1].strip()
                try:
                    summary[key] = float(line.replace("₹", "").replace(",", "").strip())
                except:
                    pass
            if any(k in line_lower for k in ["get the app", "follow us", "need help", "contact support"]):
                break

    # Parse timestamp
    iso_date = None
    try:
        dt_tuple = email.utils.parsedate_to_datetime(email_date_str)
        iso_date = dt_tuple.isoformat()
    except:
        iso_date = email_date_str

    item_bill = summary.get("Item Bill", 0.0)
    grand_total = summary.get("Grand Total", 0.0)
    if grand_total == 0.0 and item_bill > 0:
        grand_total = item_bill

    return {
        "order_id": order_id,
        "order_code": order_id,
        "platform": "SWIGGY_INSTAMART",
        "status": "DELIVERED",
        "placed_at": iso_date,
        "delivery_address": address,
        "items": items,
        "items_count": sum(it["quantity"] for it in items),
        "item_total": item_bill,
        "total_amount": grand_total,
        "summary_breakdown": summary
    }

def main():
    email_addr = "rohan.agar@gmail.com"
    app_pw = "zwvmgkeexrzhnehc"

    print("🔌 Connecting to Gmail IMAP...")
    mail = imaplib.IMAP4_SSL("imap.gmail.com")
    mail.login(email_addr, app_pw)
    mail.select("\"[Gmail]/All Mail\"", readonly=True)

    print("🔍 Searching for all Swiggy Instamart order emails...")
    s1, m1 = mail.search(None, "(SUBJECT \"Instamart order\")")
    ids1 = m1[0].split() if s1 == "OK" else []
    s2, m2 = mail.search(None, "(FROM \"instamart.in\")")
    ids2 = m2[0].split() if s2 == "OK" else []
    s3, m3 = mail.search(None, "(FROM \"swiggy.in\" SUBJECT \"Instamart\")")
    ids3 = m3[0].split() if s3 == "OK" else []

    all_ids = sorted(list(set(ids1 + ids2 + ids3)), key=lambda x: int(x))
    total = len(all_ids)
    print(f"📬 Found {total} total Instamart emails in your inbox!")

    orders_dict = {}
    batch_size = 25

    print(f"⚡ Downloading and parsing in batches of {batch_size}...")
    for idx in range(0, total, batch_size):
        chunk = all_ids[idx:idx + batch_size]
        batch_ids = b",".join(chunk)
        try:
            status, data = mail.fetch(batch_ids, "(RFC822)")
            if status != "OK":
                continue
            
            for item in data:
                if not isinstance(item, tuple) or len(item) < 2:
                    continue
                raw_email = item[1]
                msg = email.message_from_bytes(raw_email)
                email_date = msg.get("Date", "")
                subject = msg.get("Subject", "")

                body_html = parse_email_body(msg)
                extractor = TextExtractor()
                extractor.feed(body_html)
                full_text = "\n".join(extractor.text)

                parsed = parse_instamart_text(full_text, email_date)
                if parsed and parsed.get("order_id"):
                    oid = parsed["order_id"]
                    # If duplicate, keep one with items
                    if oid not in orders_dict or (not orders_dict[oid]["items"] and parsed["items"]):
                        orders_dict[oid] = parsed
        except Exception as e:
            print(f"  Error on batch {idx}-{idx+len(chunk)}: {e}")

        progress = min(idx + batch_size, total)
        if progress % 50 == 0 or progress == total:
            print(f"  Progress: {progress}/{total} emails processed ({len(orders_dict)} valid orders found)")

    mail.logout()
    print("🔒 Gmail connection closed.")

    parsed_swiggy_orders = sorted(orders_dict.values(), key=lambda x: x.get("placed_at") or "", reverse=True)
    os.makedirs("data", exist_ok=True)
    with open("data/swiggy_orders.json", "w", encoding="utf-8") as f:
        json.dump(parsed_swiggy_orders, f, indent=2, ensure_ascii=False)
    print(f"\n💾 Saved {len(parsed_swiggy_orders)} Swiggy Instamart orders to data/swiggy_orders.json")

    # Build Swiggy product catalog
    swiggy_products = {}
    for o in parsed_swiggy_orders:
        for it in o.get("items", []):
            name = it["name"]
            if not name:
                continue
            if name not in swiggy_products:
                swiggy_products[name] = {
                    "name": name,
                    "times_ordered": 0,
                    "total_qty_ordered": 0,
                    "total_spent": 0.0,
                    "latest_price": it["price"],
                    "first_ordered": o["placed_at"],
                    "last_ordered": o["placed_at"]
                }
            sp = swiggy_products[name]
            sp["times_ordered"] += 1
            sp["total_qty_ordered"] += it["quantity"]
            sp["total_spent"] = round(sp["total_spent"] + it["total"], 2)
            if o["placed_at"]:
                if not sp["last_ordered"] or o["placed_at"] > sp["last_ordered"]:
                    sp["last_ordered"] = o["placed_at"]
                    sp["latest_price"] = it["price"]
                if not sp["first_ordered"] or o["placed_at"] < sp["first_ordered"]:
                    sp["first_ordered"] = o["placed_at"]

    swiggy_catalog = sorted(swiggy_products.values(), key=lambda x: (x["times_ordered"], x["total_qty_ordered"]), reverse=True)
    with open("data/swiggy_products.json", "w", encoding="utf-8") as f:
        json.dump(swiggy_catalog, f, indent=2, ensure_ascii=False)
    print(f"💾 Saved {len(swiggy_catalog)} unique Swiggy Instamart products to data/swiggy_products.json")

    # Print summary
    swiggy_total_spent = sum(o["total_amount"] for o in parsed_swiggy_orders)
    earliest = parsed_swiggy_orders[-1]["placed_at"][:10] if parsed_swiggy_orders and parsed_swiggy_orders[-1]["placed_at"] else "N/A"
    latest = parsed_swiggy_orders[0]["placed_at"][:10] if parsed_swiggy_orders and parsed_swiggy_orders[0]["placed_at"] else "N/A"

    print("\n================ SWIGGY INSTAMART REPORT ================")
    print(f"Total Instamart Orders:    {len(parsed_swiggy_orders)}")
    print(f"Order Range:               {earliest} to {latest}")
    print(f"Unique Products Ordered:   {len(swiggy_catalog)}")
    print(f"Total Amount Spent:        ₹{swiggy_total_spent:,.2f}")
    print("\nTop 15 Most Frequently Ordered Items on Instamart:")
    for i, p in enumerate(swiggy_catalog[:15], 1):
        print(f"  {i:2d}. {p['name']} - Ordered {p['times_ordered']}x | Total: {p['total_qty_ordered']} units | ₹{p['total_spent']:,.2f}")
    print("=========================================================\n")

if __name__ == "__main__":
    main()
