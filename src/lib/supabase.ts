import { createClient } from "@supabase/supabase-js";
import { GroceryItem, detectCategory } from "./patterns";
import { HouseholdOrder } from "./orderLifecycle";
import { normalizeRawOrder } from "./purchaseMemory";
import { BasketHandoffState } from "./handoff";

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
  let isOrdered: boolean | undefined = undefined;
  let orderedAt: string | undefined = undefined;
  let orderedBy: "Rohan" | "Lira" | undefined = undefined;

  if (db.notes && db.notes.startsWith("{") && db.notes.endsWith("}")) {
    try {
      const parsed = JSON.parse(db.notes);
      if (parsed.purchased_at) purchasedAt = parsed.purchased_at;
      if (parsed.user_note !== undefined) customNote = parsed.user_note;
      if (parsed.is_ordered !== undefined) isOrdered = Boolean(parsed.is_ordered);
      if (parsed.ordered_at) orderedAt = parsed.ordered_at;
      if (parsed.ordered_by) orderedBy = parsed.ordered_by;
    } catch {
      // plain text notes
    }
  }

  const detected = detectCategory(db.name);
  const resolvedCategory =
    !db.category || db.category === "Other Items" || (detected !== "Other Items" && db.category !== detected)
      ? detected
      : db.category;

  return {
    id: db.id,
    name: db.name,
    category: resolvedCategory,
    addedBy: (db.added_by as "Lira" | "Rhythm" | "Rohan" | "Pattern Suggestion") || "Lira",
    addedAt: db.added_at,
    isDone: db.is_done,
    purchasedAt: purchasedAt,
    createdAt: db.created_at,
    notes: customNote,
    isOrdered,
    orderedAt,
    orderedBy
  };
}

export function toDbItem(item: GroceryItem): DbGroceryItem {
  // Store structured metadata such as purchased_at and ordered info inside notes JSON cleanly
  const notesPayload = JSON.stringify({
    purchased_at: item.purchasedAt || null,
    user_note: item.notes || null,
    is_ordered: item.isOrdered || null,
    ordered_at: item.orderedAt || null,
    ordered_by: item.orderedBy || null
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
      .neq("id", "__household_handoff_state__")
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

// Clear active basket items from grocery_items
export async function clearActiveBasketDb(itemIds?: string[]) {
  try {
    if (itemIds && itemIds.length > 0) {
      const filtered = itemIds.filter((id) => id !== "__household_handoff_state__");
      if (filtered.length > 0) {
        const { error } = await supabase.from("grocery_items").delete().in("id", filtered);
        if (error) console.error("Error clearing basket items:", error.message);
      }
    } else {
      const { error } = await supabase
        .from("grocery_items")
        .delete()
        .neq("id", "__household_handoff_state__")
        .eq("is_done", false);
      if (error) console.error("Error clearing basket items:", error.message);
    }
  } catch (err) {
    console.warn("Supabase clear active basket failed:", err);
  }
}

// Save a household order with normalized line items to household_orders
export async function saveHouseholdOrder(order: HouseholdOrder): Promise<boolean> {
  try {
    const payload = {
      order_id: order.orderId,
      platform: order.platform,
      order_date: order.placedAt,
      total_amount: order.totalAmount,
      items_count: order.itemsCount,
      items: order.items.map((it) => ({
        id: it.id,
        name: it.name,
        canonical_name: it.canonicalName,
        quantity: it.quantity,
        unit: it.unit,
        price: it.price,
        total: it.total,
        status: it.status,
        delivered_at: it.deliveredAt,
        category: it.category
      }))
    };
    const { error } = await supabase.from("household_orders").upsert(payload);
    if (error) {
      console.warn("Error saving household order to Supabase:", error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.warn("saveHouseholdOrder exception:", err);
    return false;
  }
}

export async function updateHouseholdOrder(order: HouseholdOrder): Promise<boolean> {
  return saveHouseholdOrder(order);
}

// Fetch all household orders from Supabase
export async function fetchHouseholdOrders(): Promise<HouseholdOrder[]> {
  try {
    const { data, error } = await supabase
      .from("household_orders")
      .select("*")
      .order("created_at", { ascending: false });

    if (error || !data) {
      return [];
    }
    return data.map(normalizeRawOrder);
  } catch (err) {
    console.warn("fetchHouseholdOrders exception:", err);
    return [];
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

export const HANDOFF_RECORD_ID = "__household_handoff_state__";

// Save basket handoff state to Supabase so it synchronizes across all devices
export async function saveHandoffStateDb(handoffState: BasketHandoffState) {
  try {
    const payload = {
      id: HANDOFF_RECORD_ID,
      name: "__HANDOFF_STATE__",
      category: "System",
      added_by: "Lira",
      added_at: handoffState.handoffAt || new Date().toISOString(),
      is_done: handoffState.status === "ordered",
      notes: JSON.stringify(handoffState),
      updated_at: new Date().toISOString()
    };
    const { error } = await supabase.from("grocery_items").upsert(payload);
    if (error) console.error("Error syncing handoff state to Supabase:", error.message);
  } catch (err) {
    console.warn("saveHandoffStateDb failed:", err);
  }
}

// Fetch basket handoff state from Supabase
export async function fetchHandoffStateDb(): Promise<BasketHandoffState | null> {
  try {
    const { data, error } = await supabase
      .from("grocery_items")
      .select("notes")
      .eq("id", HANDOFF_RECORD_ID)
      .single();

    if (error || !data || !data.notes) return null;
    const parsed = JSON.parse(data.notes);
    if (parsed && parsed.status) {
      return parsed as BasketHandoffState;
    }
    return null;
  } catch (err) {
    console.warn("fetchHandoffStateDb failed:", err);
    return null;
  }
}

