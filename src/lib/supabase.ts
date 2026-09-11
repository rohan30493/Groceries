import { createClient } from "@supabase/supabase-js";
import { GroceryItem } from "./patterns";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://ymtzcoftaofshockhpck.supabase.co";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "sb_publishable_iNliYMfe5w_0jDajihxS5Q_MYgrm5F3";

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export interface DbGroceryItem {
  id: string;
  name: string;
  category: string;
  added_by: string;
  added_at: string;
  is_done: boolean;
  notes?: string | null;
  created_at?: string;
  updated_at?: string;
}

export function toGroceryItem(db: DbGroceryItem): GroceryItem {
  let purchasedAt: string | undefined = undefined;
  let customNote: string | undefined = db.notes || undefined;

  if (db.notes && db.notes.startsWith("{") && db.notes.endsWith("}")) {
    try {
      const parsed = JSON.parse(db.notes);
      if (parsed.purchased_at) purchasedAt = parsed.purchased_at;
      if (parsed.user_note !== undefined) customNote = parsed.user_note;
    } catch {
      // plain text notes
    }
  }

  return {
    id: db.id,
    name: db.name,
    category: db.category,
    addedBy: (db.added_by as "Lira" | "Rohan" | "Pattern Suggestion") || "Lira",
    addedAt: db.added_at,
    isDone: db.is_done,
    purchasedAt: purchasedAt,
    createdAt: db.created_at,
    notes: customNote
  };
}

export function toDbItem(item: GroceryItem): DbGroceryItem {
  // Store structured metadata such as purchased_at inside notes JSON cleanly
  const notesPayload = JSON.stringify({
    purchased_at: item.purchasedAt || null,
    user_note: item.notes || null
  });

  return {
    id: item.id,
    name: item.name,
    category: item.category,
    added_by: item.addedBy,
    added_at: item.addedAt,
    is_done: item.isDone,
    notes: notesPayload,
    updated_at: new Date().toISOString()
  };
}

// Fetch all active and recent items
export async function fetchGroceryItems(): Promise<GroceryItem[]> {
  try {
    const { data, error } = await supabase
      .from("grocery_items")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.warn("Error fetching items from Supabase:", error.message);
      return [];
    }
    return (data || []).map(toGroceryItem);
  } catch (err) {
    console.warn("Supabase fetch failed, fallback to local:", err);
    return [];
  }
}

// Upsert items (add or update)
export async function upsertGroceryItem(item: GroceryItem) {
  try {
    const dbItem = toDbItem(item);
    const { error } = await supabase.from("grocery_items").upsert(dbItem);
    if (error) console.error("Error upserting to Supabase:", error.message);
  } catch (err) {
    console.warn("Supabase upsert failed:", err);
  }
}

// Delete item
export async function deleteGroceryItemDb(id: string) {
  try {
    const { error } = await supabase.from("grocery_items").delete().eq("id", id);
    if (error) console.error("Error deleting from Supabase:", error.message);
  } catch (err) {
    console.warn("Supabase delete failed:", err);
  }
}

// Clear all completed items
export async function clearCompletedItemsDb() {
  try {
    const { error } = await supabase.from("grocery_items").delete().eq("is_done", true);
    if (error) console.error("Error clearing completed items:", error.message);
  } catch (err) {
    console.warn("Supabase clear completed failed:", err);
  }
}

// Archive a completed grocery run into household_orders and update product purchase frequencies
export async function archiveCompletedRun(completedItems: GroceryItem[]) {
  if (!completedItems || completedItems.length === 0) return;

  try {
    const orderId = `run-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const orderDate = new Date().toISOString().split("T")[0];

    const orderRecord = {
      order_id: orderId,
      platform: "HOUSEHOLD_APP",
      order_date: orderDate,
      total_amount: 0,
      items_count: completedItems.length,
      items: completedItems.map((it) => ({
        name: it.name,
        category: it.category,
        added_by: it.addedBy,
        added_at: it.addedAt,
        purchased_at: it.purchasedAt || new Date().toISOString()
      }))
    };

    // 1. Insert completed order into household_orders
    const { error: orderErr } = await supabase.from("household_orders").insert(orderRecord);
    if (orderErr) {
      console.warn("Could not archive order to household_orders:", orderErr.message);
    }

    // 2. Clear completed items from grocery_items
    await clearCompletedItemsDb();
  } catch (err) {
    console.warn("archiveCompletedRun exception:", err);
  }
}

// Fetch dynamic category sections from Supabase (falls back to local JSON if empty/offline)
export async function fetchCategorySectionsDb() {
  try {
    const { data, error } = await supabase
      .from("household_category_sections")
      .select("*")
      .order("id", { ascending: true });

    if (error || !data || data.length === 0) return null;
    return data;
  } catch {
    return null;
  }
}

// Fetch dynamic pattern co-occurrence rules from Supabase
export async function fetchPatternRulesDb() {
  try {
    const { data, error } = await supabase
      .from("household_pattern_rules")
      .select("*")
      .eq("id", "household_master_rules")
      .single();

    if (error || !data) return null;
    return data;
  } catch {
    return null;
  }
}
