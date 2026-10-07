"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  OrderJournal,
  SupabaseOrderStore
} from "./orderJournal";
import { HouseholdOrder, OrderStatus, OrderItemStatus } from "./orderLifecycle";
import { GroceryItem } from "./patterns";

export function useOrderJournal() {
  const journalRef = useRef<OrderJournal | null>(null);
  if (!journalRef.current) {
    journalRef.current = new OrderJournal(new SupabaseOrderStore());
  }
  const journal = journalRef.current;
  const [orders, setOrders] = useState<HouseholdOrder[]>(() => journal.listOrders());

  useEffect(() => {
    let cachedOrders: HouseholdOrder[] | undefined;
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem("household_orders_cache");
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed) && parsed.length > 0) cachedOrders = parsed;
        }
      } catch {}
    }

    const unsub = journal.subscribe((list) => {
      setOrders(list);
    });

    journal.initialize(cachedOrders);

    return () => {
      unsub();
    };
  }, [journal]);

  const recordItem = useCallback(
    (item: GroceryItem, orderedBy: string = "Rohan") => journal.recordItem(item, orderedBy),
    [journal]
  );

  const updateStatus = useCallback(
    (orderId: string, status: OrderStatus) => journal.updateStatus(orderId, status),
    [journal]
  );

  const updateItemOutcome = useCallback(
    (orderId: string, lineItemIdOrCanonical: string, outcome: OrderItemStatus) =>
      journal.updateItemOutcome(orderId, lineItemIdOrCanonical, outcome),
    [journal]
  );

  const activeOrders = orders.filter((o) => o.status === "ORDER_PLACED");

  return {
    orders,
    activeOrders,
    recordItem,
    updateStatus,
    updateItemOutcome
  };
}
