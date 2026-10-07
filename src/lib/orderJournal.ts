import { GroceryItem } from "./patterns";
import {
  HouseholdOrder,
  OrderStatus,
  OrderItemStatus,
  OrderLineItem,
  updateOrderStatus,
  updateOrderItemOutcome,
  recordItemToOrders,
  computeOrderStatus
} from "./orderLifecycle";
import { itemCatalog } from "./itemCatalog";
import {
  supabase,
  saveHouseholdOrder,
  fetchHouseholdOrders
} from "./supabase";

export interface OrderStore {
  fetchOrders(): Promise<HouseholdOrder[]>;
  saveOrder(order: HouseholdOrder): Promise<boolean>;
  subscribe(
    onOrderChange: (
      type: "INSERT" | "UPDATE" | "DELETE",
      order: HouseholdOrder | { orderId: string }
    ) => void
  ): () => void;
}

/**
 * Production Supabase + LocalStorage adapter.
 * Encapsulates offline caching fallback and multi-device realtime synchronization.
 */
export class SupabaseOrderStore implements OrderStore {
  async fetchOrders(): Promise<HouseholdOrder[]> {
    const dbOrders = await fetchHouseholdOrders();
    if (dbOrders && dbOrders.length > 0) {
      if (typeof window !== "undefined") {
        try {
          localStorage.setItem(
            "household_orders_cache",
            JSON.stringify(dbOrders.slice(0, 100))
          );
        } catch {}
      }
      return dbOrders;
    }

    // Fallback to local storage cache if Supabase is offline/empty
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem("household_orders_cache");
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed) && parsed.length > 0) return parsed;
        }
      } catch {}
    }

    return itemCatalog.getDefaultHistoricalOrders();
  }

  async saveOrder(order: HouseholdOrder): Promise<boolean> {
    const success = await saveHouseholdOrder(order);
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem("household_orders_cache");
        let list: HouseholdOrder[] = saved ? JSON.parse(saved) : [];
        if (!Array.isArray(list)) list = [];
        const idx = list.findIndex((o) => o.orderId === order.orderId);
        if (idx >= 0) {
          list[idx] = order;
        } else {
          list.unshift(order);
        }
        localStorage.setItem("household_orders_cache", JSON.stringify(list.slice(0, 100)));
      } catch {}
    }
    return success;
  }

  subscribe(
    onOrderChange: (
      type: "INSERT" | "UPDATE" | "DELETE",
      order: HouseholdOrder | { orderId: string }
    ) => void
  ): () => void {
    const channel = supabase
      .channel("household-orders-sync")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "household_orders" },
        (payload) => {
          if (payload.eventType === "INSERT" || payload.eventType === "UPDATE") {
            const incoming = itemCatalog.normalizeRawOrder(payload.new);
            onOrderChange(payload.eventType, incoming);
          } else if (payload.eventType === "DELETE") {
            const oldId =
              (payload.old as { order_id?: string; id?: string }).order_id ||
              (payload.old as any).id;
            if (oldId) {
              onOrderChange("DELETE", { orderId: oldId });
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }
}

/**
 * In-memory adapter for deterministic zero-IO unit testing.
 */
export class InMemoryOrderStore implements OrderStore {
  private orders: Map<string, HouseholdOrder> = new Map();
  private listeners: Array<
    (type: "INSERT" | "UPDATE" | "DELETE", order: HouseholdOrder | { orderId: string }) => void
  > = [];

  constructor(initialOrders: HouseholdOrder[] = []) {
    for (const ord of initialOrders) {
      this.orders.set(ord.orderId, { ...ord });
    }
  }

  async fetchOrders(): Promise<HouseholdOrder[]> {
    return Array.from(this.orders.values());
  }

  async saveOrder(order: HouseholdOrder): Promise<boolean> {
    const exists = this.orders.has(order.orderId);
    this.orders.set(order.orderId, { ...order });
    const evt = exists ? "UPDATE" : "INSERT";
    for (const l of this.listeners) l(evt, order);
    return true;
  }

  subscribe(
    onOrderChange: (
      type: "INSERT" | "UPDATE" | "DELETE",
      order: HouseholdOrder | { orderId: string }
    ) => void
  ): () => void {
    this.listeners.push(onOrderChange);
    return () => {
      this.listeners = this.listeners.filter((x) => x !== onOrderChange);
    };
  }
}

/**
 * Deep OrderJournal Module.
 *
 * Encapsulates:
 * - 30-minute smart grouping window logic
 * - Order line-item outcome transitions and parent status reconciliation
 * - Dual-layer persistence (Supabase + localStorage cache)
 * - Realtime multi-device order updates
 */
export class OrderJournal {
  private orders: HouseholdOrder[] = [];
  private store: OrderStore;
  private subscribers: Array<(orders: HouseholdOrder[]) => void> = [];
  private unsubscribeStore: (() => void) | null = null;
  private timeProvider: () => number;
  private windowMs: number;

  constructor(
    store: OrderStore = new SupabaseOrderStore(),
    options?: {
      initialOrders?: HouseholdOrder[];
      timeProvider?: () => number;
      windowMs?: number;
    }
  ) {
    this.store = store;
    this.timeProvider = options?.timeProvider || (() => Date.now());
    this.windowMs = options?.windowMs ?? 30 * 60 * 1000;
    if (options?.initialOrders) {
      this.orders = [...options.initialOrders];
    }
  }

  async initialize(cachedOrders?: HouseholdOrder[]): Promise<void> {
    if (cachedOrders && cachedOrders.length > 0) {
      this.orders = [...cachedOrders];
    } else if (this.orders.length === 0) {
      this.orders = itemCatalog.getDefaultHistoricalOrders();
    }

    if (!this.unsubscribeStore) {
      this.unsubscribeStore = this.store.subscribe((type, orderOrId) => {
        this.handleStoreOrderChange(type, orderOrId);
      });
    }

    const fetched = await this.store.fetchOrders().catch(() => []);
    if (fetched && fetched.length > 0) {
      const dbIds = new Set(fetched.map((o) => o.orderId));
      const merged = [...fetched];
      for (const p of this.orders) {
        if (!dbIds.has(p.orderId)) {
          merged.push(p);
        }
      }
      this.orders = merged;
      this.notifySubscribers();
    }
  }

  destroy(): void {
    if (this.unsubscribeStore) {
      this.unsubscribeStore();
      this.unsubscribeStore = null;
    }
    this.subscribers = [];
  }

  // --- Queries ---

  listOrders(): HouseholdOrder[] {
    return [...this.orders];
  }

  getActiveOrders(): HouseholdOrder[] {
    return this.orders.filter((o) => o.status === "ORDER_PLACED");
  }

  subscribe(listener: (orders: HouseholdOrder[]) => void): () => void {
    this.subscribers.push(listener);
    listener(this.listOrders());
    return () => {
      this.subscribers = this.subscribers.filter((s) => s !== listener);
    };
  }

  // --- Commands / Domain Intents ---

  /**
   * Records an ordered grocery item, automatically grouping into an existing order
   * if placed within the 30-minute window, or starting a new order record.
   */
  async recordItem(
    item: GroceryItem,
    orderedBy: string = "Rohan"
  ): Promise<{ order: HouseholdOrder; wasGrouped: boolean }> {
    const { updatedOrders, modifiedOrder } = recordItemToOrders(
      this.orders,
      item,
      orderedBy,
      this.windowMs,
      this.timeProvider()
    );

    const wasGrouped = this.orders.some((o) => o.orderId === modifiedOrder.orderId);
    this.orders = updatedOrders;
    this.notifySubscribers();

    // Persist
    await this.store.saveOrder(modifiedOrder);

    return { order: modifiedOrder, wasGrouped };
  }

  /**
   * Updates an order's status (ORDER_PLACED, DELIVERED, CANCELLED).
   */
  async updateStatus(orderId: string, status: OrderStatus): Promise<void> {
    const target = this.orders.find((o) => o.orderId === orderId);
    if (!target) return;

    const updated = updateOrderStatus(target, status);
    this.orders = this.orders.map((o) => (o.orderId === orderId ? updated : o));
    this.notifySubscribers();

    await this.store.saveOrder(updated);
  }

  /**
   * Updates an individual line item's outcome and recomputes the parent order status.
   */
  async updateItemOutcome(
    orderId: string,
    lineItemIdOrCanonical: string,
    outcome: OrderItemStatus
  ): Promise<void> {
    const target = this.orders.find((o) => o.orderId === orderId);
    if (!target) return;

    const updated = updateOrderItemOutcome(target, lineItemIdOrCanonical, outcome);
    this.orders = this.orders.map((o) => (o.orderId === orderId ? updated : o));
    this.notifySubscribers();

    await this.store.saveOrder(updated);
  }

  // --- Internal event handling ---

  private handleStoreOrderChange(
    type: "INSERT" | "UPDATE" | "DELETE",
    orderOrId: HouseholdOrder | { orderId: string }
  ): void {
    if (type === "DELETE") {
      const targetId = (orderOrId as { orderId: string }).orderId;
      this.orders = this.orders.filter((o) => o.orderId !== targetId);
    } else {
      const incoming = orderOrId as HouseholdOrder;
      const idx = this.orders.findIndex((o) => o.orderId === incoming.orderId);
      if (idx >= 0) {
        const copy = [...this.orders];
        copy[idx] = incoming;
        this.orders = copy;
      } else {
        this.orders = [incoming, ...this.orders];
      }
    }
    this.notifySubscribers();
  }

  private notifySubscribers(): void {
    const snap = this.listOrders();
    for (const s of this.subscribers) {
      s(snap);
    }
  }
}
