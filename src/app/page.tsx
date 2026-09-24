"use client";

import React, { useState, useEffect, useMemo } from "react";
import {
  ShoppingCart,
  Plus,
  Check,
  Trash2,
  Sparkles,
  Mic,
  MicOff,
  Copy,
  RotateCcw,
  Lightbulb,
  Heart,
  UserCheck,
  CheckCircle2,
  Circle,
  AlertCircle,
  Search,
  Grid,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Package,
  Truck,
  XCircle,
  Clock,
  Bell,
  BellRing,
  X
} from "lucide-react";
import {
  GroceryItem,
  detectCategory,
  parseNaturalLanguageList,
  getMissingItemSuggestions,
  CompanionSuggestion,
  patternRules,
  CATEGORY_SECTIONS as DEFAULT_CATEGORY_SECTIONS,
  CategorySection,
  CategoryItemDef,
  getItemVisual,
  CATEGORY_ICONS
} from "../lib/patterns";
import {
  supabase,
  fetchGroceryItems,
  upsertGroceryItem,
  deleteGroceryItemDb,
  clearCompletedItemsDb,
  archiveCompletedRun,
  fetchCategorySectionsDb,
  fetchPatternRulesDb,
  saveHouseholdOrder,
  fetchHouseholdOrders,
  updateHouseholdOrder,
  clearActiveBasketDb,
  toGroceryItem,
  DbGroceryItem,
  saveHandoffStateDb,
  fetchHandoffStateDb,
  HANDOFF_RECORD_ID
} from "../lib/supabase";
import {
  BasketHandoffState,
  LIRA_HANDOFF_MESSAGE,
  initHandoffState,
  registerBasketActivity,
  liraCompleteAndHandoff,
  canPlaceOrder,
  executePlaceOrder,
  resetBasketState,
  getLiraAutonomousRecommendations,
  AutonomousRecommendation
} from "../lib/handoff";
import {
  HouseholdOrder,
  OrderStatus,
  OrderItemStatus,
  createOrderFromBasket,
  updateOrderStatus,
  updateOrderItemOutcome,
  recordItemToOrders
} from "../lib/orderLifecycle";
import {
  getDefaultHistoricalOrders,
  getCanonicalPurchaseMemory,
  isItemInActiveOrder,
  normalizeRawOrder
} from "../lib/purchaseMemory";
import {
  evaluateHandoffNotification,
  estimateBasketValue,
  formatNotificationPreview,
  HandoffNotification
} from "../lib/handoffNotification";
import {
  getBrowserNotificationPermission,
  requestNotificationPermission,
  sendBrowserHandoffNotification,
  NotificationPermissionStatus
} from "../lib/pushNotifications";

// Helper to format human-readable time (e.g., "9:15 AM" or "Yesterday, 8:40 PM")
function formatEventTime(isoStringOrText?: string): string {
  if (!isoStringOrText) return "";
  if (!isoStringOrText.includes("-") && !isoStringOrText.includes("T")) {
    return isoStringOrText;
  }
  try {
    const d = new Date(isoStringOrText);
    if (isNaN(d.getTime())) return isoStringOrText;
    const now = new Date();
    const isToday =
      d.getDate() === now.getDate() &&
      d.getMonth() === now.getMonth() &&
      d.getFullYear() === now.getFullYear();

    const timeStr = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    if (isToday) return `Today, ${timeStr}`;
    return `${d.toLocaleDateString([], { month: "short", day: "numeric" })}, ${timeStr}`;
  } catch {
    return isoStringOrText;
  }
}

// Helper to format item ordered timestamp (e.g. "Ordered 14 Sep, 10:42 AM" or "Ordered today, 10:42 AM")
function formatItemOrderedTime(isoStringOrText?: string): string {
  if (!isoStringOrText) return "Ordered recently";
  try {
    const d = new Date(isoStringOrText);
    if (isNaN(d.getTime())) return `Ordered ${isoStringOrText}`;
    const timeStr = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    const dateStr = d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
    return `Ordered ${dateStr}, ${timeStr}`;
  } catch {
    return `Ordered ${isoStringOrText}`;
  }
}

// Helper to check if an item was ordered within the past 24 hours (1 day retention)
function isWithin24Hours(isoStringOrDate?: string): boolean {
  if (!isoStringOrDate) return false;
  try {
    const d = new Date(isoStringOrDate);
    const time = d.getTime();
    if (isNaN(time)) return false;
    const diff = Date.now() - time;
    return diff >= 0 && diff <= 24 * 60 * 60 * 1000;
  } catch {
    return false;
  }
}

// Helpers for Order History formatting: "Sep 12 · ₹2,840"
function formatOrderHeaderDate(isoDateOrStr?: string): string {
  if (!isoDateOrStr) return "Recent Order";
  try {
    const d = new Date(isoDateOrStr);
    if (isNaN(d.getTime())) return isoDateOrStr;
    const isCurrentYear = d.getFullYear() === new Date().getFullYear();
    return d.toLocaleDateString("en-IN", {
      month: "short",
      day: "numeric",
      ...(!isCurrentYear && { year: "numeric" })
    });
  } catch {
    return isoDateOrStr;
  }
}

function formatOrderAmount(amount?: number): string {
  if (!amount || isNaN(amount) || amount === 0) return "";
  return ` · ₹${Math.round(amount).toLocaleString("en-IN")}`;
}

function formatPlatformName(platform?: string): string {
  if (!platform) return "Zepto";
  const p = platform.trim();
  if (p === "SWIGGY_INSTAMART") return "Swiggy Instamart";
  if (p === "ZEPTO") return "Zepto";
  if (p === "HANDPICKD") return "Handpickd";
  if (p === "HOUSEHOLD_APP") return "Household App";
  return p;
}

// Item Thumbnail Component with catalog image lookup & category icon fallback
function GroceryItemThumbnail({ itemName, category }: { itemName: string; category?: string }) {
  const [imageError, setImageError] = useState(false);
  const visual = useMemo(() => getItemVisual(itemName, category), [itemName, category]);

  // Reset image error state if item name changes
  useEffect(() => {
    setImageError(false);
  }, [itemName]);

  if (visual.imageUrl && !imageError) {
    return (
      <div className="w-10 h-10 rounded-xl overflow-hidden bg-slate-100 border border-slate-200/80 shrink-0 shadow-2xs relative flex items-center justify-center">
        <img
          src={visual.imageUrl}
          alt={itemName}
          loading="lazy"
          className="w-full h-full object-cover"
          onError={() => setImageError(true)}
        />
      </div>
    );
  }

  return (
    <div className="w-10 h-10 rounded-xl bg-slate-100/90 border border-slate-200/80 flex items-center justify-center text-xl shrink-0 select-none shadow-2xs">
      <span>{visual.icon || "🛒"}</span>
    </div>
  );
}

// Initial sample items to populate the list on first load
const INITIAL_ITEMS: GroceryItem[] = [];

