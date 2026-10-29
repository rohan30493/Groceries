import { GroceryItem, detectCategory, CATEGORY_ICONS } from "./patterns";
import { estimateBasketValue } from "./handoffNotification";

/**
 * "Email Rohan the cart" feature.
 *
 * The basket header button asks the server (POST /api/email-cart) to send
 * the current pending cart to Rohan. The email is built here from the
 * server's own read of the cart - never from client-supplied content - and
 * the recipient comes from the server's EMAIL_TO environment variable, so
 * the feature can only ever send the real cart to the configured address.
 */

const CATEGORY_ORDER = [
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
  "Other Items",
];

export interface CartEmailContent {
  recipient: string;
  subject: string;
  body: string;
}

function getPendingCartItems(items: GroceryItem[]): GroceryItem[] {
  return items.filter((it) => !it.isDone && !it.isOrdered);
}

function groupByCategory(
  items: GroceryItem[]
): Array<{ category: string; icon: string; items: GroceryItem[] }> {
  const categoryMap: Record<string, GroceryItem[]> = {};
  items.forEach((it) => {
    const detected = detectCategory(it.name);
    const cat =
      !it.category ||
      it.category === "Other Items" ||
      detected !== "Other Items"
        ? detected
        : it.category;
    if (!categoryMap[cat]) categoryMap[cat] = [];
    categoryMap[cat].push({ ...it, category: cat });
  });

  const sortedCats = Object.keys(categoryMap).sort((a, b) => {
    const idxA = CATEGORY_ORDER.indexOf(a);
    const idxB = CATEGORY_ORDER.indexOf(b);
    if (idxA !== -1 && idxB !== -1) return idxA - idxB;
    if (idxA !== -1) return -1;
    if (idxB !== -1) return 1;
    return a.localeCompare(b);
  });

  return sortedCats.map((cat) => ({
    category: cat,
    icon: CATEGORY_ICONS[cat] || "🛒",
    items: [...categoryMap[cat]].sort((a, b) =>
      (a.name || "").localeCompare(b.name || "")
    ),
  }));
}

function formatSubjectDate(now: Date): string {
  return now.toLocaleDateString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "numeric",
    month: "short",
  });
}

function buildDetailedBody(
  pending: GroceryItem[],
  estimatedValue: number | null
): string {
  const sections = groupByCategory(pending)
    .map((group) => {
      const lines = group.items.map((it) => `  - ${it.name}`).join("\n");
      return `${group.icon} ${group.category}\n${lines}`;
    })
    .join("\n\n");

  const estimateLine = estimatedValue
    ? `\n\nEstimated total: ~Rs ${estimatedValue}`
    : "";

  return `Grocery cart is ready - ${pending.length} ${
    pending.length === 1 ? "item" : "items"
  } to order.\n\n${sections}${estimateLine}\n\nSent from the Household Groceries app`;
}

/**
 * Builds the email content for the current cart, or null when there is
 * nothing pending to send (or no usable recipient). The body always
 * carries the complete cart details - the list is never truncated.
 * Pure and injectable for tests.
 */
export function buildCartEmail(
  items: GroceryItem[],
  recipient: string,
  now: Date = new Date()
): CartEmailContent | null {
  const pending = getPendingCartItems(items);
  if (pending.length === 0 || !recipient || !recipient.includes("@")) {
    return null;
  }

  const subject = `Grocery cart ready - ${pending.length} ${
    pending.length === 1 ? "item" : "items"
  } (${formatSubjectDate(now)})`;

  const estimatedValue = estimateBasketValue(pending);
  return {
    recipient,
    subject,
    body: buildDetailedBody(pending, estimatedValue),
  };
}

export interface EmailCartState {
  lastSentAt: string | null;
  lastHash: string | null;
}

/**
 * Stable identity for "what is currently pending", used to dedupe repeat
 * sends of an unchanged cart. Only pending items count; order-independent.
 */
export function computeCartHash(items: GroceryItem[]): string {
  const keys = getPendingCartItems(items)
    .map((it) => `${it.id}:${it.name}`)
    .sort();
  // FNV-1a 32-bit - small, dependency-free, fine as a dedupe key.
  let hash = 0x811c9dc5;
  const str = keys.join("|");
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16);
}

