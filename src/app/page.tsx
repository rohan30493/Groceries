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
  Clock
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
  CategoryItemDef
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
  DbGroceryItem
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
  updateOrderItemOutcome
} from "../lib/orderLifecycle";
import {
  getDefaultHistoricalOrders,
  getCanonicalPurchaseMemory,
  isItemInActiveOrder
} from "../lib/purchaseMemory";

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

// Helpers for Order History formatting: "Sep 12 · ₹2,840"
function formatOrderHeaderDate(isoDateOrStr?: string): string {
  if (!isoDateOrStr) return "Recent Order";
  try {
    const d = new Date(isoDateOrStr);
    if (isNaN(d.getTime())) return isoDateOrStr;
    return d.toLocaleDateString("en-IN", { month: "short", day: "numeric" });
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

// Initial sample items to populate the list on first load
const INITIAL_ITEMS: GroceryItem[] = [];

export default function GroceryAssistantApp() {
  const [activeTab, setActiveTab] = useState<"lira" | "rohan" | "orders">("lira");
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
    } catch (e) {
      console.error("Local load error", e);
    }

    // 2. Fetch fresh items from Supabase
    fetchGroceryItems().then((dbItems) => {
      if (dbItems && dbItems.length > 0) {
        setItems(dbItems);
      }
      setIsCloudSynced(true);
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
          if (payload.eventType === "INSERT") {
            const newItem = toGroceryItem(payload.new as DbGroceryItem);
            setItems((prev) => {
              if (prev.some((x) => x.id === newItem.id)) return prev;
              return [newItem, ...prev];
            });
          } else if (payload.eventType === "UPDATE") {
            const updated = toGroceryItem(payload.new as DbGroceryItem);
            setItems((prev) =>
              prev.map((x) => (x.id === updated.id ? updated : x))
            );
          } else if (payload.eventType === "DELETE") {
            const oldId = (payload.old as { id: string }).id;
            setItems((prev) => prev.filter((x) => x.id !== oldId));
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

  // Save handoff state to localStorage on change
  useEffect(() => {
    try {
      localStorage.setItem("household_basket_handoff_state", JSON.stringify(handoffState));
    } catch (e) {
      console.error("Failed to save handoff state to localStorage", e);
    }
  }, [handoffState]);

  // Derived filtered subsets
  const pendingItems = useMemo(() => items.filter((it) => !it.isDone), [items]);
  const completedItems = useMemo(() => items.filter((it) => it.isDone), [items]);

  // Active orders in flight (ORDER_PLACED)
  const activeOrders = useMemo(() => {
    return orders.filter((o) => o.status === "ORDER_PLACED");
  }, [orders]);

  // Current active (pending) item names for pattern matching
  const currentItemNames = useMemo(() => {
    return items.filter((it) => !it.isDone).map((it) => it.name);
  }, [items]);

  // Intelligent Pattern Suggestions (reactively calculated from current active items + last added item + cadence replenishment)
  const patternSuggestions = useMemo(() => {
    if (currentItemNames.length === 0) return [];
    const rawSuggestions = getMissingItemSuggestions(
      currentItemNames,
      lastAddedItem,
      orders,
      activeOrders
    );
    return rawSuggestions.filter((s) => !dismissedSuggestions.has(s.item.toLowerCase()));
  }, [currentItemNames, lastAddedItem, dismissedSuggestions, orders, activeOrders]);

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

  // Filtered orders for Order History tab
  const filteredOrders = useMemo(() => {
    if (ordersFilter === "ALL") return orders;
    return orders.filter((o) => o.status === ordersFilter);
  }, [orders, ordersFilter]);

  // Order placement check for Rohan (gated until Lira hands off with 'I’m done. Please proceed with order.')
  const canOrderResult = useMemo(() => {
    return canPlaceOrder(handoffState, "Rohan", pendingItems.length);
  }, [handoffState, pendingItems.length]);

  // Add multiple items from input bar or speech
  const handleAddItems = (text: string, sender: "Lira" | "Rohan" = "Lira") => {
    if (!text.trim()) return;

    const parsedNames = parseNaturalLanguageList(text);
    if (parsedNames.length === 0) return;

    const nowIso = new Date().toISOString();
    const timeFormatted = formatEventTime(nowIso);

    const newItems: GroceryItem[] = parsedNames.map((name, idx) => ({
      id: `item-${Date.now()}-${idx}`,
      name: name,
      category: detectCategory(name),
      addedBy: sender,
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
  const handleAddSingleItem = (name: string, addedBy: "Lira" | "Rohan" | "Pattern Suggestion" = "Lira") => {
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
      addedBy: addedBy,
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
    handleAddSingleItem(itemName, "Lira");
    setLastAddedItem(itemName);
    setRecentlyAddedAnimation(itemName);
    setTimeout(() => {
      setRecentlyAddedAnimation((curr) => (curr === itemName ? null : curr));
    }, 1200);
  };

  // Lira autonomously adds all currently recommended items to the basket
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
          addedBy: "Lira",
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

  // Lira completes the basket and triggers handoff with the exact message: "I’m done. Please proceed with order."
  const handleLiraHandoff = () => {
    if (pendingItems.length === 0) return;
    try {
      const nextState = liraCompleteAndHandoff(handoffState, pendingItems.length);
      setHandoffState(nextState);
    } catch (e) {
      console.error("Handoff error", e);
    }
  };

  // Rohan places the order (gated until Lira hands off)
  const handlePlaceOrder = async () => {
    const check = canPlaceOrder(handoffState, "Rohan", pendingItems.length);
    if (!check.allowed) {
      alert(check.reason || "Cannot place order.");
      return;
    }

    const result = executePlaceOrder(handoffState, "Rohan", pendingItems.length);
    if (!result.success) {
      alert(result.error || "Failed to place order.");
      return;
    }

    // 1. Create the new HouseholdOrder in ORDER_PLACED status with canonical identities
    const newOrder = createOrderFromBasket(pendingItems, "Zepto", "Rohan");

    // 2. Add to orders history (newest first)
    setOrders((prev) => [newOrder, ...prev]);

    // 3. Persist to Supabase household_orders
    saveHouseholdOrder(newOrder);

    // 4. Remove active items from current basket (both local state & Supabase grocery_items)
    const activeItemIds = pendingItems.map((it) => it.id);
    setItems((prev) => prev.filter((it) => it.isDone));
    clearActiveBasketDb(activeItemIds);

    // 5. Transition handoff state to 'ordered'
    setHandoffState(result.nextState);
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

  // Reset to start a new grocery run
  const handleStartNewBasket = () => {
    setItems((prev) => prev.filter((it) => !it.isDone));
    setHandoffState(resetBasketState());
    setActiveTab("lira");
  };

  // Toggle Done / Bought status (sync to Supabase with exact purchased_at timestamp)
  const toggleItemDone = (id: string) => {
    const target = items.find((it) => it.id === id);
    if (target) {
      const willBeDone = !target.isDone;
      const updated: GroceryItem = {
        ...target,
        isDone: willBeDone,
        purchasedAt: willBeDone ? new Date().toISOString() : undefined
      };
      setItems((prev) =>
        prev.map((it) => (it.id === id ? updated : it))
      );
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

  // Copy list for WhatsApp or Rohan's quick ordering
  const handleCopyList = () => {
    const pending = items.filter((it) => !it.isDone);
    if (pending.length === 0) return;

    const listText = pending.map((it, idx) => `${idx + 1}. ${it.name}`).join("\n");
    const clipboardText = `🛒 *Household Grocery List:*\n${listText}`;

    navigator.clipboard.writeText(clipboardText);
    setCopiedNotification(true);
    setTimeout(() => setCopiedNotification(false), 2500);
  };

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
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-full bg-emerald-600 flex items-center justify-center text-white shadow-sm font-bold">
              🧺
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <h1 className="font-bold text-lg text-slate-900 leading-tight">D718 Groceries</h1>
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                  <span>Cloud Synced</span>
                </span>
              </div>
              <p className="text-xs text-slate-500">Smart Household Ordering Assistant</p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl">
            <button
              type="button"
              onClick={() => setActiveTab("lira")}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all active:scale-95 ${
                activeTab === "lira"
                  ? "bg-white text-emerald-800 shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Lira&apos;s View
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("rohan")}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all active:scale-95 flex items-center gap-1 ${
                activeTab === "rohan"
                  ? "bg-emerald-600 text-white shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <span>🛒 Rohan</span>
              {pendingItems.length > 0 && (
                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
                    activeTab === "rohan" ? "bg-emerald-700 text-white" : "bg-emerald-200 text-emerald-900"
                  }`}
                >
                  {pendingItems.length}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("orders")}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all active:scale-95 flex items-center gap-1.5 ${
                activeTab === "orders"
                  ? "bg-white text-emerald-800 shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <Clock className="w-3.5 h-3.5" />
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
        {/* VIEW 1: LIRA'S VIEW (Tell what is needed + Pattern Suggestions)           */}
        {/* ========================================================================= */}
        {activeTab === "lira" && (
          <div className="space-y-5">
            {/* Friendly Greeting Card */}
            <div className="bg-gradient-to-r from-emerald-700 to-teal-800 text-white rounded-2xl p-5 shadow-sm">
              <div className="flex items-start justify-between">
                <div>
                  <span className="inline-block px-2.5 py-1 bg-emerald-600/60 rounded-full text-xs font-medium text-emerald-100 mb-2">
                    Hi Lira
                  </span>
                  <h2 className="text-xl font-bold tracking-tight">What do we need ordered?</h2>
                  <p className="text-emerald-100 text-xs mt-1">
                    Type items below, paste from WhatsApp, or use the mic. The app will remind you if anything is missing!
                  </p>
                </div>
              </div>
            </div>

            {/* Lira Handoff Status & Gate Banner */}
            {handoffState.status === "ready_for_order" ? (
              <div className="bg-emerald-50 border-2 border-emerald-500 rounded-2xl p-4 shadow-sm animate-fadeIn">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-full bg-emerald-600 text-white flex items-center justify-center text-lg shrink-0 shadow-sm font-bold">
                      👩‍🍳
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-emerald-800 uppercase tracking-wider">
                          Lira Handoff Gate
                        </span>
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold border border-emerald-300">
                          Handed Off to Rohan
                        </span>
                      </div>
                      <p className="text-base font-bold text-slate-900 mt-1 italic">
                        &ldquo;{LIRA_HANDOFF_MESSAGE}&rdquo;
                      </p>
                      <p className="text-xs text-slate-600 mt-0.5">
                        Basket is complete with {pendingItems.length} items. Handed off to Rohan for ordering.
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveTab("rohan")}
                    className="shrink-0 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-bold text-xs rounded-xl shadow-sm transition-all flex items-center justify-center gap-1.5"
                  >
                    <span>Switch to Rohan to Place Order &rarr;</span>
                  </button>
                </div>
              </div>
            ) : pendingItems.length > 0 && handoffState.status === "building" ? (
              <div className="bg-amber-50/90 border border-amber-300/90 rounded-2xl p-4 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-fadeIn">
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-full bg-amber-500 text-white flex items-center justify-center text-sm font-bold shrink-0 shadow-2xs">
                    🧺
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-amber-900 uppercase tracking-wider">
                        Basket Status: Building by Lira
                      </span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-200 text-amber-900 font-bold">
                        {pendingItems.length} items
                      </span>
                    </div>
                    <p className="text-xs text-amber-800 mt-0.5">
                      Refine or add what is needed. When finished, complete the basket to hand off to Rohan.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleLiraHandoff}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-bold text-xs rounded-xl shadow-sm transition-all flex items-center justify-center gap-1.5 shrink-0"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Complete Basket &amp; Hand Off</span>
                </button>
              </div>
            ) : handoffState.status === "ordered" ? (
              <div className="bg-slate-100 border border-slate-200 rounded-2xl p-4 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                    Last Run Ordered
                  </span>
                  <p className="text-sm font-medium text-slate-700 mt-0.5">
                    Order for {handoffState.lastRunSummary?.itemCount ?? 0} items placed by Rohan.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setActiveTab("orders")}
                    className="px-3 py-1.5 bg-white border border-slate-300 hover:bg-slate-50 active:scale-95 text-slate-700 font-semibold text-xs rounded-xl transition-all flex items-center gap-1"
                  >
                    <Clock className="w-3.5 h-3.5" />
                    <span>View Orders</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleStartNewBasket}
                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-semibold text-xs rounded-xl transition-all"
                  >
                    Start New Basket
                  </button>
                </div>
              </div>
            ) : null}

            {/* Autonomous Basket Builder (Lira's Intelligent Staple & Replenishment Suggestions) */}
            {autonomousRecs.length > 0 && (
              <div className="bg-teal-50/70 border border-teal-200 rounded-2xl p-4 shadow-sm">
                <div className="flex items-center justify-between gap-2 mb-2.5">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-teal-700 shrink-0" />
                    <div>
                      <h3 className="text-sm font-bold text-teal-950">
                        Lira&apos;s Autonomous Recommendations
                      </h3>
                      <p className="text-[11px] text-teal-700">
                        Intelligent staples and co-occurrences needed for the household
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleAutonomousAddAll}
                    className="px-3 py-1.5 bg-teal-700 hover:bg-teal-800 active:scale-95 text-white font-bold text-xs rounded-xl shadow-2xs transition-all flex items-center gap-1 shrink-0"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Auto-Add All ({autonomousRecs.length})</span>
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
                  {autonomousRecs.map((rec) => (
                    <div
                      key={rec.name}
                      className="bg-white/95 border border-teal-100 rounded-xl p-2.5 flex items-center justify-between gap-2 hover:border-teal-300 transition-colors shadow-2xs"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-bold text-slate-800 truncate">
                            {rec.name}
                          </span>
                          <span className="text-[9px] px-1.5 py-0.2 rounded-full bg-teal-100 text-teal-800 font-medium">
                            {rec.category}
                          </span>
                        </div>
                        <p className="text-[10px] text-slate-500 truncate mt-0.5">
                          {rec.reason}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleAddSingleItem(rec.name, "Lira")}
                        className="bg-teal-600 hover:bg-teal-700 active:scale-95 text-white text-xs font-semibold px-2.5 py-1 rounded-lg transition-all flex items-center gap-1 shrink-0"
                      >
                        <Plus className="w-3 h-3" />
                        <span>Add</span>
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Input Card */}
            <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-200">
              <label className="block text-sm font-semibold text-slate-700 mb-2">
                Type or Paste Grocery List:
              </label>
              <div className="relative">
                <textarea
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  placeholder="e.g. Paneer, Tomatoes, Curd, Dania patta, Kulcha, Eggs..."
                  rows={3}
                  className="w-full text-base p-3.5 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent placeholder:text-slate-400"
                />
              </div>

              {detectedPreview.length > 1 && (
                <div className="mt-2.5 p-2.5 bg-emerald-50/80 border border-emerald-200 rounded-xl animate-fadeIn">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-800 mb-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Recognized {detectedPreview.length} separate items:</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {detectedPreview.map((name) => (
                      <span
                        key={name}
                        className="px-2.5 py-0.5 rounded-md bg-white text-emerald-900 text-xs font-semibold border border-emerald-300 shadow-2xs"
                      >
                        {name}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between gap-3 mt-3">
                <button
                  type="button"
                  onClick={toggleVoiceInput}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium border transition-all active:scale-95 ${
                    isListening
                      ? "bg-rose-50 border-rose-300 text-rose-700 animate-pulse"
                      : "bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100"
                  }`}
                >
                  {isListening ? <MicOff className="w-4 h-4 text-rose-600" /> : <Mic className="w-4 h-4 text-slate-600" />}
                  <span>{isListening ? "Listening..." : "Speak items"}</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleAddItems(inputText, "Lira")}
                  disabled={!inputText.trim()}
                  className="flex-1 bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-2.5 px-5 rounded-xl shadow-sm transition-all flex items-center justify-center gap-2 text-base"
                >
                  <Plus className="w-5 h-5" />
                  <span>
                    {detectedPreview.length > 1
                      ? `Add All ${detectedPreview.length} Items`
                      : "Add to List"}
                  </span>
                </button>
              </div>
            </div>

            {/* SMART PATTERN SUGGESTIONS ("Did you forget anything?") */}
            {/* Only shown when items have actually been added to the list! */}
            {pendingItems.length > 0 && patternSuggestions.length > 0 && (
              <div className="bg-amber-50/95 border border-amber-300/90 rounded-2xl p-4 shadow-sm animate-fadeIn">
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2 text-amber-900 font-bold text-base">
                    <Sparkles className="w-5 h-5 text-amber-600 shrink-0" />
                    <span>
                      {lastAddedItem
                        ? `Added "${lastAddedItem}" — Did you forget any of these?`
                        : "Did you forget any of these?"}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      patternSuggestions.forEach((s) => dismissedSuggestions.add(s.item.toLowerCase()));
                      setDismissedSuggestions(new Set(dismissedSuggestions));
                    }}
                    className="text-xs text-amber-700 hover:text-amber-950 active:scale-95 font-medium px-2 py-0.5 rounded-lg hover:bg-amber-100 transition-all"
                  >
                    Dismiss
                  </button>
                </div>
                <p className="text-xs text-amber-800 mb-3">
                  Based on 820+ past orders, these items are frequently ordered together with what you just added:
                </p>

                <div className="space-y-2">
                  {patternSuggestions.map((suggestion) => (
                    <div
                      key={suggestion.item}
                      className="bg-white/95 border border-amber-200 rounded-xl p-3 flex items-center justify-between gap-3 shadow-2xs hover:border-amber-300 transition-all"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold text-slate-900 text-sm flex items-center gap-1.5 flex-wrap">
                          <span>{suggestion.item}</span>
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 font-medium">
                            Usually with {suggestion.triggeredBy}
                          </span>
                          {suggestion.dueText && (
                            <span
                              className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
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
                        <p className="text-xs text-slate-500 truncate mt-0.5">{suggestion.reason}</p>
                        {suggestion.cadenceText ? (
                          <p className="text-xs text-slate-600 font-medium mt-1">
                            {suggestion.cadenceText}
                          </p>
                        ) : suggestion.lastOrderedText ? (
                          <p className="text-xs text-slate-500 mt-1">
                            {suggestion.lastOrderedText}
                          </p>
                        ) : null}
                      </div>

                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            handleAddSingleItem(suggestion.item, "Pattern Suggestion");
                            setLastAddedItem(suggestion.item);
                            setDismissedSuggestions((prev) => new Set([...prev, suggestion.item.toLowerCase()]));
                          }}
                          className="bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-all flex items-center gap-1 shadow-2xs"
                        >
                          <Plus className="w-3.5 h-3.5" />
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

            {/* ========================================================================= */}
            {/* SHOP BY CATEGORY (Zepto-style Sections & 1-Tap Quick Add)                 */}
            {/* ========================================================================= */}
            <div className="bg-white rounded-2xl p-4 sm:p-5 shadow-sm border border-slate-200">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3.5">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-lg">🛍️</span>
                    <h3 className="text-base font-bold text-slate-900 tracking-tight">
                      Shop by Category
                    </h3>
                    <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                      {totalStaplesCount} Past Staples
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    1-Tap quick add from your 820+ past orders • Brand names consolidated
                  </p>
                </div>

                {/* Quick Search across all categories */}
                <div className="relative min-w-[200px]">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={categorySearchQuery}
                    onChange={(e) => setCategorySearchQuery(e.target.value)}
                    placeholder="Search past items..."
                    className="w-full text-xs pl-8 pr-6 py-1.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-500 bg-slate-50 focus:bg-white"
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

              {/* Category Grid (Compact 2-column mobile grid, 4-column responsive desktop) */}
              {!categorySearchQuery && (
                <div
                  role="tablist"
                  aria-label="Grocery categories"
                  className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3.5"
                >
                  {categorySections.map((cat) => {
                    const isSelected = selectedCategoryId === cat.id;
                    const count = cat.itemCount ?? cat.items?.length ?? 0;
                    return (
                      <button
                        key={cat.id}
                        type="button"
                        role="tab"
                        aria-selected={isSelected}
                        aria-label={`${cat.name}, ${count} items`}
                        onClick={() => setSelectedCategoryId(cat.id)}
                        className={`group relative flex items-center justify-between gap-1.5 p-2 sm:p-2.5 rounded-xl text-left transition-all border min-h-[48px] active:scale-95 ${
                          isSelected
                            ? "bg-emerald-50/90 border-emerald-600 text-emerald-950 shadow-xs ring-1 ring-emerald-600/25"
                            : "bg-slate-50/80 hover:bg-slate-100 text-slate-700 border-slate-200/90 hover:border-slate-300"
                        }`}
                      >
                        <div className="flex items-center gap-1.5 sm:gap-2 min-w-0 flex-1">
                          <span className="text-base sm:text-lg shrink-0 leading-none select-none">
                            {cat.icon}
                          </span>
                          <span
                            className={`text-[11px] sm:text-xs leading-tight break-words ${
                              isSelected ? "font-bold text-emerald-950" : "font-semibold text-slate-800"
                            }`}
                          >
                            {cat.name}
                          </span>
                        </div>
                        <span
                          className={`shrink-0 text-[10px] px-1.5 py-0.5 rounded-full font-bold tabular-nums ${
                            isSelected
                              ? "bg-emerald-200/90 text-emerald-900"
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

              {/* Search Header or Category Header */}
              {categoryBrowseData.isSearch ? (
                <div className="flex items-center justify-between mb-3 text-xs font-semibold text-slate-600 bg-slate-50 px-3 py-2 rounded-lg">
                  <span>
                    Search results for &ldquo;{categorySearchQuery}&rdquo; ({categoryBrowseData.results.length} items found)
                  </span>
                  <button
                    onClick={() => setCategorySearchQuery("")}
                    className="text-emerald-700 hover:underline"
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
                  <span className="text-xs text-slate-400">
                    {categoryBrowseData.activeCategory?.items.length} items ordered before
                  </span>
                </div>
              )}

              {/* Items Grid (Responsive 2 or 3 columns) */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 max-h-[380px] overflow-y-auto pr-1">
                {categoryBrowseData.isSearch ? (
                  categoryBrowseData.results.length === 0 ? (
                    <div className="col-span-full py-8 text-center text-slate-400 text-xs">
                      No past items matching &ldquo;{categorySearchQuery}&rdquo;. Try typing it in the top input box to add!
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
                              ? "bg-emerald-50/70 border-emerald-300"
                              : "bg-white hover:bg-slate-50 active:bg-emerald-50/40 border-slate-200 hover:border-emerald-300 hover:shadow-2xs"
                          } ${isRecentlyClicked ? "ring-2 ring-emerald-500 scale-[1.02]" : ""}`}
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
                              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[10px] font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">
                                <Check className="w-3 h-3 text-emerald-700" />
                                <span>In List</span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-slate-100 text-slate-600 group-hover:bg-emerald-600 group-hover:text-white transition-colors">
                                <Plus className="w-3 h-3" />
                                <span>Add</span>
                              </span>
                            )}
                          </div>
                          <div>
                            <h4 className="font-semibold text-slate-900 text-xs leading-snug group-hover:text-emerald-900">
                              {it.name}
                            </h4>
                            {it.subtitle && (
                              <p className="text-[10px] text-emerald-700/80 font-medium truncate mt-0.5">
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
                            ? "bg-emerald-50/70 border-emerald-300"
                            : "bg-white hover:bg-slate-50 active:bg-emerald-50/40 border-slate-200 hover:border-emerald-300 hover:shadow-2xs"
                        } ${isRecentlyClicked ? "ring-2 ring-emerald-500 scale-[1.02]" : ""}`}
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
                            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[10px] font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">
                              <Check className="w-3 h-3 text-emerald-700" />
                              <span>In List</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-slate-100 text-slate-600 group-hover:bg-emerald-600 group-hover:text-white transition-colors">
                              <Plus className="w-3 h-3" />
                              <span>Add</span>
                            </span>
                          )}
                        </div>
                        <div>
                          <h4 className="font-semibold text-slate-900 text-xs leading-snug group-hover:text-emerald-900">
                            {it.name}
                          </h4>
                          {it.subtitle && (
                            <p className="text-[10px] text-emerald-700/80 font-medium truncate mt-0.5">
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

            {/* Current Items Preview */}
            <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-200">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <span>Currently on the list</span>
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                    {pendingItems.length} items
                  </span>
                </h3>
                <button
                  onClick={() => setActiveTab("rohan")}
                  className="text-xs font-semibold text-emerald-600 hover:text-emerald-700 flex items-center gap-1"
                >
                  <span>Switch to Rohan&apos;s Checklist &rarr;</span>
                </button>
              </div>

              {pendingItems.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-6">
                  List is empty! Add items above or tap quick staples.
                </p>
              ) : (
                pendingItems.map((it) => {
                  const isDeleting = deletingItemIds.has(it.id);
                  return (
                    <div
                      key={it.id}
                      className={`py-2.5 flex items-center justify-between transition-all ${
                        isDeleting ? "item-delete-exit" : ""
                      }`}
                    >
                      <div>
                        <span className="text-base font-medium text-slate-800">{it.name}</span>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[10px] text-slate-400">{it.category}</span>
                          <span className="text-[10px] text-slate-400">• Added {formatEventTime(it.createdAt || it.addedAt)}</span>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => deleteItem(it.id)}
                        className="text-slate-300 hover:text-rose-500 active:scale-90 p-1.5 transition-all"
                        title="Remove"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  );
                })
              )}

              {/* Lira Handoff Callout at bottom of list */}
              {pendingItems.length > 0 && (
                handoffState.status === "ready_for_order" ? (
                  <div className="mt-3.5 p-3 rounded-xl bg-emerald-50 border border-emerald-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                      <span className="text-xs font-semibold text-emerald-950">
                        Basket handed off: &ldquo;{LIRA_HANDOFF_MESSAGE}&rdquo;
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setActiveTab("rohan")}
                      className="text-xs font-bold text-emerald-700 hover:text-emerald-900 active:scale-95 transition-transform flex items-center gap-1"
                    >
                      <span>Go to Rohan&apos;s View to Place Order &rarr;</span>
                    </button>
                  </div>
                ) : (
                  <div className="mt-3.5 pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                    <span className="text-xs text-slate-500">
                      Finished building the basket?
                    </span>
                    <button
                      type="button"
                      onClick={handleLiraHandoff}
                      className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-bold text-xs rounded-xl shadow-2xs transition-all flex items-center gap-1.5"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Complete Basket &amp; Hand Off</span>
                    </button>
                  </div>
                )
              )}
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* VIEW 2: ROHAN'S VIEW (Running List & Checkoff)                             */}
        {/* ========================================================================= */}
        {activeTab === "rohan" && (
          <div className="space-y-5">
            {/* Lira Handoff Gate Status Banner in Rohan's View */}
            {handoffState.status === "ready_for_order" ? (
              <div className="bg-emerald-50 border-2 border-emerald-500 rounded-2xl p-4 shadow-sm animate-fadeIn">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-full bg-emerald-600 text-white flex items-center justify-center text-lg shrink-0 shadow-sm font-bold">
                      👩‍🍳
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-emerald-800 uppercase tracking-wider">
                          Lira Handoff Gate • Open
                        </span>
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-200 text-emerald-950 font-bold border border-emerald-300">
                          Ready to Order
                        </span>
                      </div>
                      <p className="text-base font-bold text-slate-900 mt-1 italic">
                        &ldquo;{LIRA_HANDOFF_MESSAGE}&rdquo;
                      </p>
                      <p className="text-xs text-slate-600 mt-0.5">
                        Lira has finalized the basket with {pendingItems.length} items. The ordering gate is open — you can now place the order.
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handlePlaceOrder}
                    className="shrink-0 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-bold text-xs rounded-xl shadow-sm transition-all flex items-center justify-center gap-1.5 ring-2 ring-emerald-500/40"
                  >
                    <ShoppingCart className="w-4 h-4" />
                    <span>Place Order Now ({pendingItems.length})</span>
                  </button>
                </div>
              </div>
            ) : handoffState.status === "building" ? (
              <div className="bg-amber-50/90 border border-amber-300 rounded-2xl p-4 shadow-sm animate-fadeIn">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <div className="w-9 h-9 rounded-full bg-amber-500 text-white flex items-center justify-center text-sm font-bold shrink-0 shadow-2xs">
                      ⏳
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-amber-900 uppercase tracking-wider">
                          Handoff Gate Locked • Basket in Progress
                        </span>
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-200 text-amber-900 font-bold">
                          Building by Lira
                        </span>
                      </div>
                      <p className="text-xs text-amber-900 font-medium mt-1">
                        Lira is autonomously building and refining the basket ({pendingItems.length} items so far). Order placement is gated until Lira hands off with:
                      </p>
                      <p className="text-xs font-bold text-amber-950 mt-0.5 italic">
                        &ldquo;{LIRA_HANDOFF_MESSAGE}&rdquo;
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveTab("lira")}
                    className="shrink-0 px-3.5 py-1.5 bg-white border border-amber-300 hover:bg-amber-50 active:scale-95 text-amber-900 font-semibold text-xs rounded-xl transition-all"
                  >
                    View Lira&apos;s Basket &rarr;
                  </button>
                </div>
              </div>
            ) : handoffState.status === "ordered" ? (
              <div className="bg-emerald-50/80 border border-emerald-300 rounded-2xl p-4 shadow-sm animate-fadeIn">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <div className="w-9 h-9 rounded-full bg-emerald-600 text-white flex items-center justify-center text-sm font-bold shrink-0">
                      ✓
                    </div>
                    <div>
                      <span className="text-xs font-bold text-emerald-800 uppercase tracking-wider">
                        Order Placed by Rohan
                      </span>
                      <p className="text-sm font-semibold text-slate-900 mt-0.5">
                        Order for {handoffState.lastRunSummary?.itemCount ?? 0} items placed at {formatEventTime(handoffState.orderedAt ?? undefined)}.
                      </p>
                      <p className="text-xs text-slate-500">
                        Basket cleared. Items are now in flight and tracked in Order History.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setActiveTab("orders")}
                      className="shrink-0 px-3.5 py-2 bg-white border border-emerald-300 hover:bg-emerald-50 active:scale-95 text-emerald-800 text-xs font-semibold rounded-xl transition-all flex items-center gap-1.5 shadow-2xs"
                    >
                      <Clock className="w-3.5 h-3.5" />
                      <span>View Orders</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleStartNewBasket}
                      className="shrink-0 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white text-xs font-semibold rounded-xl transition-all"
                    >
                      Start New Basket
                    </button>
                  </div>
                </div>
              </div>
            ) : null}

            {/* Header Toolbar */}
            <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-200">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <span className="text-xs font-semibold text-emerald-700 uppercase tracking-wider">
                    Running Grocery Checklist
                  </span>
                  <h2 className="text-xl font-bold text-slate-900">
                    {pendingItems.length} Items to Order / Buy
                  </h2>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handlePlaceOrder}
                    disabled={!canOrderResult.allowed}
                    title={canOrderResult.allowed ? "Place order with current items" : canOrderResult.reason}
                    className={`flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold rounded-xl transition-all shadow-sm ${
                      canOrderResult.allowed
                        ? "bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white ring-2 ring-emerald-500/50 cursor-pointer"
                        : "bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200"
                    }`}
                  >
                    <ShoppingCart className="w-3.5 h-3.5" />
                    <span>{canOrderResult.allowed ? `Place Order (${pendingItems.length})` : "Place Order (Locked)"}</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleCopyList}
                    className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 active:scale-95 text-slate-700 text-xs font-semibold rounded-xl transition-all"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    <span>{copiedNotification ? "Copied!" : "Copy for WhatsApp"}</span>
                  </button>

                  {completedItems.length > 0 && (
                    <button
                      type="button"
                      onClick={clearCompleted}
                      className="flex items-center gap-1 px-3 py-2 bg-rose-50 hover:bg-rose-100 active:scale-95 text-rose-700 text-xs font-semibold rounded-xl transition-all"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Clear Done ({completedItems.length})</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Quick Add Bar for Rohan */}
              <div className="mt-3.5 flex items-center gap-2">
                <input
                  type="text"
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleAddItems(inputText, "Rohan");
                  }}
                  placeholder="Quick add item (e.g. Eggs, Coffee)..."
                  className="flex-1 text-sm px-3.5 py-2 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
                <button
                  type="button"
                  onClick={() => handleAddItems(inputText, "Rohan")}
                  disabled={!inputText.trim()}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 active:scale-95 disabled:opacity-50 text-white font-medium text-sm rounded-xl transition-all flex items-center gap-1"
                >
                  <Plus className="w-4 h-4" />
                  <span>Add</span>
                </button>
              </div>
            </div>

            {/* Categorized To-Buy Checklist */}
            {pendingItems.length === 0 ? (
              <div className="bg-white rounded-2xl p-10 text-center border border-slate-200 shadow-sm">
                <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto mb-3">
                  <Check className="w-6 h-6" />
                </div>
                <h3 className="font-bold text-slate-800 text-lg">All items checked off!</h3>
                <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                  Everything requested has been bought or marked as done. Lira can add more items anytime.
                </p>
                <button
                  type="button"
                  onClick={() => setActiveTab("lira")}
                  className="mt-4 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white text-xs font-semibold rounded-xl transition-all"
                >
                  Add New Items
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                {Object.entries(groupedPending).map(([category, catItems]) => (
                  <div key={category} className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                    <div className="bg-slate-50/80 px-4 py-2.5 border-b border-slate-200/70 flex items-center justify-between">
                      <span className="font-bold text-xs uppercase tracking-wider text-slate-600">
                        {category}
                      </span>
                      <span className="text-[11px] font-semibold text-slate-500">
                        {catItems.length} {catItems.length === 1 ? "item" : "items"}
                      </span>
                    </div>

                    <div className="divide-y divide-slate-100">
                      {catItems.map((item) => {
                        const isDeleting = deletingItemIds.has(item.id);
                        return (
                          <div
                            key={item.id}
                            className={`px-4 py-3 flex items-center justify-between hover:bg-slate-50/50 transition-colors group ${
                              isDeleting ? "item-delete-exit" : ""
                            }`}
                          >
                          <div className="flex items-center gap-3 flex-1 min-w-0">
                            <button
                              type="button"
                              onClick={() => toggleItemDone(item.id)}
                              aria-label={`Mark ${item.name} as done`}
                              className="w-6 h-6 rounded-lg border-2 border-slate-300 hover:border-emerald-500 active:scale-90 flex items-center justify-center transition-all text-transparent hover:text-emerald-500 shrink-0"
                            >
                              <Check className="w-4 h-4" />
                            </button>
                            <div
                              onClick={() => toggleItemDone(item.id)}
                              className="flex-1 cursor-pointer select-none min-w-0"
                            >
                              <p className="text-base font-medium text-slate-900 leading-snug">{item.name}</p>
                              <div className="flex flex-wrap items-center gap-2 mt-0.5">
                                <span className="text-[10px] text-slate-500 flex items-center gap-1">
                                  <Clock className="w-3 h-3 text-slate-400" />
                                  <span>Added {formatEventTime(item.createdAt || item.addedAt)}</span>
                                </span>
                                <span className="text-[10px] text-slate-400">
                                  • by {item.addedBy}
                                </span>
                                {item.addedBy === "Pattern Suggestion" && (
                                  <span className="text-[9px] px-1.5 py-0.2 rounded bg-amber-100 text-amber-800 font-medium">
                                    AI Suggestion
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            <button
                              type="button"
                              onClick={() => toggleItemDone(item.id)}
                              className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 active:scale-95 text-emerald-800 font-semibold text-xs rounded-lg transition-all"
                            >
                              Mark Done
                            </button>
                            <button
                              type="button"
                              onClick={() => deleteItem(item.id)}
                              className="text-slate-300 hover:text-rose-500 active:scale-90 p-1.5 transition-all"
                              title="Delete"
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

            {/* Completed / Bought Items Section */}
            {completedItems.length > 0 && (
              <div className="bg-slate-100/80 rounded-2xl p-4 border border-slate-200">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2 flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Bought / Done ({completedItems.length})</span>
                </h3>
                <div className="divide-y divide-slate-200/60">
                  {completedItems.map((item) => (
                    <div key={item.id} className="py-2.5 flex items-center justify-between">
                      <div className="flex items-center gap-2.5 flex-1 min-w-0">
                        <button
                          type="button"
                          onClick={() => toggleItemDone(item.id)}
                          aria-label={`Unmark ${item.name}`}
                          className="w-5 h-5 rounded-md bg-emerald-600 active:scale-90 text-white flex items-center justify-center shrink-0 transition-all"
                        >
                          <Check className="w-3.5 h-3.5" />
                        </button>
                        <div
                          onClick={() => toggleItemDone(item.id)}
                          className="flex-1 cursor-pointer select-none min-w-0"
                        >
                          <span className="text-sm line-through text-slate-500 font-medium block leading-snug">{item.name}</span>
                          <div className="flex items-center gap-2 mt-0.5 text-[10px] text-slate-400">
                            {item.purchasedAt ? (
                              <span className="text-emerald-700 font-medium">
                                Bought {formatEventTime(item.purchasedAt)}
                              </span>
                            ) : (
                              <span>Bought</span>
                            )}
                            <span>• Added {formatEventTime(item.createdAt || item.addedAt)} ({item.addedBy})</span>
                          </div>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => toggleItemDone(item.id)}
                        className="text-xs text-slate-400 hover:text-slate-700 active:scale-95 px-2 py-1 font-medium transition-all shrink-0"
                        title="Restore to active list"
                      >
                        Undo
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ========================================================================= */}
        {/* VIEW 3: ORDER HISTORY (Simple, Mobile-Friendly & Purchase Memory)        */}
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
                  const count =
                    filter === "ALL"
                      ? orders.length
                      : filter === "ORDER_PLACED"
                      ? activeOrders.length
                      : orders.filter((o) => o.status === filter).length;

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