export default function GroceryAssistantApp() {
  const [activeTab, setActiveTab] = useState<"lira" | "rhythm" | "orders">("lira");
  const [items, setItems] = useState<GroceryItem[]>(INITIAL_ITEMS);
  const [inputText, setInputText] = useState("");
  const [isListening, setIsListening] = useState(false);
  const [copiedNotification, setCopiedNotification] = useState(false);
  const [dismissedSuggestions, setDismissedSuggestions] = useState<Set<string>>(new Set());

  // Order history and active orders
  const [orders, setOrders] = useState<HouseholdOrder[]>(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem("household_orders_cache");
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed) && parsed.length > 0) return parsed;
        }
      } catch {}
    }
    return getDefaultHistoricalOrders();
  });
  const [expandedOrderIds, setExpandedOrderIds] = useState<Set<string>>(new Set());
  const [ordersFilter, setOrdersFilter] = useState<"ALL" | "ORDER_PLACED" | "DELIVERED" | "CANCELLED">("ALL");
  const [ordersDisplayLimit, setOrdersDisplayLimit] = useState<number>(30);

  // Dynamic category sections loaded from Supabase (falls back to DEFAULT_CATEGORY_SECTIONS)
  const [categorySections, setCategorySections] = useState<CategorySection[]>(DEFAULT_CATEGORY_SECTIONS);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>("fruits-vegetables");
  const [categorySearchQuery, setCategorySearchQuery] = useState<string>("");
  const [recentlyAddedAnimation, setRecentlyAddedAnimation] = useState<string | null>(null);
  const [deletingItemIds, setDeletingItemIds] = useState<Set<string>>(new Set());
  const [lastAddedItem, setLastAddedItem] = useState<string | null>(null);
  const [isCloudSynced, setIsCloudSynced] = useState<boolean>(false);

  // Gated order handoff state (Lira builds autonomously, then hands off with 'I’m done. Please proceed with order.')
  const [handoffState, setHandoffState] = useState<BasketHandoffState>(() => initHandoffState(0));
  const [acknowledgedNotificationIds, setAcknowledgedNotificationIds] = useState<Set<string>>(new Set());
  const [browserNotificationPermission, setBrowserNotificationPermission] = useState<NotificationPermissionStatus>("default");

  // Collapsible section states to minimize visual clutter in Lira's view
  const [isRecommendationsExpanded, setIsRecommendationsExpanded] = useState<boolean>(false);
  const [isCategoryItemsExpanded, setIsCategoryItemsExpanded] = useState<boolean>(false);

  // Load from localStorage on mount & sync with Supabase in real time
  useEffect(() => {
    // 1. Initial fast local load
    try {
      const saved = localStorage.getItem("household_grocery_items");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setItems(parsed);
        }
      }
      const savedHandoff = localStorage.getItem("household_basket_handoff_state");
      if (savedHandoff) {
        const parsedHandoff = JSON.parse(savedHandoff);
        if (parsedHandoff && parsedHandoff.status) {
          setHandoffState(parsedHandoff);
        }
      }
      const savedAck = localStorage.getItem("household_ack_notifications");
      if (savedAck) {
        const parsedAck = JSON.parse(savedAck);
        if (Array.isArray(parsedAck)) {
          setAcknowledgedNotificationIds(new Set(parsedAck));
        }
      }
      setBrowserNotificationPermission(getBrowserNotificationPermission());
    } catch (e) {
      console.error("Local load error", e);
    }

    // 2. Fetch fresh items and handoff state from Supabase
    fetchGroceryItems().then((dbItems) => {
      if (dbItems && dbItems.length > 0) {
        setItems(dbItems);
      }
      setIsCloudSynced(true);
    });

    fetchHandoffStateDb().then((dbHandoff) => {
      if (dbHandoff && dbHandoff.status) {
        setHandoffState(dbHandoff);
      }
    });

    // 3. Fetch dynamic category sections & rules from Supabase (continuous replenishment learning)
    fetchCategorySectionsDb().then((sections) => {
      if (sections && sections.length > 0) {
        const orderMap = new Map(DEFAULT_CATEGORY_SECTIONS.map((c, i) => [c.id, i]));
        const sorted = [...sections].sort(
          (a, b) => (orderMap.get(a.id) ?? 999) - (orderMap.get(b.id) ?? 999)
        );
        setCategorySections(sorted as CategorySection[]);
      }
    });

    // 4. Fetch household orders from Supabase & merge with default historical orders
    fetchHouseholdOrders().then((dbOrders) => {
      if (dbOrders && dbOrders.length > 0) {
        setOrders((prev) => {
          const dbIds = new Set(dbOrders.map((o) => o.orderId));
          const merged = [...dbOrders];
          for (const p of prev) {
            if (!dbIds.has(p.orderId)) {
              merged.push(p);
            }
          }
          return merged;
        });
      }
    });

    // 5. Supabase Realtime multi-device subscription (Lira & Rohan stay synced)
    const channel = supabase
      .channel("household-grocery-changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "grocery_items" },
        (payload) => {
          if (payload.eventType === "INSERT" || payload.eventType === "UPDATE") {
            const raw = payload.new as DbGroceryItem;
            if (raw.id === HANDOFF_RECORD_ID) {
              if (raw.notes) {
                try {
                  const parsed = JSON.parse(raw.notes);
                  if (parsed && parsed.status) {
                    setHandoffState(parsed);
                  }
                } catch {}
              }
              return;
            }
            const newItem = toGroceryItem(raw);
            if (payload.eventType === "INSERT") {
              setItems((prev) => {
                if (prev.some((x) => x.id === newItem.id)) return prev;
                return [newItem, ...prev];
              });
            } else {
              setItems((prev) =>
                prev.map((x) => (x.id === newItem.id ? newItem : x))
              );
            }
          } else if (payload.eventType === "DELETE") {
            const oldId = (payload.old as { id: string }).id;
            if (oldId === HANDOFF_RECORD_ID) return;
            setItems((prev) => prev.filter((x) => x.id !== oldId));
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "household_orders" },
        (payload) => {
          if (payload.eventType === "INSERT" || payload.eventType === "UPDATE") {
            const incoming = normalizeRawOrder(payload.new);
            setOrders((prev) => {
              const existingIdx = prev.findIndex((o) => o.orderId === incoming.orderId);
              if (existingIdx >= 0) {
                const next = [...prev];
                next[existingIdx] = incoming;
                return next;
              }
              return [incoming, ...prev];
            });
          } else if (payload.eventType === "DELETE") {
            const oldId = (payload.old as { order_id?: string; id?: string }).order_id || (payload.old as any).id;
            if (oldId) {
              setOrders((prev) => prev.filter((o) => o.orderId !== oldId));
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Cache recent orders in localStorage for offline & instant render
  useEffect(() => {
    try {
      localStorage.setItem("household_orders_cache", JSON.stringify(orders.slice(0, 100)));
    } catch (e) {
      console.error("Failed to cache orders", e);
    }
  }, [orders]);

  // Save to localStorage on change as reliable backup
  useEffect(() => {
    try {
      localStorage.setItem("household_grocery_items", JSON.stringify(items));
    } catch (e) {
      console.error("Failed to save items to localStorage", e);
    }
  }, [items]);

  // Save handoff state to localStorage and Supabase on change so all devices stay in sync
  useEffect(() => {
    try {
      localStorage.setItem("household_basket_handoff_state", JSON.stringify(handoffState));
    } catch (e) {
      console.error("Failed to save handoff state to localStorage", e);
    }
    // Cloud sync handoff state to Supabase
    saveHandoffStateDb(handoffState);
  }, [handoffState]);

  // Derived filtered subsets
  // pendingItems: items that need to be bought/ordered (excludes done and already ordered)
  const pendingItems = useMemo(() => items.filter((it) => !it.isDone && !it.isOrdered), [items]);

  // basketItems: all items visible in "Your Basket" (pending items + items marked as ordered within the last 24 hours)
  const basketItems = useMemo(() => {
    return items.filter((it) => {
      if (it.isDone) return false;
      if (!it.isOrdered) return true;
      return isWithin24Hours(it.orderedAt);
    });
  }, [items]);

  // Items marked as ordered within 24 hours (for checklist reference)
  const recentlyOrderedItems = useMemo(() => {
    return items.filter((it) => !it.isDone && it.isOrdered && isWithin24Hours(it.orderedAt));
  }, [items]);

  const completedItems = useMemo(() => items.filter((it) => it.isDone), [items]);

  // Active orders in flight (ORDER_PLACED)
  const activeOrders = useMemo(() => {
    return orders.filter((o) => o.status === "ORDER_PLACED");
  }, [orders]);

  // Current active (pending) item names for pattern matching
  const currentItemNames = useMemo(() => {
    return items.filter((it) => !it.isDone && !it.isOrdered).map((it) => it.name);
  }, [items]);

  // Names of items ordered by user within recent retention (to suppress companion suggestions)
  const orderedItemNames = useMemo(() => {
    return items.filter((it) => !it.isDone && it.isOrdered && isWithin24Hours(it.orderedAt)).map((it) => it.name);
  }, [items]);

  // Intelligent Pattern Suggestions (reactively calculated from current active items + last added item + cadence replenishment)
  const patternSuggestions = useMemo(() => {
    if (currentItemNames.length === 0) return [];
    const rawSuggestions = getMissingItemSuggestions(
      currentItemNames,
      lastAddedItem,
      orders,
      activeOrders,
      orderedItemNames
    );
    return rawSuggestions.filter((s) => !dismissedSuggestions.has(s.item.toLowerCase()));
  }, [currentItemNames, lastAddedItem, dismissedSuggestions, orders, activeOrders, orderedItemNames]);

  // Real-time preview of parsed items from text/speech
  const detectedPreview = useMemo(() => {
    return parseNaturalLanguageList(inputText);
  }, [inputText]);

  // Total canonical staples count
  const totalStaplesCount = useMemo(() => {
    return categorySections.reduce((acc, cat) => acc + cat.items.length, 0);
  }, [categorySections]);

  // Category browse data with search filtering
  const categoryBrowseData = useMemo(() => {
    if (categorySearchQuery.trim()) {
      const q = categorySearchQuery.toLowerCase().trim();
      const results: Array<{ item: CategoryItemDef; categoryName: string; categoryIcon: string }> = [];
      categorySections.forEach((cat) => {
        cat.items.forEach((it) => {
          if (it.name.toLowerCase().includes(q)) {
            results.push({ item: it, categoryName: cat.name, categoryIcon: cat.icon });
          }
        });
      });
      return { isSearch: true, results, activeCategory: null };
    }

    const activeCategory =
      categorySections.find((c) => c.id === selectedCategoryId) || categorySections[0];
    return {
      isSearch: false,
      results: [] as Array<{ item: CategoryItemDef; categoryName: string; categoryIcon: string }>,
      activeCategory
    };
  }, [categorySections, categorySearchQuery, selectedCategoryId]);

  // Autonomous recommendations that Lira suggests based on co-occurrence & top household staples
  // Passed activeOrders and orders so items currently in flight are not immediately re-added and due staples are prioritized
  const autonomousRecs = useMemo(() => {
    return getLiraAutonomousRecommendations(items, 6, activeOrders, orders);
  }, [items, activeOrders, orders]);

  // Filtered orders for Order History tab (excluding any empty records)
  const filteredOrders = useMemo(() => {
    const validOrders = orders.filter((o) => o.items && o.items.length > 0);
    if (ordersFilter === "ALL") return validOrders;
    return validOrders.filter((o) => o.status === ordersFilter);
  }, [orders, ordersFilter]);

  // Current active builder person ("Lira" or "Rhythm")
  const currentBuilderPerson: "Lira" | "Rhythm" = activeTab === "rhythm" ? "Rhythm" : "Lira";

  // Add multiple items from input bar or speech
  const handleAddItems = (text: string, sender?: "Lira" | "Rhythm" | "Rohan") => {
    if (!text.trim()) return;

    const actualSender = sender || currentBuilderPerson;
    const parsedNames = parseNaturalLanguageList(text);
    if (parsedNames.length === 0) return;

    const nowIso = new Date().toISOString();
    const timeFormatted = formatEventTime(nowIso);

    const newItems: GroceryItem[] = parsedNames.map((name, idx) => ({
      id: `item-${Date.now()}-${idx}`,
      name: name,
      category: detectCategory(name),
      addedBy: actualSender,
      addedAt: timeFormatted,
      createdAt: nowIso,
      isDone: false
    }));

    setItems((prev) => [...newItems, ...prev]);
    setLastAddedItem(parsedNames[0]);
    setInputText("");
    setHandoffState((prev) => registerBasketActivity(prev, pendingItems.length + newItems.length));

    // Cloud sync
    newItems.forEach((it) => upsertGroceryItem(it));
  };

  // Add a specific single item (sync to Supabase)
  const handleAddSingleItem = (name: string, addedBy?: "Lira" | "Rhythm" | "Rohan" | "Pattern Suggestion") => {
    const actualAddedBy = addedBy || currentBuilderPerson;
    const isAlreadyPresent = items.some(
      (it) => !it.isDone && it.name.toLowerCase().trim() === name.toLowerCase().trim()
    );
    if (isAlreadyPresent) return;

    const nowIso = new Date().toISOString();
    const timeFormatted = formatEventTime(nowIso);

    const newItem: GroceryItem = {
      id: `item-${Date.now()}-${Math.random()}`,
      name: name,
      category: detectCategory(name),
      addedBy: actualAddedBy,
      addedAt: timeFormatted,
      createdAt: nowIso,
      isDone: false
    };

    setItems((prev) => [newItem, ...prev]);
    setLastAddedItem(name);
    setHandoffState((prev) => registerBasketActivity(prev, pendingItems.length + 1));

    // Cloud sync
    upsertGroceryItem(newItem);
  };

  // Quick add from category sections with visual feedback
  const handleQuickAddCategoryItem = (itemName: string) => {
    handleAddSingleItem(itemName, currentBuilderPerson);
    setLastAddedItem(itemName);
    setRecentlyAddedAnimation(itemName);
    setTimeout(() => {
      setRecentlyAddedAnimation((curr) => (curr === itemName ? null : curr));
    }, 1200);
  };

  // Autonomously add all currently recommended items to the basket
  const handleAutonomousAddAll = () => {
    if (autonomousRecs.length === 0) return;
    const nowIso = new Date().toISOString();
    const timeFormatted = formatEventTime(nowIso);

    const newItems: GroceryItem[] = [];
    autonomousRecs.forEach((rec, idx) => {
      const isAlreadyPresent = items.some(
        (it) => !it.isDone && it.name.toLowerCase().trim() === rec.name.toLowerCase().trim()
      );
      if (!isAlreadyPresent) {
        newItems.push({
          id: `item-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 6)}`,
          name: rec.name,
          category: rec.category || detectCategory(rec.name),
          addedBy: currentBuilderPerson,
          addedAt: timeFormatted,
          createdAt: nowIso,
          isDone: false
        });
      }
    });

    if (newItems.length > 0) {
      setItems((prev) => [...newItems, ...prev]);
      setLastAddedItem(newItems[0].name);
      setHandoffState((prev) => registerBasketActivity(prev, pendingItems.length + newItems.length));
      newItems.forEach((it) => upsertGroceryItem(it));
    }
  };

  // Order lifecycle management handlers for Order History UI
  const handleUpdateOrderStatus = (orderId: string, status: OrderStatus) => {
    setOrders((prev) => {
      const next = prev.map((o) => (o.orderId === orderId ? updateOrderStatus(o, status) : o));
      const target = next.find((o) => o.orderId === orderId);
      if (target) updateHouseholdOrder(target);
      return next;
    });
  };

  const handleUpdateItemOutcome = (
    orderId: string,
    lineItemIdOrCanonical: string,
    outcome: OrderItemStatus
  ) => {
    setOrders((prev) => {
      const next = prev.map((o) =>
        o.orderId === orderId ? updateOrderItemOutcome(o, lineItemIdOrCanonical, outcome) : o
      );
      const target = next.find((o) => o.orderId === orderId);
      if (target) updateHouseholdOrder(target);
      return next;
    });
  };

  const toggleOrderExpanded = (orderId: string) => {
    setExpandedOrderIds((prev) => {
      const next = new Set(prev);
      if (next.has(orderId)) next.delete(orderId);
      else next.add(orderId);
      return next;
    });
  };

  // Records an ordered / purchased item directly to Order History with smart 30-min grouping
  const recordItemToOrderHistory = (targetItem: GroceryItem, orderedBy: string = "Rohan") => {
    setOrders((prevOrders) => {
      const { updatedOrders, modifiedOrder } = recordItemToOrders(prevOrders, targetItem, orderedBy);
      saveHouseholdOrder(modifiedOrder);
      if (typeof window !== "undefined") {
        try {
          localStorage.setItem("household_orders_cache", JSON.stringify(updatedOrders));
        } catch {}
      }
      return updatedOrders;
    });
  };

  // Toggle Done / Bought status (sync to Supabase & record to Order History)
  const toggleItemDone = (id: string) => {
    const target = items.find((it) => it.id === id);
    if (target) {
      const willBeDone = !target.isDone;
      const nowIso = new Date().toISOString();
      const updated: GroceryItem = {
        ...target,
        isDone: willBeDone,
        purchasedAt: willBeDone ? nowIso : undefined
      };
      setItems((prev) =>
        prev.map((it) => (it.id === id ? updated : it))
      );
      upsertGroceryItem(updated);
      if (willBeDone) {
        recordItemToOrderHistory(target, "Rohan");
      }
    }
  };

  // Mark an item as already ordered directly from the live list
  // Item remains visible with strikethrough for 24 hours & syncs to Order History
  const handleMarkAsOrdered = (id: string, orderedBy: "Rohan" | "Lira" = "Rohan") => {
    const target = items.find((it) => it.id === id);
    if (target) {
      const nowIso = new Date().toISOString();
      const updated: GroceryItem = {
        ...target,
        isOrdered: true,
        orderedAt: nowIso,
        orderedBy: orderedBy
      };
      setItems((prev) =>
        prev.map((it) => (it.id === id ? updated : it))
      );
      const remainingPending = items.filter((it) => it.id !== id && !it.isDone && !it.isOrdered).length;
      setHandoffState((hPrev) => registerBasketActivity(hPrev, remainingPending));
      upsertGroceryItem(updated);
      recordItemToOrderHistory(target, orderedBy);
    }
  };

  // Undo marking an item as ordered, restoring it to pending
  const handleUndoOrdered = (id: string) => {
    const target = items.find((it) => it.id === id);
    if (target) {
      const updated: GroceryItem = {
        ...target,
        isOrdered: false,
        orderedAt: undefined,
        orderedBy: undefined
      };
      setItems((prev) =>
        prev.map((it) => (it.id === id ? updated : it))
      );
      const remainingPending = items.filter((it) => !it.isDone && (!it.isOrdered || it.id === id)).length;
      setHandoffState((hPrev) => registerBasketActivity(hPrev, remainingPending));
      upsertGroceryItem(updated);
    }
  };

  // Delete an item with prominent exit animation (sync to Supabase)
  const deleteItem = (id: string) => {
    // 1. Instantly mark as deleting to trigger CSS animation
    setDeletingItemIds((prev) => new Set([...prev, id]));

    // 2. Remove from active state after animation completes
    setTimeout(() => {
      setItems((prev) => {
        const next = prev.filter((it) => it.id !== id);
        const remainingPending = next.filter((it) => !it.isDone).length;
        setHandoffState((hPrev) => registerBasketActivity(hPrev, remainingPending));
        return next;
      });
      setDeletingItemIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }, 320);

    // 3. Initiate cloud delete immediately in background
    deleteGroceryItemDb(id);
  };

  // Clear and archive completed items (sync to Supabase and log into household_orders for continuous learning)
  const clearCompleted = () => {
    const toArchive = items.filter((it) => it.isDone);
    setItems((prev) => prev.filter((it) => !it.isDone));
    archiveCompletedRun(toArchive);
  };

  // Voice speech-to-text integration
  const toggleVoiceInput = () => {
    if (typeof window === "undefined") return;
    const SpeechRecognition =
      (window as unknown as { SpeechRecognition?: any }).SpeechRecognition ||
      (window as unknown as { webkitSpeechRecognition?: any }).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      alert("Voice recognition is not supported in this browser. Please type or paste your list.");
      return;
    }

    if (isListening) {
      setIsListening(false);
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.lang = "en-IN";
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;

      recognition.onstart = () => {
        setIsListening(true);
      };

      recognition.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        const detected = parseNaturalLanguageList(transcript);
        if (detected.length > 0) {
          const formatted = detected.join(", ");
          setInputText((prev) => (prev ? `${prev}, ${formatted}` : formatted));
        } else {
          setInputText((prev) => (prev ? `${prev}, ${transcript}` : transcript));
        }
        setIsListening(false);
      };

      recognition.onerror = () => {
        setIsListening(false);
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognition.start();
    } catch (err) {
      console.error("Speech error", err);
      setIsListening(false);
    }
  };

  // Copy list for WhatsApp formatted cleanly by category groups
  const handleCopyList = () => {
    const pending = items.filter((it) => !it.isDone && !it.isOrdered);
    if (pending.length === 0) return;

    const categoryMap: Record<string, GroceryItem[]> = {};
    pending.forEach((it) => {
      const cat = it.category || "Other Items";
      if (!categoryMap[cat]) categoryMap[cat] = [];
      categoryMap[cat].push(it);
    });

    const categoryOrder = [
      "Fruits & Vegetables",
      "Dairy, Bread & Eggs",
      "Atta, Rice, Oil & Dals",
      "Masala & Dry Fruits",
      "Breakfast & Sauces",
      "Tea, Coffee & Drinks",
      "Tea, Coffee & Beverages",
      "Munchies & Biscuits",
      "Munchies & Snacks",
      "Pet Care & Household",
      "Other Items"
    ];

    const sortedCats = Object.keys(categoryMap).sort((a, b) => {
      const idxA = categoryOrder.indexOf(a);
      const idxB = categoryOrder.indexOf(b);
      if (idxA !== -1 && idxB !== -1) return idxA - idxB;
      if (idxA !== -1) return -1;
      if (idxB !== -1) return 1;
      return a.localeCompare(b);
    });

    const sectionsText = sortedCats
      .map((cat) => {
        const icon = CATEGORY_ICONS[cat] || "🛒";
        const itemList = categoryMap[cat].map((it) => `• ${it.name}`).join("\n");
        return `*${icon} ${cat}*\n${itemList}`;
      })
      .join("\n\n");

    const clipboardText = `🛒 *Household Grocery List:*\n\n${sectionsText}`;

    navigator.clipboard.writeText(clipboardText);
    setCopiedNotification(true);
    setTimeout(() => setCopiedNotification(false), 2500);
  };

  // Group basket items by category, sorted with active items first, ordered items at bottom
  const groupedBasketItems = useMemo(() => {
    if (basketItems.length === 0) return [];

    const categoryMap: Record<string, GroceryItem[]> = {};
    basketItems.forEach((it) => {
      const cat = it.category || "Other Items";
      if (!categoryMap[cat]) categoryMap[cat] = [];
      categoryMap[cat].push(it);
    });

    const categoryOrder = [
      "Fruits & Vegetables",
      "Dairy, Bread & Eggs",
      "Atta, Rice, Oil & Dals",
      "Masala & Dry Fruits",
      "Breakfast & Sauces",
      "Tea, Coffee & Drinks",
      "Tea, Coffee & Beverages",
      "Munchies & Biscuits",
      "Munchies & Snacks",
      "Pet Care & Household",
      "Other Items"
    ];

    const sortedCats = Object.keys(categoryMap).sort((a, b) => {
      const idxA = categoryOrder.indexOf(a);
      const idxB = categoryOrder.indexOf(b);
      if (idxA !== -1 && idxB !== -1) return idxA - idxB;
      if (idxA !== -1) return -1;
      if (idxB !== -1) return 1;
      return a.localeCompare(b);
    });

    return sortedCats.map((cat) => {
      // Sort items within group: pending items first, ordered/done at bottom
      const itemsInCat = [...categoryMap[cat]].sort((a, b) => {
        const aOrdered = Boolean(a.isOrdered || a.isDone);
        const bOrdered = Boolean(b.isOrdered || b.isDone);
        if (aOrdered !== bOrdered) {
          return aOrdered ? 1 : -1;
        }
        return (a.name || "").localeCompare(b.name || "");
      });

      const pendingCount = itemsInCat.filter((it) => !it.isDone && !it.isOrdered).length;

      return {
        category: cat,
        icon: CATEGORY_ICONS[cat] || "🛒",
        items: itemsInCat,
        pendingCount
      };
    });
  }, [basketItems]);

  // Group items by category for Rohan's checklist
  const groupedPending = useMemo(() => {
    const groups: Record<string, GroceryItem[]> = {};
    pendingItems.forEach((it) => {
      const cat = it.category || "Other Items";
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(it);
    });
    return groups;
  }, [pendingItems]);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 pb-16">
      {/* Header Bar */}
      <header className="sticky top-0 z-30 bg-white border-b border-slate-200 shadow-sm">
        <div className="max-w-2xl mx-auto px-3 sm:px-4 py-2.5 sm:py-3 flex items-center justify-between gap-2">
          {/* App Branding */}
          <div className="flex items-center gap-2 min-w-0 shrink">
            <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-emerald-600 flex items-center justify-center text-white shadow-sm font-bold text-sm sm:text-base shrink-0">
              🧺
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <h1 className="font-bold text-base sm:text-lg text-slate-900 leading-tight truncate">
                  D718 Groceries
                </h1>
                <span className="hidden sm:inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200 shrink-0">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                  <span>Synced</span>
                </span>
              </div>
              <p className="text-[10px] sm:text-xs text-slate-500 truncate hidden xs:block sm:block">
                Smart Household Assistant
              </p>
            </div>
          </div>

          {/* Navigation View Tabs */}
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl shrink-0">
            <button
              type="button"
              onClick={() => setActiveTab("lira")}
              className={`px-2.5 sm:px-3 py-1.5 text-xs font-semibold rounded-lg transition-all active:scale-95 whitespace-nowrap flex items-center gap-1 ${
                activeTab === "lira"
                  ? "bg-emerald-600 text-white shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <span>✨ Lira</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("rhythm")}
              className={`px-2.5 sm:px-3 py-1.5 text-xs font-semibold rounded-lg transition-all active:scale-95 whitespace-nowrap flex items-center gap-1 ${
                activeTab === "rhythm"
                  ? "bg-purple-600 text-white shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <span>✨ Rhythm</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("orders")}
              className={`px-2.5 sm:px-3 py-1.5 text-xs font-semibold rounded-lg transition-all active:scale-95 flex items-center gap-1 whitespace-nowrap ${
                activeTab === "orders"
                  ? "bg-white text-emerald-800 shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <Clock className="w-3.5 h-3.5 hidden sm:inline-block" />
              <span>Orders</span>
              {activeOrders.length > 0 && (
                <span className="text-[10px] px-1.5 py-0.2 rounded-full font-bold bg-amber-500 text-white animate-pulse">
                  {activeOrders.length}
                </span>
              )}
            </button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-2xl mx-auto px-4 pt-4">
        {/* ========================================================================= */}
        {/* VIEW 1: LIVE LIST (LIRA OR RHYTHM)                                        */}
        {/* ========================================================================= */}
        {(activeTab === "lira" || activeTab === "rhythm") && (() => {
          const isRhythm = activeTab === "rhythm";
          const builderName = isRhythm ? "Rhythm" : "Lira";
          const builderRole = isRhythm ? "Wife" : "Mother-in-law";
          const builderAvatar = isRhythm ? "👩" : "👩‍🍳";

          return (
            <div className="space-y-5">

              {/* ========================================================================= */}
              {/* 1. PRIMARY FEATURE: RECOMMENDATIONS                                       */}
              {/* Autonomous Replenishment Staples + Companion Co-occurrence Suggestions    */}
              {/* ========================================================================= */}
              {(autonomousRecs.length > 0 || (pendingItems.length > 0 && patternSuggestions.length > 0)) && (
                <div className={`border-2 rounded-2xl p-4 sm:p-5 shadow-sm transition-all ${
                  isRhythm
                    ? "bg-gradient-to-br from-purple-50/90 to-fuchsia-50/70 border-purple-300/80"
                    : "bg-gradient-to-br from-teal-50/90 to-emerald-50/70 border-teal-300/80"
                }`}>
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <button
                      type="button"
                      onClick={() => setIsRecommendationsExpanded((prev) => !prev)}
                      className="flex items-center gap-2.5 text-left flex-1 min-w-0 group py-0.5"
                    >
                      <div className={`w-9 h-9 rounded-xl text-white flex items-center justify-center shrink-0 shadow-2xs font-bold ${
                        isRhythm ? "bg-purple-600" : "bg-teal-600"
                      }`}>
                        <Sparkles className={`w-5 h-5 ${isRhythm ? "text-purple-100" : "text-teal-100"}`} />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className={`text-base font-bold transition-colors tracking-tight ${
                            isRhythm
                              ? "text-purple-950 group-hover:text-purple-800"
                              : "text-teal-950 group-hover:text-teal-800"
                          }`}>
                            ✨ {builderName}&apos;s Recommendations
                          </h3>
                          <span className={`text-[11px] px-2.5 py-0.5 rounded-full font-bold shadow-2xs ${
                            isRhythm ? "bg-purple-200/90 text-purple-950" : "bg-teal-200/90 text-teal-950"
                          }`}>
                            {autonomousRecs.length + (pendingItems.length > 0 ? patternSuggestions.length : 0)} items spotted
                          </span>
                        </div>
                        <p className={`text-xs mt-0.5 ${isRhythm ? "text-purple-800" : "text-teal-800"}`}>
                          I&apos;ve spotted a few things your household may need
                        </p>
                      </div>
                    </button>

                    <div className="flex items-center gap-2 shrink-0">
                      {autonomousRecs.length > 0 && (
                        <button
                          type="button"
                          onClick={handleAutonomousAddAll}
                          className={`px-3 py-1.5 text-white font-bold text-xs rounded-xl shadow-2xs transition-all flex items-center gap-1 shrink-0 active:scale-95 ${
                            isRhythm ? "bg-purple-700 hover:bg-purple-800" : "bg-teal-700 hover:bg-teal-800"
                          }`}
                          title="Add all recommended items"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span className="hidden sm:inline">Auto-Add All</span>
                          <span>({autonomousRecs.length})</span>
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setIsRecommendationsExpanded((prev) => !prev)}
                        className={`p-1.5 rounded-lg transition-colors active:scale-90 ${
                          isRhythm
                            ? "text-purple-800 hover:bg-purple-100"
                            : "text-teal-800 hover:bg-teal-100"
                        }`}
                        aria-label={isRecommendationsExpanded ? "Collapse recommendations" : "Expand recommendations"}
                      >
                        {isRecommendationsExpanded ? (
                          <ChevronUp className="w-4 h-4" />
                        ) : (
                          <ChevronDown className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                  </div>

                  {isRecommendationsExpanded && (
                    <div className={`mt-3.5 pt-3.5 border-t space-y-4 animate-fadeIn ${
                      isRhythm ? "border-purple-200/80" : "border-teal-200/80"
                    }`}>
                      {/* Companion / Co-occurrence Suggestions (if any items in basket) */}
                      {pendingItems.length > 0 && patternSuggestions.length > 0 && (
                        <div className="space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-bold uppercase tracking-wider text-amber-900 flex items-center gap-1.5">
                              <span>🤝</span>
                              <span>
                                {lastAddedItem
                                  ? `Pairs with "${lastAddedItem}"`
                                  : "Frequently Ordered Together"}
                              </span>
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                patternSuggestions.forEach((s) => dismissedSuggestions.add(s.item.toLowerCase()));
                                setDismissedSuggestions(new Set(dismissedSuggestions));
                              }}
                              className="text-[11px] text-amber-800 hover:text-amber-950 active:scale-95 font-medium px-2 py-0.5 rounded hover:bg-amber-100/80 transition-all"
                            >
                              Dismiss
                            </button>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {patternSuggestions.map((suggestion) => (
                              <div
                                key={suggestion.item}
                                className="bg-white/95 border border-amber-200/90 rounded-xl p-2.5 flex items-center justify-between gap-2 shadow-2xs hover:border-amber-400 transition-all"
                              >
                                <div className="min-w-0 flex-1">
                                  <div className="font-bold text-slate-900 text-xs flex items-center gap-1.5 flex-wrap">
                                    <span>{suggestion.item}</span>
                                    {suggestion.dueText && (
                                      <span
                                        className={`text-[9px] px-1.5 py-0.2 rounded-full font-bold ${
                                          suggestion.replenishmentStatus === "DUE_NOW"
                                            ? "bg-emerald-100 text-emerald-800 border border-emerald-300"
                                            : suggestion.replenishmentStatus === "APPROACHING_DUE"
                                            ? "bg-amber-100 text-amber-900 border border-amber-300"
                                            : "bg-slate-100 text-slate-600 border border-slate-200"
                                        }`}
                                      >
                                        {suggestion.dueText}
                                      </span>
                                    )}
                                  </div>
                                  <p className="text-[10px] text-slate-500 truncate mt-0.5">
                                    Often with {suggestion.triggeredBy} • {suggestion.reason}
                                  </p>
                                </div>

                                <div className="flex items-center gap-1 shrink-0">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      handleAddSingleItem(suggestion.item, "Pattern Suggestion");
                                      setLastAddedItem(suggestion.item);
                                      setDismissedSuggestions((prev) => new Set([...prev, suggestion.item.toLowerCase()]));
                                    }}
                                    className={`text-white text-xs font-semibold px-2.5 py-1 rounded-lg transition-all flex items-center gap-1 shadow-2xs active:scale-95 ${
                                      isRhythm
                                        ? "bg-purple-600 hover:bg-purple-700"
                                        : "bg-emerald-600 hover:bg-emerald-700"
                                    }`}
                                  >
                                    <Plus className="w-3 h-3" />
                                    <span>Add</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setDismissedSuggestions((prev) => new Set([...prev, suggestion.item.toLowerCase()]));
                                    }}
                                    className="text-slate-400 hover:text-slate-600 active:scale-90 p-1 transition-transform"
                                    title="Don't need today"
                                  >
                                    ✕
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Autonomous Staple Replenishment Recommendations */}
                      {autonomousRecs.length > 0 && (
                        <div className="space-y-2">
                          {pendingItems.length > 0 && patternSuggestions.length > 0 && (
                            <div className={`text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 pt-2 border-t ${
                              isRhythm ? "text-purple-900 border-purple-200/60" : "text-teal-900 border-teal-200/60"
                            }`}>
                              <span>📦</span>
                              <span>Household Staples &amp; Replenishments</span>
                            </div>
                          )}
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {autonomousRecs.map((rec) => (
                              <div
                                key={rec.name}
                                className={`bg-white/95 border rounded-xl p-2.5 flex items-center justify-between gap-2 transition-colors shadow-2xs ${
                                  isRhythm ? "border-purple-100 hover:border-purple-300" : "border-teal-100 hover:border-teal-300"
                                }`}
                              >
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-xs font-bold text-slate-900 truncate">
                                      {rec.name}
                                    </span>
                                    <span className={`text-[9px] px-1.5 py-0.2 rounded-full font-medium shrink-0 ${
                                      isRhythm ? "bg-purple-100 text-purple-800" : "bg-teal-100 text-teal-800"
                                    }`}>
                                      {rec.category}
                                    </span>
                                  </div>
                                  <p className="text-[10px] text-slate-500 truncate mt-0.5">
                                    {rec.reason}
                                  </p>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => handleAddSingleItem(rec.name, builderName)}
                                  className={`text-white text-xs font-semibold px-2.5 py-1 rounded-lg transition-all flex items-center gap-1 shrink-0 active:scale-95 ${
                                    isRhythm ? "bg-purple-600 hover:bg-purple-700" : "bg-teal-600 hover:bg-teal-700"
                                  }`}
                                >
                                  <Plus className="w-3 h-3" />
                                  <span>Add</span>
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* ========================================================================= */}
              {/* 2. YOUR BASKET (Items currently in the basket)                           */}
              {/* ========================================================================= */}
              <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-200">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-sm font-bold text-slate-900">
                      Household Groceries
                    </h3>
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                      isRhythm ? "bg-purple-100 text-purple-800" : "bg-emerald-100 text-emerald-800"
                    }`}>
                      {pendingItems.length} {pendingItems.length === 1 ? "item" : "items"}
                    </span>
                    {recentlyOrderedItems.length > 0 && (
                      <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
                        {recentlyOrderedItems.length} already ordered
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleCopyList}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 active:scale-95 text-slate-700 text-xs font-semibold rounded-xl transition-all"
                    >
                      <Copy className="w-3.5 h-3.5" />
                      <span>{copiedNotification ? "Copied!" : "Copy for WhatsApp"}</span>
                    </button>
                    {completedItems.length > 0 && (
                      <button
                        type="button"
                        onClick={clearCompleted}
                        className="flex items-center gap-1 px-3 py-1.5 bg-rose-50 hover:bg-rose-100 active:scale-95 text-rose-700 text-xs font-semibold rounded-xl transition-all"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Clear Done ({completedItems.length})</span>
                      </button>
                    )}
                  </div>
                </div>

                {basketItems.length === 0 ? (
                  <p className="text-sm text-slate-400 text-center py-6">
                    Your list is empty. Add recommended items above, type below, or browse staples.
                  </p>
                ) : (
                  <div className="space-y-4">
                    {groupedBasketItems.map((group) => (
                      <div key={group.category} className="space-y-1">
                        {/* Category Group Header */}
                        <div className="flex items-center justify-between pt-2 pb-1 px-1 border-b border-slate-100">
                          <div className="flex items-center gap-2">
                            <span className="text-base">{group.icon}</span>
                            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                              {group.category}
                            </h4>
                            <span className="text-[11px] font-semibold px-2 py-0.2 rounded-full bg-slate-100 text-slate-600 border border-slate-200/70">
                              {group.items.length}
                            </span>
                          </div>
                          {group.pendingCount > 0 && group.pendingCount !== group.items.length && (
                            <span className="text-[10px] text-slate-400 font-medium">
                              {group.pendingCount} pending
                            </span>
                          )}
                        </div>

                        {/* Items within this Category */}
                        <div className="divide-y divide-slate-100">
                          {group.items.map((it) => {
                            const isDeleting = deletingItemIds.has(it.id);
                            const isItemOrdered = Boolean(it.isOrdered);
                            return (
                              <div
                                key={it.id}
                                className={`py-2.5 flex items-center justify-between gap-2.5 sm:gap-3 transition-all ${
                                  isDeleting ? "item-delete-exit" : ""
                                } ${isItemOrdered || it.isDone ? "bg-slate-50/60 -mx-2 px-2 rounded-xl" : ""}`}
                              >
                                <div className="flex items-center gap-2.5 sm:gap-3 flex-1 min-w-0">
                                  {/* Checkbox */}
                                  <button
                                    type="button"
                                    onClick={() => toggleItemDone(it.id)}
                                    aria-label={`Mark ${it.name} as done`}
                                    className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all shrink-0 active:scale-90 ${
                                      it.isDone
                                        ? "bg-emerald-600 border-emerald-600 text-white"
                                        : isItemOrdered
                                        ? "bg-emerald-100 border-emerald-400 text-emerald-700"
                                        : "border-slate-300 hover:border-emerald-500 text-transparent hover:text-emerald-500"
                                    }`}
                                  >
                                    <Check className="w-3.5 h-3.5" />
                                  </button>

                                  {/* 40x40 Product Thumbnail / Icon */}
                                  <GroceryItemThumbnail itemName={it.name} category={it.category} />

                                  <div className="min-w-0 flex-1">
                                    <span
                                      className={`text-base font-medium block truncate transition-all ${
                                        isItemOrdered || it.isDone
                                          ? "line-through text-slate-400 font-normal"
                                          : "text-slate-800"
                                      }`}
                                    >
                                      {it.name}
                                    </span>
                                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                                      {/* Person Tag Badge */}
                                      {it.addedBy === "Rhythm" ? (
                                        <span className="text-[9px] px-1.5 py-0.2 rounded-md bg-purple-100 text-purple-800 font-semibold border border-purple-200">
                                          Rhythm
                                        </span>
                                      ) : it.addedBy === "Lira" ? (
                                        <span className="text-[9px] px-1.5 py-0.2 rounded-md bg-emerald-100 text-emerald-800 font-semibold border border-emerald-200">
                                          Lira
                                        </span>
                                      ) : it.addedBy === "Rohan" ? (
                                        <span className="text-[9px] px-1.5 py-0.2 rounded-md bg-blue-100 text-blue-800 font-semibold border border-blue-200">
                                          Rohan
                                        </span>
                                      ) : (
                                        <span className="text-[9px] px-1.5 py-0.2 rounded-md bg-amber-100 text-amber-800 font-semibold border border-amber-200">
                                          AI Suggestion
                                        </span>
                                      )}
                                      {isItemOrdered ? (
                                        <div className="flex items-center gap-1.5 flex-wrap text-xs">
                                          <span className="font-semibold text-emerald-700 flex items-center gap-1">
                                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                                            <span>✓ {it.orderedBy || "Rohan"} ordered</span>
                                          </span>
                                          <span className="text-slate-300">•</span>
                                          <span className="text-slate-500 font-normal">
                                            {formatItemOrderedTime(it.orderedAt)}
                                          </span>
                                        </div>
                                      ) : it.isDone ? (
                                        <div className="flex items-center gap-1.5 flex-wrap text-xs">
                                          <span className="font-semibold text-emerald-700 flex items-center gap-1">
                                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                                            <span>✓ Bought / Done</span>
                                          </span>
                                          <span className="text-slate-300">•</span>
                                          <span className="text-slate-500 font-normal">
                                            {formatEventTime(it.purchasedAt)}
                                          </span>
                                        </div>
                                      ) : (
                                        <span className="text-[10px] text-slate-400">
                                          • Added {formatEventTime(it.createdAt || it.addedAt)}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                </div>

                                <div className="flex items-center gap-1.5 shrink-0">
                                  {isItemOrdered ? (
                                    <button
                                      type="button"
                                      onClick={() => handleUndoOrdered(it.id)}
                                      className="px-2.5 py-1 text-xs font-semibold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 active:scale-95 rounded-lg transition-all"
                                      title="Undo ordered status"
                                    >
                                      Undo
                                    </button>
                                  ) : it.isDone ? (
                                    <button
                                      type="button"
                                      onClick={() => toggleItemDone(it.id)}
                                      className="px-2.5 py-1 text-xs font-semibold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 active:scale-95 rounded-lg transition-all"
                                      title="Restore item"
                                    >
                                      Undo
                                    </button>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() => handleMarkAsOrdered(it.id, "Rohan")}
                                      className="px-2.5 py-1 text-xs font-medium text-emerald-700 hover:text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200/80 active:scale-95 rounded-lg transition-all flex items-center gap-1"
                                      title="Mark as ordered already"
                                    >
                                      <Check className="w-3 h-3 text-emerald-600" />
                                      <span className="hidden sm:inline">Mark as Ordered</span>
                                      <span className="sm:hidden">Ordered</span>
                                    </button>
                                  )}

                                  <button
                                    type="button"
                                    onClick={() => deleteItem(it.id)}
                                    className="text-slate-300 hover:text-rose-500 active:scale-90 p-1.5 transition-all rounded-lg"
                                    title="Remove"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* ========================================================================= */}
              {/* 3. COMPACT MANUAL ENTRY: ADD TO BASKET                                   */}
              {/* Reduced visual weight, concise labels, preserves typing/pasting/voice     */}
              {/* ========================================================================= */}
              <div className="bg-white rounded-2xl p-3.5 sm:p-4 shadow-2xs border border-slate-200">
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5">
                  Add to your basket ({builderName}):
                </label>
                <div className="relative">
                  <textarea
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    placeholder="Type or paste items (e.g. Paneer, Tomatoes, Curd, Eggs)..."
                    rows={2}
                    className={`w-full text-sm p-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:border-transparent placeholder:text-slate-400 bg-slate-50/50 focus:bg-white transition-all ${
                      isRhythm ? "focus:ring-purple-500" : "focus:ring-emerald-500"
                    }`}
                  />
                </div>

                {detectedPreview.length > 1 && (
                  <div className={`mt-2 p-2 border rounded-xl animate-fadeIn ${
                    isRhythm
                      ? "bg-purple-50/80 border-purple-200"
                      : "bg-emerald-50/80 border-emerald-200"
                  }`}>
                    <div className={`flex items-center gap-1.5 text-xs font-semibold mb-1 ${
                      isRhythm ? "text-purple-800" : "text-emerald-800"
                    }`}>
                      <Sparkles className={`w-3.5 h-3.5 ${isRhythm ? "text-purple-600" : "text-emerald-600"}`} />
                      <span>Recognized {detectedPreview.length} separate items:</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {detectedPreview.map((name) => (
                        <span
                          key={name}
                          className={`px-2 py-0.5 rounded-md bg-white text-xs font-semibold border shadow-2xs ${
                            isRhythm
                              ? "text-purple-900 border-purple-300"
                              : "text-emerald-900 border-emerald-300"
                          }`}
                        >
                          {name}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex items-center justify-between gap-2.5 mt-2.5">
                  <button
                    type="button"
                    onClick={toggleVoiceInput}
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium border transition-all active:scale-95 shrink-0 ${
                      isListening
                        ? "bg-rose-50 border-rose-300 text-rose-700 animate-pulse"
                        : "bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100"
                    }`}
                  >
                    {isListening ? <MicOff className="w-3.5 h-3.5 text-rose-600" /> : <Mic className="w-3.5 h-3.5 text-slate-600" />}
                    <span>{isListening ? "Listening..." : "Speak items"}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleAddItems(inputText, builderName)}
                    disabled={!inputText.trim()}
                    className={`flex-1 text-white font-semibold py-2 px-4 rounded-xl shadow-2xs transition-all flex items-center justify-center gap-1.5 text-xs sm:text-sm active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed ${
                      isRhythm
                        ? "bg-purple-600 hover:bg-purple-700"
                        : "bg-emerald-600 hover:bg-emerald-700"
                    }`}
                  >
                    <Plus className="w-4 h-4" />
                    <span>
                      {detectedPreview.length > 1
                        ? `Add All ${detectedPreview.length} Items`
                        : "Add to Basket"}
                    </span>
                  </button>
                </div>
              </div>

              {/* ========================================================================= */}
              {/* 4. BROWSE STAPLES (Zepto-style Sections & 1-Tap Quick Add)                */}
              {/* Category pills visible; item list expands when category clicked           */}
              {/* ========================================================================= */}
              <div className="bg-white rounded-2xl p-4 sm:p-5 shadow-sm border border-slate-200">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3.5">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-lg">🛍️</span>
                      <h3 className="text-base font-bold text-slate-900 tracking-tight">
                        Browse Staples
                      </h3>
                      <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                        isRhythm ? "bg-purple-100 text-purple-800" : "bg-emerald-100 text-emerald-800"
                      }`}>
                        {totalStaplesCount} Past Staples
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">
                      1-Tap quick add from your 820+ past orders • Tap a category to view items
                    </p>
                  </div>

                  {/* Quick Search across all categories */}
                  <div className="relative min-w-[200px]">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={categorySearchQuery}
                      onChange={(e) => {
                        setCategorySearchQuery(e.target.value);
                        if (e.target.value) {
                          setIsCategoryItemsExpanded(true);
                        }
                      }}
                      placeholder="Search past items..."
                      className={`w-full text-xs pl-8 pr-6 py-1.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 bg-slate-50 focus:bg-white ${
                        isRhythm ? "focus:ring-purple-500" : "focus:ring-emerald-500"
                      }`}
                    />
                    {categorySearchQuery && (
                      <button
                        onClick={() => setCategorySearchQuery("")}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-slate-600"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                </div>

                {/* Category Grid */}
                {!categorySearchQuery && (
                  <div
                    role="tablist"
                    aria-label="Grocery categories"
                    className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3.5"
                  >
                    {categorySections.map((cat) => {
                      const isSelected = selectedCategoryId === cat.id && isCategoryItemsExpanded;
                      const count = cat.itemCount ?? cat.items?.length ?? 0;
                      return (
                        <button
                          key={cat.id}
                          type="button"
                          role="tab"
                          aria-selected={isSelected}
                          aria-label={`${cat.name}, ${count} items`}
                          onClick={() => {
                            if (selectedCategoryId === cat.id) {
                              setIsCategoryItemsExpanded((prev) => !prev);
                            } else {
                              setSelectedCategoryId(cat.id);
                              setIsCategoryItemsExpanded(true);
                            }
                          }}
                          className={`group relative flex items-center justify-between gap-1.5 p-2 sm:p-2.5 rounded-xl text-left transition-all border min-h-[48px] active:scale-95 ${
                            isSelected
                              ? isRhythm
                                ? "bg-purple-50/90 border-purple-600 text-purple-950 shadow-xs ring-1 ring-purple-600/25"
                                : "bg-emerald-50/90 border-emerald-600 text-emerald-950 shadow-xs ring-1 ring-emerald-600/25"
                              : "bg-slate-50/80 hover:bg-slate-100 text-slate-700 border-slate-200/90 hover:border-slate-300"
                          }`}
                        >
                          <div className="flex items-center gap-1.5 sm:gap-2 min-w-0 flex-1">
                            <span className="text-base sm:text-lg shrink-0 leading-none select-none">
                              {cat.icon}
                            </span>
                            <span
                              className={`text-[11px] sm:text-xs leading-tight break-words ${
                                isSelected
                                  ? isRhythm
                                    ? "font-bold text-purple-950"
                                    : "font-bold text-emerald-950"
                                  : "font-semibold text-slate-800"
                              }`}
                            >
                              {cat.name}
                            </span>
                          </div>
                          <span
                            className={`shrink-0 text-[10px] px-1.5 py-0.5 rounded-full font-bold tabular-nums ${
                              isSelected
                                ? isRhythm
                                  ? "bg-purple-200/90 text-purple-900"
                                  : "bg-emerald-200/90 text-emerald-900"
                                : "bg-slate-200/80 text-slate-600"
                            }`}
                          >
                            {count}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* Items Grid & Header (Visible when expanded or searching) */}
                {(isCategoryItemsExpanded || categoryBrowseData.isSearch) && (
                  <div className="pt-2 border-t border-slate-100 animate-fadeIn">
                    {/* Search Header or Category Header */}
                    {categoryBrowseData.isSearch ? (
                      <div className="flex items-center justify-between mb-3 text-xs font-semibold text-slate-600 bg-slate-50 px-3 py-2 rounded-lg">
                        <span>
                          Search results for &ldquo;{categorySearchQuery}&rdquo; ({categoryBrowseData.results.length} items found)
                        </span>
                        <button
                          onClick={() => setCategorySearchQuery("")}
                          className={`hover:underline ${isRhythm ? "text-purple-700" : "text-emerald-700"}`}
                        >
                          Clear Search
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between mb-3 pb-2 border-b border-slate-100">
                        <div className="flex items-center gap-2">
                          <span className="text-lg">{categoryBrowseData.activeCategory?.icon}</span>
                          <span className="text-sm font-bold text-slate-800">
                            {categoryBrowseData.activeCategory?.name}
                          </span>
                          <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                            {categoryBrowseData.activeCategory?.badge}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-slate-400">
                            {categoryBrowseData.activeCategory?.items.length} items ordered before
                          </span>
                          <button
                            type="button"
                            onClick={() => setIsCategoryItemsExpanded(false)}
                            className="text-xs text-slate-500 hover:text-slate-800 active:scale-95 flex items-center gap-0.5 ml-1 px-1.5 py-0.5 rounded hover:bg-slate-100"
                            title="Collapse items"
                          >
                            <span>Hide</span>
                            <ChevronUp className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Items Grid (Responsive 2 or 3 columns) */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 max-h-[380px] overflow-y-auto pr-1">
                      {categoryBrowseData.isSearch ? (
                        categoryBrowseData.results.length === 0 ? (
                          <div className="col-span-full py-8 text-center text-slate-400 text-xs">
                            No past items matching &ldquo;{categorySearchQuery}&rdquo;. Try typing it in the input box above to add!
                          </div>
                        ) : (
                          categoryBrowseData.results.map(({ item: it, categoryName }) => {
                            const isAlreadyInList = items.some(
                              (item) => !item.isDone && item.name.toLowerCase().trim() === it.name.toLowerCase().trim()
                            );
                            const isRecentlyClicked = recentlyAddedAnimation === it.name;

                            return (
                              <div
                                key={it.name}
                                onClick={() => handleQuickAddCategoryItem(it.name)}
                                className={`cursor-pointer group relative p-3 rounded-xl border transition-all duration-150 flex flex-col justify-between select-none active:scale-[0.98] ${
                                  isAlreadyInList
                                    ? isRhythm
                                      ? "bg-purple-50/70 border-purple-300"
                                      : "bg-emerald-50/70 border-emerald-300"
                                    : isRhythm
                                    ? "bg-white hover:bg-slate-50 active:bg-purple-50/40 border-slate-200 hover:border-purple-300 hover:shadow-2xs"
                                    : "bg-white hover:bg-slate-50 active:bg-emerald-50/40 border-slate-200 hover:border-emerald-300 hover:shadow-2xs"
                                } ${
                                  isRecentlyClicked
                                    ? isRhythm
                                      ? "ring-2 ring-purple-500 scale-[1.02]"
                                      : "ring-2 ring-emerald-500 scale-[1.02]"
                                    : ""
                                }`}
                              >
                                <div className="flex items-start justify-between gap-1 mb-1.5">
                                  <div className="w-11 h-11 flex items-center justify-center rounded-xl bg-slate-50 border border-slate-100 overflow-hidden shrink-0">
                                    {it.imageUrl ? (
                                      <img
                                        src={it.imageUrl}
                                        alt={it.name}
                                        loading="lazy"
                                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                                        onError={(e) => {
                                          e.currentTarget.style.display = "none";
                                          const fallback = e.currentTarget.parentElement?.querySelector(".emoji-fallback");
                                          if (fallback) (fallback as HTMLElement).style.display = "inline-block";
                                        }}
                                      />
                                    ) : null}
                                    <span
                                      className="text-2xl emoji-fallback"
                                      style={{ display: it.imageUrl ? "none" : "inline-block" }}
                                    >
                                      {it.icon}
                                    </span>
                                  </div>
                                  {isAlreadyInList ? (
                                    <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[10px] font-semibold border ${
                                      isRhythm
                                        ? "bg-purple-100 text-purple-800 border-purple-200"
                                        : "bg-emerald-100 text-emerald-800 border-emerald-200"
                                    }`}>
                                      <Check className={`w-3 h-3 ${isRhythm ? "text-purple-700" : "text-emerald-700"}`} />
                                      <span>In List</span>
                                    </span>
                                  ) : (
                                    <span className={`inline-flex items-center gap-0.5 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-slate-100 text-slate-600 transition-colors ${
                                      isRhythm
                                        ? "group-hover:bg-purple-600 group-hover:text-white"
                                        : "group-hover:bg-emerald-600 group-hover:text-white"
                                    }`}>
                                      <Plus className="w-3 h-3" />
                                      <span>Add</span>
                                    </span>
                                  )}
                                </div>
                                <div>
                                  <h4 className={`font-semibold text-slate-900 text-xs leading-snug ${
                                    isRhythm ? "group-hover:text-purple-900" : "group-hover:text-emerald-900"
                                  }`}>
                                    {it.name}
                                  </h4>
                                  {it.subtitle && (
                                    <p className={`text-[10px] font-medium truncate mt-0.5 ${
                                      isRhythm ? "text-purple-700/80" : "text-emerald-700/80"
                                    }`}>
                                      {it.subtitle}
                                    </p>
                                  )}
                                  <div className="flex items-center justify-between text-[10px] text-slate-400 mt-1">
                                    <span>Ordered {it.orderCount}x</span>
                                    <span className="text-slate-300">•</span>
                                    <span className="truncate max-w-[70px]">{categoryName}</span>
                                  </div>
                                </div>
                              </div>
                            );
                          })
                        )
                      ) : (
                        categoryBrowseData.activeCategory?.items.map((it) => {
                          const isAlreadyInList = items.some(
                            (item) => !item.isDone && item.name.toLowerCase().trim() === it.name.toLowerCase().trim()
                          );
                          const isRecentlyClicked = recentlyAddedAnimation === it.name;

                          return (
                            <div
                              key={it.name}
                              onClick={() => handleQuickAddCategoryItem(it.name)}
                              className={`cursor-pointer group relative p-3 rounded-xl border transition-all duration-150 flex flex-col justify-between select-none active:scale-[0.98] ${
                                isAlreadyInList
                                  ? isRhythm
                                    ? "bg-purple-50/70 border-purple-300"
                                    : "bg-emerald-50/70 border-emerald-300"
                                  : isRhythm
                                  ? "bg-white hover:bg-slate-50 active:bg-purple-50/40 border-slate-200 hover:border-purple-300 hover:shadow-2xs"
                                  : "bg-white hover:bg-slate-50 active:bg-emerald-50/40 border-slate-200 hover:border-emerald-300 hover:shadow-2xs"
                              } ${
                                isRecentlyClicked
                                  ? isRhythm
                                    ? "ring-2 ring-purple-500 scale-[1.02]"
                                    : "ring-2 ring-emerald-500 scale-[1.02]"
                                  : ""
                              }`}
                            >
                              <div className="flex items-start justify-between gap-1 mb-1.5">
                                <div className="w-11 h-11 flex items-center justify-center rounded-xl bg-slate-50 border border-slate-100 overflow-hidden shrink-0">
                                  {it.imageUrl ? (
                                    <img
                                      src={it.imageUrl}
                                      alt={it.name}
                                      loading="lazy"
                                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                                      onError={(e) => {
                                        e.currentTarget.style.display = "none";
                                        const fallback = e.currentTarget.parentElement?.querySelector(".emoji-fallback");
                                        if (fallback) (fallback as HTMLElement).style.display = "inline-block";
                                      }}
                                    />
                                  ) : null}
                                  <span
                                    className="text-2xl emoji-fallback"
                                    style={{ display: it.imageUrl ? "none" : "inline-block" }}
                                  >
                                    {it.icon}
                                  </span>
                                </div>
                                {isAlreadyInList ? (
                                  <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[10px] font-semibold border ${
                                    isRhythm
                                      ? "bg-purple-100 text-purple-800 border-purple-200"
                                      : "bg-emerald-100 text-emerald-800 border-emerald-200"
                                  }`}>
                                    <Check className={`w-3 h-3 ${isRhythm ? "text-purple-700" : "text-emerald-700"}`} />
                                    <span>In List</span>
                                  </span>
                                ) : (
                                  <span className={`inline-flex items-center gap-0.5 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-slate-100 text-slate-600 transition-colors ${
                                    isRhythm
                                      ? "group-hover:bg-purple-600 group-hover:text-white"
                                      : "group-hover:bg-emerald-600 group-hover:text-white"
                                  }`}>
                                    <Plus className="w-3 h-3" />
                                    <span>Add</span>
                                  </span>
                                )}
                              </div>
                              <div>
                                <h4 className={`font-semibold text-slate-900 text-xs leading-snug ${
                                  isRhythm ? "group-hover:text-purple-900" : "group-hover:text-emerald-900"
                                }`}>
                                  {it.name}
                                </h4>
                                {it.subtitle && (
                                  <p className={`text-[10px] font-medium truncate mt-0.5 ${
                                    isRhythm ? "text-purple-700/80" : "text-emerald-700/80"
                                  }`}>
                                    {it.subtitle}
                                  </p>
                                )}
                                <p className="text-[10px] text-slate-400 mt-1">
                                  Ordered {it.orderCount} times
                                </p>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })()}

        {/* ========================================================================= */}
        {/* VIEW 2: ORDER HISTORY (Simple, Mobile-Friendly & Purchase Memory)        */}
        {/* ========================================================================= */}
        {activeTab === "orders" && (
          <div className="space-y-4 pb-12">
            {/* Orders Header Card */}
            <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-200">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-bold text-slate-900 tracking-tight">Orders</h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {orders.length} total orders across Zepto, Swiggy Instamart & Handpickd
                  </p>
                </div>
                {activeOrders.length > 0 && (
                  <div className="flex items-center gap-1.5 px-3 py-1 bg-amber-50 border border-amber-200 rounded-full text-xs font-semibold text-amber-800">
                    <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                    <span>{activeOrders.length} In Flight</span>
                  </div>
                )}
              </div>

              {/* Filter Tabs */}
              <div className="flex items-center gap-1.5 mt-3 pt-3 border-t border-slate-100 overflow-x-auto no-scrollbar">
                {(["ALL", "ORDER_PLACED", "DELIVERED", "CANCELLED"] as const).map((filter) => {
                  const label =
                    filter === "ALL"
                      ? "All Orders"
                      : filter === "ORDER_PLACED"
                      ? `In Flight (${activeOrders.length})`
                      : filter === "DELIVERED"
                      ? "Delivered"
                      : "Cancelled";
                  const validOrders = orders.filter((o) => o.items && o.items.length > 0);
                  const count =
                    filter === "ALL"
                      ? validOrders.length
                      : filter === "ORDER_PLACED"
                      ? activeOrders.length
                      : validOrders.filter((o) => o.status === filter).length;

                  return (
                    <button
                      type="button"
                      key={filter}
                      onClick={() => setOrdersFilter(filter)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-semibold shrink-0 transition-all active:scale-95 ${
                        ordersFilter === filter
                          ? "bg-slate-900 text-white shadow-xs"
                          : "bg-slate-100 hover:bg-slate-200 active:bg-slate-300 text-slate-600"
                      }`}
                    >
                      {label} <span className="opacity-70 text-[10px] ml-1">({count})</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Orders Feed */}
            <div className="space-y-3">
              {filteredOrders.length === 0 ? (
                <div className="bg-white rounded-2xl p-8 border border-slate-200 text-center">
                  <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto mb-3 text-xl">
                    📦
                  </div>
                  <h3 className="font-semibold text-slate-800 text-sm">No orders found</h3>
                  <p className="text-xs text-slate-500 mt-1">
                    {ordersFilter === "ORDER_PLACED"
                      ? "No orders currently in flight. When Rohan places an order, it will appear here."
                      : "No orders match this filter."}
                  </p>
                </div>
              ) : (
                filteredOrders.slice(0, ordersDisplayLimit).map((order) => {
                  const isExpanded = expandedOrderIds.has(order.orderId);
                  const headerDate = formatOrderHeaderDate(order.placedAt);
                  const amountStr = formatOrderAmount(order.totalAmount);
                  const platformStr = formatPlatformName(order.platform);

                  // Status Badge Styles
                  let badgeStyle = "bg-emerald-50 text-emerald-700 border-emerald-200";
                  let statusLabel = "Delivered";
                  if (order.status === "ORDER_PLACED") {
                    badgeStyle = "bg-amber-50 text-amber-800 border-amber-300";
                    statusLabel = "Order Placed";
                  } else if (order.status === "PARTIALLY_DELIVERED") {
                    badgeStyle = "bg-purple-50 text-purple-700 border-purple-200";
                    statusLabel = "Partially Delivered";
                  } else if (order.status === "CANCELLED") {
                    badgeStyle = "bg-rose-50 text-rose-700 border-rose-200";
                    statusLabel = "Cancelled";
                  }

                  return (
                    <div
                      key={order.orderId}
                      className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden transition-all hover:border-slate-300"
                    >
                      {/* Tap / Click Order Summary Header */}
                      <button
                        type="button"
                        onClick={() => toggleOrderExpanded(order.orderId)}
                        aria-expanded={isExpanded}
                        className="w-full text-left p-4 cursor-pointer hover:bg-slate-50/70 active:bg-slate-100 transition-colors flex items-center justify-between gap-3 select-none"
                      >
                        <div className="min-w-0 flex-1">
                          {/* Sep 12 · ₹2,840 */}
                          <div className="flex items-center gap-2">
                            <h3 className="text-base font-bold text-slate-900 tracking-tight">
                              {headerDate}
                              {amountStr}
                            </h3>
                            {order.status === "ORDER_PLACED" && (
                              <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                            )}
                          </div>

                          {/* Zepto · Delivered */}
                          <div className="flex items-center gap-1.5 mt-1 text-xs text-slate-600">
                            <span className="font-semibold text-slate-700">{platformStr}</span>
                            <span className="text-slate-300">•</span>
                            <span
                              className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full border ${badgeStyle}`}
                            >
                              {statusLabel}
                            </span>
                          </div>

                          {/* 18 items */}
                          <p className="text-xs text-slate-400 mt-1">
                            {order.items.length} {order.items.length === 1 ? "item" : "items"}
                          </p>
                        </div>

                        <div className="shrink-0 text-slate-400">
                          {isExpanded ? (
                            <ChevronUp className="w-5 h-5 text-slate-600" />
                          ) : (
                            <ChevronDown className="w-5 h-5" />
                          )}
                        </div>
                      </button>

                      {/* Tapped / Expanded Items List */}
                      {isExpanded && (
                        <div className="border-t border-slate-100 bg-slate-50/50 p-4 space-y-3 animate-fadeIn">
                          <div className="flex items-center justify-between pb-2 border-b border-slate-200/70">
                            <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                              Order Items
                            </span>
                            <span className="text-xs text-slate-500 font-medium">
                              {order.items.length} items
                            </span>
                          </div>

                          {/* Item List: e.g. Milk ×2, Paneer ×1 */}
                          <div className="space-y-2 divide-y divide-slate-100">
                            {order.items.map((item) => {
                              const isDelivered = item.status === "DELIVERED";
                              const isCancelled = item.status === "CANCELLED";
                              const isPlaced = item.status === "ORDER_PLACED";

                              return (
                                <div
                                  key={item.id}
                                  className="pt-2 first:pt-0 flex items-center justify-between gap-3 text-sm"
                                >
                                  <div className="min-w-0 flex-1">
                                    <p className="font-semibold text-slate-900 leading-snug">
                                      {item.canonicalName || item.name}
                                      <span className="text-slate-500 font-normal ml-1">
                                        ×{item.quantity}
                                      </span>
                                    </p>
                                    {item.name !== item.canonicalName && (
                                      <p className="text-[11px] text-slate-400 truncate">
                                        {item.name}
                                      </p>
                                    )}
                                  </div>

                                  {/* Item Status / Outcome Pill */}
                                  <div className="flex items-center gap-1.5 shrink-0">
                                    {isDelivered && (
                                      <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-100/70 border border-emerald-200 px-2 py-0.5 rounded-md flex items-center gap-1">
                                        <Check className="w-3 h-3 text-emerald-600" /> Delivered
                                      </span>
                                    )}
                                    {isCancelled && (
                                      <span className="text-[11px] font-semibold text-rose-700 bg-rose-100/70 border border-rose-200 px-2 py-0.5 rounded-md flex items-center gap-1">
                                        <XCircle className="w-3 h-3 text-rose-600" /> Cancelled
                                      </span>
                                    )}
                                    {isPlaced && (
                                      <span className="text-[11px] font-semibold text-amber-800 bg-amber-100/80 border border-amber-200 px-2 py-0.5 rounded-md flex items-center gap-1">
                                        <Clock className="w-3 h-3 text-amber-600" /> In Flight
                                      </span>
                                    )}

                                    {/* Item outcome controls for active/partial orders */}
                                    {(order.status === "ORDER_PLACED" || order.status === "PARTIALLY_DELIVERED") && (
                                      <div className="flex items-center gap-1 ml-1">
                                        {!isDelivered && (
                                          <button
                                            type="button"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              handleUpdateItemOutcome(order.orderId, item.id, "DELIVERED");
                                            }}
                                            title="Mark item received"
                                            className="px-2 py-0.5 rounded bg-emerald-50 hover:bg-emerald-100 active:scale-95 text-emerald-700 border border-emerald-200 text-[11px] font-semibold transition-all"
                                          >
                                            Receive
                                          </button>
                                        )}
                                        {!isCancelled && (
                                          <button
                                            type="button"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              handleUpdateItemOutcome(order.orderId, item.id, "CANCELLED");
                                            }}
                                            title="Mark item cancelled"
                                            className="px-2 py-0.5 rounded bg-rose-50 hover:bg-rose-100 active:scale-95 text-rose-700 border border-rose-200 text-[11px] font-semibold transition-all"
                                          >
                                            Cancel
                                          </button>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>

                          {/* Action toolbar for active in-flight order */}
                          {order.status === "ORDER_PLACED" && (
                            <div className="mt-4 pt-3 border-t border-slate-200/80 flex items-center justify-between gap-2">
                              <p className="text-[11px] text-slate-500 italic">
                                Active order is blocking Lira from re-adding these items.
                              </p>
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleUpdateOrderStatus(order.orderId, "CANCELLED");
                                  }}
                                  className="px-3 py-1.5 bg-white border border-rose-200 hover:bg-rose-50 active:scale-95 text-rose-700 text-xs font-semibold rounded-xl transition-all"
                                >
                                  Cancel Order
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleUpdateOrderStatus(order.orderId, "DELIVERED");
                                  }}
                                  className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white text-xs font-bold rounded-xl shadow-xs transition-all flex items-center gap-1"
                                >
                                  <Check className="w-3.5 h-3.5" />
                                  <span>Mark Delivered</span>
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })
              )}

              {/* Pagination / Load More */}
              {filteredOrders.length > ordersDisplayLimit && (
                <div className="text-center pt-3">
                  <button
                    type="button"
                    onClick={() => setOrdersDisplayLimit((prev) => prev + 30)}
                    className="px-4 py-2 bg-white border border-slate-200 hover:bg-slate-50 active:scale-95 text-slate-700 text-xs font-semibold rounded-xl transition-all shadow-2xs"
                  >
                    Load More Orders ({filteredOrders.length - ordersDisplayLimit} remaining)
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