export const EMAIL_CART_DEDUPE_WINDOW_MS = 15 * 60_000;

/**
 * True when the same cart content was already sent within the dedupe
 * window, so a repeat click does not spam an identical email. New or
 * changed items produce a new hash and always send.
 */
export function shouldSkipDuplicateSend(
  state: EmailCartState | null,
  hash: string,
  nowMs: number,
  windowMs: number = EMAIL_CART_DEDUPE_WINDOW_MS
): boolean {
  if (!state || !state.lastSentAt || !state.lastHash) return false;
  if (state.lastHash !== hash) return false;
  const lastMs = Date.parse(state.lastSentAt);
  if (Number.isNaN(lastMs)) return false;
  return nowMs - lastMs < windowMs;
}

export const EMAIL_CART_MUTEX_TTL_MS = 5 * 60_000;

export interface CartEmailSendDeps {
  recipient: string;
  now: () => number;
  fetchState: () => Promise<EmailCartState | null>;
  claimLock: (
    expected: EmailCartState | null,
    acquired: EmailCartState
  ) => Promise<boolean>;
  releaseLock: (
    acquired: EmailCartState,
    restore: EmailCartState | null
  ) => Promise<void>;
  loadItems: () => Promise<GroceryItem[]>;
  send: (email: CartEmailContent) => Promise<void>;
}

export type CartEmailSendResult =
  | { kind: "sent" }
  | { kind: "no-pending" }
  | { kind: "duplicate" }
  | { kind: "in-progress" };

/**
 * Orchestrates one button-triggered send. There is no time-based global
 * cooldown; abuse posture for this public endpoint is:
 * 1. The Supabase sentinel row is a short-lived in-flight mutex (best
 *    effort, not a hardened global rate bound): overlapping clicks cannot
 *    double-send, and a fresh state row blocks re-sends for its TTL.
 * 2. A recent identical cart (same pending-content hash inside the dedupe
 *    window) is skipped so repeat clicks do not spam the same email; new
 *    or changed items always send.
 * The recipient is fixed server-side and the cart is re-read server-side.
 */
export async function executeCartEmailSend(
  deps: CartEmailSendDeps
): Promise<CartEmailSendResult> {
  const state = await deps.fetchState();
  const nowMs = deps.now();
  if (state?.lastSentAt) {
    const stateMs = Date.parse(state.lastSentAt);
    if (!Number.isNaN(stateMs) && nowMs - stateMs < EMAIL_CART_MUTEX_TTL_MS) {
      return { kind: "in-progress" };
    }
  }

  const acquired: EmailCartState = {
    lastSentAt: new Date(nowMs).toISOString(),
    lastHash: "__send_lock__",
  };
  const won = await deps.claimLock(state, acquired);
  if (!won) {
    return { kind: "in-progress" };
  }

  try {
    const items = await deps.loadItems();
    const email = buildCartEmail(items, deps.recipient, new Date(nowMs));
    if (!email) {
      await safeRelease(deps, acquired, state);
      return { kind: "no-pending" };
    }
    const hash = computeCartHash(items);
    if (shouldSkipDuplicateSend(state, hash, nowMs)) {
      await safeRelease(deps, acquired, state);
      return { kind: "duplicate" };
    }
    await deps.send(email);
    // Record the sent cart's hash as the dedupe anchor; the fresh
    // timestamp also holds the in-flight grace window for its TTL.
    await safeRelease(deps, acquired, {
      lastSentAt: new Date(nowMs).toISOString(),
      lastHash: hash,
    });
    return { kind: "sent" };
  } catch (err) {
    await safeRelease(deps, acquired, state);
    throw err;
  }
}

async function safeRelease(
  deps: CartEmailSendDeps,
  acquired: EmailCartState,
  restore: EmailCartState | null
): Promise<void> {
  try {
    await deps.releaseLock(acquired, restore);
  } catch {
    // a stale lock expires by TTL
  }
}
