import { GroceryItem, detectCategory, parseNaturalLanguageList } from "./patterns";
import {
  BasketHandoffState,
  BasketStatus,
  initHandoffState,
  registerBasketActivity,
  liraCompleteAndHandoff,
  canPlaceOrder,
  executePlaceOrder,
  resetBasketState,
  LIRA_HANDOFF_MESSAGE
} from "./handoff";
import {
  HandoffNotification,
  estimateBasketValue,
  evaluateHandoffNotification,
  formatNotificationPreview
} from "./handoffNotification";
import {
  NotificationPermissionStatus,
  getBrowserNotificationPermission,
  requestNotificationPermission,
  sendBrowserHandoffNotification
} from "./pushNotifications";
import {
  supabase,
  HANDOFF_RECORD_ID,
  DbGroceryItem,
  toGroceryItem,
  toDbItem,
  fetchGroceryItems,
  fetchHandoffStateDb,
  saveHandoffStateDb,
  upsertGroceryItem,
  deleteGroceryItemDb,
  clearCompletedItemsDb,
  archiveCompletedRun
} from "./supabase";

export interface BasketSnapshot {
  items: GroceryItem[];
  pendingItems: GroceryItem[];
  basketItems: GroceryItem[];
  recentlyOrderedItems: GroceryItem[];
  completedItems: GroceryItem[];
  handoffState: BasketHandoffState;
  activeNotification: HandoffNotification | null;
  notificationPermission: NotificationPermissionStatus;
  isCloudSynced: boolean;
}

export interface BasketStore {
  fetchItems(): Promise<GroceryItem[]>;
  fetchHandoffState(): Promise<BasketHandoffState | null>;
  saveItem(item: GroceryItem): Promise<void>;
  deleteItem(id: string): Promise<void>;
  clearCompleted(): Promise<void>;
  archiveCompleted(items: GroceryItem[]): Promise<void>;
  saveHandoffState(state: BasketHandoffState): Promise<void>;
  subscribe(
    onItemChange: (type: "INSERT" | "UPDATE" | "DELETE", item: GroceryItem | { id: string }) => void,
    onHandoffChange: (state: BasketHandoffState) => void
  ): () => void;
}

export interface NotificationAdapter {
  getPermission(): NotificationPermissionStatus;
  requestPermission(): Promise<NotificationPermissionStatus>;
  sendNotification(options: {
    itemCount: number;
    estimatedValue: number | null;
    onOpenBasket?: () => void;
  }): boolean;
}

