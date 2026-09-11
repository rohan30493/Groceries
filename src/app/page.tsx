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
  toGroceryItem,
  DbGroceryItem
} from "../lib/supabase";

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

// Initial sample items to populate the list on first load
const INITIAL_ITEMS: GroceryItem[] = [];

export default function GroceryAssistantApp() {
  const [activeTab, setActiveTab] = useState<"lira" | "rohan">("lira");
  const [items, setItems] = useState<GroceryItem[]>(INITIAL_ITEMS);
  const [inputText, setInputText] = useState("");
  const [isListening, setIsListening] = useState(false);
  const [copiedNotification, setCopiedNotification] = useState(false);
  const [dismissedSuggestions, setDismissedSuggestions] = useState<Set<string>>(new Set());

  // Dynamic category sections loaded from Supabase (falls back to DEFAULT_CATEGORY_SECTIONS)
  const [categorySections, setCategorySections] = useState<CategorySection[]>(DEFAULT_CATEGORY_SECTIONS);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>("fruits-vegetables");
  const [categorySearchQuery, setCategorySearchQuery] = useState<string>("");
  const [recentlyAddedAnimation, setRecentlyAddedAnimation] = useState<string | null>(null);
  const [lastAddedItem, setLastAddedItem] = useState<string | null>(null);
  const [isCloudSynced, setIsCloudSynced] = useState<boolean>(false);

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
        setCategorySections(sections as CategorySection[]);
      }
    });

    // 4. Supabase Realtime multi-device subscription (Lira & Rohan stay synced)
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

  // Save to localStorage on change as reliable backup
  useEffect(() => {
    try {
      localStorage.setItem("household_grocery_items", JSON.stringify(items));
    } catch (e) {
      console.error("Failed to save items to localStorage", e);
    }
  }, [items]);

  // Current active (pending) item names for pattern matching
  const currentItemNames = useMemo(() => {
    return items.filter((it) => !it.isDone).map((it) => it.name);
  }, [items]);

  // Intelligent Pattern Suggestions (reactively calculated from current active items + last added item)
  const patternSuggestions = useMemo(() => {
    if (currentItemNames.length === 0) return [];
    const rawSuggestions = getMissingItemSuggestions(currentItemNames, lastAddedItem);
    return rawSuggestions.filter((s) => !dismissedSuggestions.has(s.item.toLowerCase()));
  }, [currentItemNames, lastAddedItem, dismissedSuggestions]);

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
    return { isSearch: false, results: [], activeCategory };
  }, [categorySections, categorySearchQuery, selectedCategoryId]);

  // Derived filtered subsets
  const pendingItems = useMemo(() => items.filter((it) => !it.isDone), [items]);
  const completedItems = useMemo(() => items.filter((it) => it.isDone), [items]);

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

  // Delete an item (sync to Supabase)
  const deleteItem = (id: string) => {
    setItems((prev) => prev.filter((it) => it.id !== id));
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
                <h1 className="font-bold text-lg text-slate-900 leading-tight">Ghar Ki Groceries</h1>
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
              onClick={() => setActiveTab("lira")}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                activeTab === "lira"
                  ? "bg-white text-emerald-800 shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Lira&apos;s View
            </button>
            <button
              onClick={() => setActiveTab("rohan")}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all flex items-center gap-1 ${
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
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium border transition-colors ${
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
                  className="flex-1 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-2.5 px-5 rounded-xl shadow-sm transition-colors flex items-center justify-center gap-2 text-base"
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
                    onClick={() => {
                      patternSuggestions.forEach((s) => dismissedSuggestions.add(s.item.toLowerCase()));
                      setDismissedSuggestions(new Set(dismissedSuggestions));
                    }}
                    className="text-xs text-amber-700 hover:text-amber-950 font-medium px-2 py-0.5 rounded-lg hover:bg-amber-100 transition-colors"
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
                        <div className="font-semibold text-slate-900 text-sm flex items-center gap-1.5">
                          <span>{suggestion.item}</span>
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 font-medium">
                            Usually with {suggestion.triggeredBy}
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 truncate">{suggestion.reason}</p>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => {
                            handleAddSingleItem(suggestion.item, "Pattern Suggestion");
                            setLastAddedItem(suggestion.item);
                            setDismissedSuggestions((prev) => new Set([...prev, suggestion.item.toLowerCase()]));
                          }}
                          className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1 shadow-2xs"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>Add</span>
                        </button>
                        <button
                          onClick={() => {
                            setDismissedSuggestions((prev) => new Set([...prev, suggestion.item.toLowerCase()]));
                          }}
                          className="text-slate-400 hover:text-slate-600 p-1"
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

              {/* Category Pills Carousel (Zepto style) */}
              {!categorySearchQuery && (
                <div className="flex items-center gap-2 overflow-x-auto pb-2 mb-3.5 scrollbar-thin">
                  {categorySections.map((cat) => {
                    const isSelected = selectedCategoryId === cat.id;
                    return (
                      <button
                        key={cat.id}
                        onClick={() => setSelectedCategoryId(cat.id)}
                        className={`shrink-0 flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold transition-all border ${
                          isSelected
                            ? "bg-emerald-700 text-white border-emerald-700 shadow-xs"
                            : "bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200"
                        }`}
                      >
                        <span className="text-sm">{cat.icon}</span>
                        <span>{cat.name}</span>
                        <span
                          className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                            isSelected ? "bg-emerald-800 text-white" : "bg-slate-200/80 text-slate-600"
                          }`}
                        >
                          {cat.itemCount}
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
                          className={`cursor-pointer group relative p-3 rounded-xl border transition-all duration-150 flex flex-col justify-between select-none ${
                            isAlreadyInList
                              ? "bg-emerald-50/70 border-emerald-300"
                              : "bg-white hover:bg-slate-50 border-slate-200 hover:border-emerald-300 hover:shadow-2xs"
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
                        className={`cursor-pointer group relative p-3 rounded-xl border transition-all duration-150 flex flex-col justify-between select-none ${
                          isAlreadyInList
                            ? "bg-emerald-50/70 border-emerald-300"
                            : "bg-white hover:bg-slate-50 border-slate-200 hover:border-emerald-300 hover:shadow-2xs"
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
                <div className="divide-y divide-slate-100">
                  {pendingItems.map((it) => (
                    <div key={it.id} className="py-2.5 flex items-center justify-between">
                      <div>
                        <span className="text-base font-medium text-slate-800">{it.name}</span>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[10px] text-slate-400">{it.category}</span>
                          <span className="text-[10px] text-slate-400">• Added {formatEventTime(it.createdAt || it.addedAt)}</span>
                        </div>
                      </div>
                      <button
                        onClick={() => deleteItem(it.id)}
                        className="text-slate-300 hover:text-rose-500 p-1"
                        title="Remove"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* VIEW 2: ROHAN'S VIEW (Running List & Checkoff)                             */}
        {/* ========================================================================= */}
        {activeTab === "rohan" && (
          <div className="space-y-5">
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
                    onClick={handleCopyList}
                    className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl transition-colors"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    <span>{copiedNotification ? "Copied!" : "Copy for WhatsApp"}</span>
                  </button>

                  {completedItems.length > 0 && (
                    <button
                      onClick={clearCompleted}
                      className="flex items-center gap-1 px-3 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-semibold rounded-xl transition-colors"
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
                  onClick={() => handleAddItems(inputText, "Rohan")}
                  disabled={!inputText.trim()}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-medium text-sm rounded-xl transition-colors flex items-center gap-1"
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
                  onClick={() => setActiveTab("lira")}
                  className="mt-4 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-xl"
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
                      {catItems.map((item) => (
                        <div
                          key={item.id}
                          className="px-4 py-3 flex items-center justify-between hover:bg-slate-50/50 transition-colors group"
                        >
                          <div
                            onClick={() => toggleItemDone(item.id)}
                            className="flex items-center gap-3 flex-1 cursor-pointer select-none"
                          >
                            <button
                              type="button"
                              className="w-6 h-6 rounded-lg border-2 border-slate-300 group-hover:border-emerald-500 flex items-center justify-center transition-colors text-transparent hover:text-emerald-500"
                            >
                              <Check className="w-4 h-4" />
                            </button>
                            <div>
                              <p className="text-base font-medium text-slate-900">{item.name}</p>
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

                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => toggleItemDone(item.id)}
                              className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-semibold text-xs rounded-lg transition-colors"
                            >
                              Mark Done
                            </button>
                            <button
                              onClick={() => deleteItem(item.id)}
                              className="text-slate-300 hover:text-rose-500 p-1.5"
                              title="Delete"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      ))}
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
                      <div
                        onClick={() => toggleItemDone(item.id)}
                        className="flex items-center gap-2.5 cursor-pointer flex-1"
                      >
                        <div className="w-5 h-5 rounded-md bg-emerald-600 text-white flex items-center justify-center shrink-0">
                          <Check className="w-3.5 h-3.5" />
                        </div>
                        <div>
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
                        onClick={() => toggleItemDone(item.id)}
                        className="text-xs text-slate-400 hover:text-slate-700 px-2 py-1 font-medium"
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
      </main>
    </div>
  );
}
