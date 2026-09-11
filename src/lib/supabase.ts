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
  return {
    id: db.id,
    name: db.name,
    category: db.category,
    addedBy: (db.added_by as "Lira" | "Rohan" | "Pattern Suggestion") || "Lira",
    addedAt: db.added_at,
    isDone: db.is_done,
    notes: db.notes || undefined
  };
}

export function toDbItem(item: GroceryItem): DbGroceryItem {
  return {
    id: item.id,
    name: item.name,
    category: item.category,
    added_by: item.addedBy,
    added_at: item.addedAt,
    is_done: item.isDone,
    notes: item.notes || null,
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