export function isWithin24Hours(isoStringOrDate?: string): boolean {
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

/**
 * Production Supabase implementation of BasketStore.
 * Hides all notes JSON serialization, magic record ids, and raw Supabase channels.
 */
export class SupabaseBasketStore implements BasketStore {
  async fetchItems(): Promise<GroceryItem[]> {
    return fetchGroceryItems();
  }

  async fetchHandoffState(): Promise<BasketHandoffState | null> {
    return fetchHandoffStateDb();
  }

  async saveItem(item: GroceryItem): Promise<void> {
    await upsertGroceryItem(item);
  }

  async deleteItem(id: string): Promise<void> {
    await deleteGroceryItemDb(id);
  }

  async clearCompleted(): Promise<void> {
    await clearCompletedItemsDb();
  }

  async archiveCompleted(items: GroceryItem[]): Promise<void> {
    await archiveCompletedRun(items);
  }

  async saveHandoffState(state: BasketHandoffState): Promise<void> {
    await saveHandoffStateDb(state);
  }

  subscribe(
    onItemChange: (type: "INSERT" | "UPDATE" | "DELETE", item: GroceryItem | { id: string }) => void,
    onHandoffChange: (state: BasketHandoffState) => void
  ): () => void {
    const channel = supabase
      .channel("household-basket-sync")
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
                    onHandoffChange(parsed);
                  }
                } catch {}
              }
              return;
            }
            const item = toGroceryItem(raw);
            onItemChange(payload.eventType, item);
          } else if (payload.eventType === "DELETE") {
            const oldId = (payload.old as { id: string }).id;
            if (oldId === HANDOFF_RECORD_ID) return;
            onItemChange("DELETE", { id: oldId });
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
 * In-memory implementation of BasketStore for deterministic testing.
 * Runs completely isolated without network or database dependencies.
 */
export class InMemoryBasketStore implements BasketStore {
  private items: Map<string, GroceryItem> = new Map();
  private handoffState: BasketHandoffState = initHandoffState(0);
  private listeners: Array<{
    onItemChange: (type: "INSERT" | "UPDATE" | "DELETE", item: GroceryItem | { id: string }) => void;
    onHandoffChange: (state: BasketHandoffState) => void;
  }> = [];

  constructor(initialItems: GroceryItem[] = [], initialHandoff?: BasketHandoffState) {
    for (const it of initialItems) {
      this.items.set(it.id, { ...it });
    }
    if (initialHandoff) {
      this.handoffState = { ...initialHandoff };
    }
  }

  async fetchItems(): Promise<GroceryItem[]> {
    return Array.from(this.items.values());
  }

  async fetchHandoffState(): Promise<BasketHandoffState | null> {
    return { ...this.handoffState };
  }

  async saveItem(item: GroceryItem): Promise<void> {
    const exists = this.items.has(item.id);
    this.items.set(item.id, { ...item });
    const evt = exists ? "UPDATE" : "INSERT";
    for (const l of this.listeners) l.onItemChange(evt, item);
  }

  async deleteItem(id: string): Promise<void> {
    this.items.delete(id);
    for (const l of this.listeners) l.onItemChange("DELETE", { id });
  }

  async clearCompleted(): Promise<void> {
    for (const [id, it] of this.items.entries()) {
      if (it.isDone) {
        this.items.delete(id);
        for (const l of this.listeners) l.onItemChange("DELETE", { id });
      }
    }
  }

  async archiveCompleted(items: GroceryItem[]): Promise<void> {
    await this.clearCompleted();
  }

  async saveHandoffState(state: BasketHandoffState): Promise<void> {
    this.handoffState = { ...state };
    for (const l of this.listeners) l.onHandoffChange(this.handoffState);
  }

  subscribe(
    onItemChange: (type: "INSERT" | "UPDATE" | "DELETE", item: GroceryItem | { id: string }) => void,
    onHandoffChange: (state: BasketHandoffState) => void
  ): () => void {
    const entry = { onItemChange, onHandoffChange };
    this.listeners.push(entry);
    return () => {
      this.listeners = this.listeners.filter((x) => x !== entry);
    };
  }
}

export class BrowserNotificationAdapter implements NotificationAdapter {
  getPermission(): NotificationPermissionStatus {
    return getBrowserNotificationPermission();
  }

  async requestPermission(): Promise<NotificationPermissionStatus> {
    return requestNotificationPermission();
  }

  sendNotification(options: {
    itemCount: number;
    estimatedValue: number | null;
    onOpenBasket?: () => void;
  }): boolean {
    return sendBrowserHandoffNotification(options);
  }
}

export class NoopNotificationAdapter implements NotificationAdapter {
  private permission: NotificationPermissionStatus = "default";
  public sentCount: number = 0;

  constructor(permission: NotificationPermissionStatus = "granted") {
    this.permission = permission;
  }

  getPermission(): NotificationPermissionStatus {
    return this.permission;
  }

  async requestPermission(): Promise<NotificationPermissionStatus> {
    this.permission = "granted";
    return this.permission;
  }

  sendNotification(): boolean {
    this.sentCount++;
    return true;
  }
}

/**
 * Deep HouseholdBasket domain module.
 *
 * Encapsulates:
 * - Basket items lifecycle & 24h retention
 * - Gated Lira/Rhythm handoff state machine
 * - Invariant validation (actor restrictions, empty basket guards)
 * - Automatic valuation and browser push alert triggering
 * - Supabase persistence and live synchronization
 */
export class HouseholdBasket {
  private items: GroceryItem[] = [];
  private handoffState: BasketHandoffState = initHandoffState(0);
  private acknowledgedNotificationIds: Set<string> = new Set();
  private isCloudSynced: boolean = false;
  private store: BasketStore;
  private notifications: NotificationAdapter;
  private subscribers: Array<(snapshot: BasketSnapshot) => void> = [];
  private unsubscribeStore: (() => void) | null = null;

  constructor(
    store: BasketStore = new SupabaseBasketStore(),
    notifications: NotificationAdapter = new BrowserNotificationAdapter()
  ) {
    this.store = store;
    this.notifications = notifications;
  }

  /**
   * Initializes the basket with optional cached items and handoff state,
   * then connects to the store and real-time subscription.
   */
  async initialize(cachedItems?: GroceryItem[], cachedHandoff?: BasketHandoffState): Promise<void> {
    if (cachedItems && cachedItems.length > 0) {
      this.items = [...cachedItems];
    }
    if (cachedHandoff) {
      this.handoffState = { ...cachedHandoff };
    }

    // Connect real-time subscription
    if (!this.unsubscribeStore) {
      this.unsubscribeStore = this.store.subscribe(
        (type, itemOrId) => this.handleStoreItemChange(type, itemOrId),
        (incomingHandoff) => this.handleStoreHandoffChange(incomingHandoff)
      );
    }

    // Fetch initial fresh data
    const [freshItems, freshHandoff] = await Promise.all([
      this.store.fetchItems().catch(() => [] as GroceryItem[]),
      this.store.fetchHandoffState().catch(() => null)
    ]);

    if (freshItems && freshItems.length > 0) {
      this.items = freshItems;
    }
    if (freshHandoff && freshHandoff.status) {
      this.handoffState = freshHandoff;
    }

    this.isCloudSynced = true;
    this.notifySubscribers();
  }

  destroy(): void {
    if (this.unsubscribeStore) {
      this.unsubscribeStore();
      this.unsubscribeStore = null;
    }
    this.subscribers = [];
  }

  // --- Queries ---

  getSnapshot(): BasketSnapshot {
    const pendingItems = this.items.filter((it) => !it.isDone && !it.isOrdered);
    const basketItems = this.items.filter((it) => {
      if (it.isDone) return false;
      if (!it.isOrdered) return true;
      return isWithin24Hours(it.orderedAt);
    });
    const recentlyOrderedItems = this.items.filter(
      (it) => !it.isDone && it.isOrdered && isWithin24Hours(it.orderedAt)
    );
    const completedItems = this.items.filter((it) => it.isDone);

    const activeNotification = evaluateHandoffNotification(
      this.handoffState,
      pendingItems,
      this.acknowledgedNotificationIds
    );

    return {
      items: [...this.items],
      pendingItems,
      basketItems,
      recentlyOrderedItems,
      completedItems,
      handoffState: { ...this.handoffState },
      activeNotification,
      notificationPermission: this.notifications.getPermission(),
      isCloudSynced: this.isCloudSynced
    };
  }

  subscribe(listener: (snapshot: BasketSnapshot) => void): () => void {
    this.subscribers.push(listener);
    listener(this.getSnapshot());
    return () => {
      this.subscribers = this.subscribers.filter((s) => s !== listener);
    };
  }

  // --- Commands / Domain Intents ---

  /**
   * Adds one or more items (from text or direct name) to the basket.
   */
  async addItems(
    textOrNames: string | string[],
    addedBy: "Lira" | "Rhythm" | "Rohan" | "Pattern Suggestion" = "Lira"
  ): Promise<GroceryItem[]> {
    const names = Array.isArray(textOrNames)
      ? textOrNames
      : parseNaturalLanguageList(textOrNames);

    if (names.length === 0) return [];

    const nowIso = new Date().toISOString();
    const created: GroceryItem[] = [];

    for (let idx = 0; idx < names.length; idx++) {
      const name = names[idx];
      const trimmed = name.trim();
      if (!trimmed) continue;

      // Deduplicate against active items
      const isDuplicate = this.items.some(
        (it) => !it.isDone && it.name.toLowerCase().trim() === trimmed.toLowerCase()
      );
      if (isDuplicate) continue;

      const item: GroceryItem = {
        id: `item-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 6)}`,
        name: trimmed,
        category: detectCategory(trimmed),
        addedBy,
        addedAt: nowIso,
        createdAt: nowIso,
        isDone: false
      };
      created.push(item);
    }

    if (created.length === 0) return [];

    this.items = [...created, ...this.items];
    const pendingCount = this.items.filter((it) => !it.isDone && !it.isOrdered).length;
    this.handoffState = registerBasketActivity(this.handoffState, pendingCount);

    this.notifySubscribers();

    // Persist
    await Promise.all([
      ...created.map((it) => this.store.saveItem(it)),
      this.store.saveHandoffState(this.handoffState)
    ]);

    return created;
  }

  /**
   * Marks an item as ordered directly from the live list.
   * Remains visible with strikethrough for 24h.
   */
  async markAsOrdered(
    id: string,
    orderedBy: "Rohan" | "Lira" = "Rohan"
  ): Promise<GroceryItem | null> {
    const target = this.items.find((it) => it.id === id);
    if (!target) return null;

    const nowIso = new Date().toISOString();
    const updated: GroceryItem = {
      ...target,
      isOrdered: true,
      orderedAt: nowIso,
      orderedBy
    };

    this.items = this.items.map((it) => (it.id === id ? updated : it));
    const pendingCount = this.items.filter((it) => !it.isDone && !it.isOrdered).length;
    this.handoffState = registerBasketActivity(this.handoffState, pendingCount);

    this.notifySubscribers();

    await Promise.all([
      this.store.saveItem(updated),
      this.store.saveHandoffState(this.handoffState)
    ]);

    return updated;
  }

  /**
   * Restores an ordered item back to pending.
   */
  async undoOrdered(id: string): Promise<GroceryItem | null> {
    const target = this.items.find((it) => it.id === id);
    if (!target) return null;

    const updated: GroceryItem = {
      ...target,
      isOrdered: false,
      orderedAt: undefined,
      orderedBy: undefined
    };

    this.items = this.items.map((it) => (it.id === id ? updated : it));
    const pendingCount = this.items.filter((it) => !it.isDone && !it.isOrdered).length;
    this.handoffState = registerBasketActivity(this.handoffState, pendingCount);

    this.notifySubscribers();

    await Promise.all([
      this.store.saveItem(updated),
      this.store.saveHandoffState(this.handoffState)
    ]);

    return updated;
  }

  /**
   * Removes an item from the basket.
   */
  async removeItem(id: string): Promise<void> {
    this.items = this.items.filter((it) => it.id !== id);
    const pendingCount = this.items.filter((it) => !it.isDone && !it.isOrdered).length;
    this.handoffState = registerBasketActivity(this.handoffState, pendingCount);

    this.notifySubscribers();

    await Promise.all([
      this.store.deleteItem(id),
      this.store.saveHandoffState(this.handoffState)
    ]);
  }

  /**
   * Toggles item done/bought status.
   */
  async toggleDone(id: string): Promise<GroceryItem | null> {
    const target = this.items.find((it) => it.id === id);
    if (!target) return null;

    const willBeDone = !target.isDone;
    const updated: GroceryItem = {
      ...target,
      isDone: willBeDone,
      purchasedAt: willBeDone ? new Date().toISOString() : undefined
    };

    this.items = this.items.map((it) => (it.id === id ? updated : it));
    const pendingCount = this.items.filter((it) => !it.isDone && !it.isOrdered).length;
    this.handoffState = registerBasketActivity(this.handoffState, pendingCount);

    this.notifySubscribers();

    await Promise.all([
      this.store.saveItem(updated),
      this.store.saveHandoffState(this.handoffState)
    ]);

    return updated;
  }

  /**
   * Clears and archives completed items.
   */
  async clearCompleted(): Promise<void> {
    const completed = this.items.filter((it) => it.isDone);
    if (completed.length === 0) return;

    this.items = this.items.filter((it) => !it.isDone);
    this.notifySubscribers();

    await this.store.archiveCompleted(completed);
  }

  /**
   * Lira hands off the basket to Rohan for ordering.
   * Validates non-empty basket, sets ready_for_order, evaluates valuation,
   * and triggers browser notification if permitted.
   */
  async handoff(): Promise<void> {
    const pending = this.items.filter((it) => !it.isDone && !it.isOrdered);
    if (pending.length === 0) {
      throw new Error("Cannot hand off an empty basket. Please add items first.");
    }

    this.handoffState = liraCompleteAndHandoff(this.handoffState, pending.length);
    const estimatedValue = estimateBasketValue(pending);

    // Trigger browser notification
    this.notifications.sendNotification({
      itemCount: pending.length,
      estimatedValue
    });

    this.notifySubscribers();
    await this.store.saveHandoffState(this.handoffState);
  }

  /**
   * Places the order (Rohan only). Enforces all gate invariants.
   */
  async placeOrder(actor: "Lira" | "Rhythm" | "Rohan"): Promise<void> {
    const pending = this.items.filter((it) => !it.isDone && !it.isOrdered);
    const result = executePlaceOrder(this.handoffState, actor, pending.length);

    if (!result.success) {
      throw new Error(result.error || "Cannot place order.");
    }

    this.handoffState = result.nextState;
    this.notifySubscribers();
    await this.store.saveHandoffState(this.handoffState);
  }

  /**
   * Acknowledges / dismisses a handoff notification.
   */
  acknowledgeNotification(id: string): void {
    this.acknowledgedNotificationIds.add(id);
    this.notifySubscribers();
  }

  /**
   * Requests browser notification permission.
   */
  async requestNotificationPermission(): Promise<NotificationPermissionStatus> {
    const perm = await this.notifications.requestPermission();
    this.notifySubscribers();
    return perm;
  }

  // --- Internal event handlers ---

  private handleStoreItemChange(
    type: "INSERT" | "UPDATE" | "DELETE",
    itemOrId: GroceryItem | { id: string }
  ): void {
    if (type === "DELETE") {
      this.items = this.items.filter((x) => x.id !== itemOrId.id);
    } else {
      const incoming = itemOrId as GroceryItem;
      const exists = this.items.some((x) => x.id === incoming.id);
      if (exists) {
        this.items = this.items.map((x) => (x.id === incoming.id ? incoming : x));
      } else {
        this.items = [incoming, ...this.items];
      }
    }
    this.notifySubscribers();
  }

  private handleStoreHandoffChange(incomingHandoff: BasketHandoffState): void {
    if (incomingHandoff && incomingHandoff.status) {
      this.handoffState = incomingHandoff;
      this.notifySubscribers();
    }
  }

  private notifySubscribers(): void {
    const snapshot = this.getSnapshot();
    for (const listener of this.subscribers) {
      listener(snapshot);
    }
  }
}
