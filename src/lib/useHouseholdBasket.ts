"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  HouseholdBasket,
  BasketSnapshot,
  SupabaseBasketStore,
  BrowserNotificationAdapter
} from "./householdBasket";
import { GroceryItem } from "./patterns";

export function useHouseholdBasket() {
  const basketRef = useRef<HouseholdBasket | null>(null);
  if (!basketRef.current) {
    basketRef.current = new HouseholdBasket(
      new SupabaseBasketStore(),
      new BrowserNotificationAdapter()
    );
  }
  const basket = basketRef.current;
  const [snapshot, setSnapshot] = useState<BasketSnapshot>(() => basket.getSnapshot());

  useEffect(() => {
    // Read local cache for instantaneous initial render
    let cachedItems: GroceryItem[] | undefined;
    let cachedHandoff: any;
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem("household_grocery_items");
        if (saved) cachedItems = JSON.parse(saved);
        const savedHandoff = localStorage.getItem("household_basket_handoff_state");
        if (savedHandoff) cachedHandoff = JSON.parse(savedHandoff);
      } catch {}
    }

    const unsub = basket.subscribe((snap) => {
      setSnapshot(snap);
      if (typeof window !== "undefined") {
        try {
          localStorage.setItem("household_grocery_items", JSON.stringify(snap.items));
          localStorage.setItem("household_basket_handoff_state", JSON.stringify(snap.handoffState));
        } catch {}
      }
    });

    basket.initialize(cachedItems, cachedHandoff);

    return () => {
      unsub();
    };
  }, [basket]);

  const addItems = useCallback(
    (textOrNames: string | string[], sender?: "Lira" | "Rhythm" | "Rohan" | "Pattern Suggestion") =>
      basket.addItems(textOrNames, sender),
    [basket]
  );

  const markAsOrdered = useCallback(
    (id: string, orderedBy: "Rohan" | "Lira" = "Rohan") => basket.markAsOrdered(id, orderedBy),
    [basket]
  );

  const undoOrdered = useCallback((id: string) => basket.undoOrdered(id), [basket]);

  const removeItem = useCallback((id: string) => basket.removeItem(id), [basket]);

  const toggleDone = useCallback((id: string) => basket.toggleDone(id), [basket]);

  const clearCompleted = useCallback(() => basket.clearCompleted(), [basket]);

  const handoff = useCallback(() => basket.handoff(), [basket]);

  const placeOrder = useCallback(
    (actor: "Lira" | "Rhythm" | "Rohan") => basket.placeOrder(actor),
    [basket]
  );

  const acknowledgeNotification = useCallback(
    (id: string) => basket.acknowledgeNotification(id),
    [basket]
  );

  const requestNotificationPermission = useCallback(
    () => basket.requestNotificationPermission(),
    [basket]
  );

  return {
    ...snapshot,
    addItems,
    markAsOrdered,
    undoOrdered,
    removeItem,
    toggleDone,
    clearCompleted,
    handoff,
    placeOrder,
    acknowledgeNotification,
    requestNotificationPermission
  };
}
