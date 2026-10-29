import { ImapFlow } from "imapflow";
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

export const EMAIL_CART_COOLDOWN_MS = 60 * 60_000;

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

/**
 * Best-effort rate limit for the public send endpoint: true when a send
 * happened within the minimum interval. Serverless instances each track
 * their own last-send time, so this throttles bursts rather than acting
 * as a hard global limit.
 */
export function isEmailCartRateLimited(
  lastSentAtMs: number,
  nowMs: number,
  minIntervalMs: number = EMAIL_CART_COOLDOWN_MS
): boolean {
  return nowMs - lastSentAtMs < minIntervalMs;
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

/**
 * Durable one-hour cooldown, anchored in Gmail itself: every send through
 * this feature lands in the account's Sent mail, so the most recent Sent
 * copy of this feature's fixed subject marker is the authoritative
 * last-send time. The scan is restricted to the fixed sender, fixed
 * recipient and fixed marker inside the cooldown window, and only the
 * message's internal date is read - never any mail content.
 */
export const EMAIL_CART_SUBJECT_PREFIX = "Grocery cart ready";

export interface CartCooldownStatus {
  limited: boolean;
  retryAt: Date | null;
}

export interface SentScanClient {
  connect(): Promise<void>;
  getMailboxLock(path: string): Promise<{ release: () => void }>;
  search(
    query: { to: string; from: string; subject: string; sentSince: Date },
    options: { uid: true }
  ): Promise<number[] | false | undefined>;
  fetchOne(
    uid: number,
    query: { internalDate: true },
    options: { uid: true }
  ): Promise<{ internalDate?: string | Date } | false>;
  logout(): Promise<void>;
}

export type SentScanClientFactory = (auth: {
  user: string;
  pass: string;
}) => SentScanClient;

const defaultSentScanFactory: SentScanClientFactory = (auth) =>
  new ImapFlow({
    host: "imap.gmail.com",
    port: 993,
    secure: true,
    auth,
    logger: false,
  });

/**
 * Reports whether another cart email is still inside the cooldown window,
 * based on the newest matching Sent copy. Throws on any IMAP failure so
 * callers fail closed (no send) instead of risking an uncontrolled send.
 */
export async function checkCartEmailCooldown(
  auth: { user: string; pass: string },
  recipient: string,
  now: Date = new Date(),
  cooldownMs: number = EMAIL_CART_COOLDOWN_MS,
  createClient: SentScanClientFactory = defaultSentScanFactory
): Promise<CartCooldownStatus> {
  const client = createClient(auth);
  await client.connect();
  try {
    const lock = await client.getMailboxLock("[Gmail]/Sent Mail");
    try {
      const since = new Date(now.getTime() - cooldownMs);
      const uids = await client.search(
        {
          to: recipient,
          from: auth.user,
          subject: EMAIL_CART_SUBJECT_PREFIX,
          sentSince: since,
        },
        { uid: true }
      );
      if (!uids || uids.length === 0) {
        return { limited: false, retryAt: null };
      }
      const latest = await client.fetchOne(
        uids[uids.length - 1],
        { internalDate: true },
        { uid: true }
      );
      const raw = latest ? latest.internalDate : undefined;
      const sentAt =
        raw instanceof Date
          ? raw
          : typeof raw === "string"
            ? new Date(raw)
            : null;
      if (!sentAt || Number.isNaN(sentAt.getTime())) {
        // A match exists but its date is unreadable: stay conservative.
        return { limited: true, retryAt: null };
      }
      const retryAt = new Date(sentAt.getTime() + cooldownMs);
      return retryAt.getTime() > now.getTime()
        ? { limited: true, retryAt }
        : { limited: false, retryAt: null };
    } finally {
      lock.release();
    }
  } finally {
    try {
      await client.logout();
    } catch {
      // best-effort logout; cooldown decision is already made
    }
  }
}

export const EMAIL_CART_MUTEX_TTL_MS = 5 * 60_000;

export interface CartEmailSendDeps {
  recipient: string;
  now: () => number;
  checkCooldown: () => Promise<CartCooldownStatus>;
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
  | { kind: "cooldown"; retryAt: string | null }
  | { kind: "in-progress" }
  | { kind: "unavailable" };

/**
 * Orchestrates one button-triggered send. Order matters:
 * 1. The Gmail-Sent cooldown is the durable authority; any failure reading
 *    it fails closed (no send) rather than risking an unthrottled send.
 * 2. The Supabase sentinel row is a short-lived in-flight mutex only
 *    (best effort): it stops overlapping clicks from double-sending while
 *    a fresh send is still propagating to Sent. On success the lock is
 *    HELD until its TTL as a grace window; on failure it is released so a
 *    genuine retry is possible. A wiped lock only shortens this grace
 *    window - the Gmail-Sent cooldown still applies.
 */
export async function executeCartEmailSend(
  deps: CartEmailSendDeps
): Promise<CartEmailSendResult> {
  let cooldown: CartCooldownStatus;
  try {
    cooldown = await deps.checkCooldown();
  } catch {
    return { kind: "unavailable" };
  }
  if (cooldown.limited) {
    return {
      kind: "cooldown",
      retryAt: cooldown.retryAt ? cooldown.retryAt.toISOString() : null,
    };
  }

  const state = await deps.fetchState();
  const nowMs = deps.now();
  if (state?.lastSentAt) {
    const lockMs = Date.parse(state.lastSentAt);
    if (!Number.isNaN(lockMs) && nowMs - lockMs < EMAIL_CART_MUTEX_TTL_MS) {
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
    await deps.send(email);
    // Lock intentionally held: covers the gap until the Sent copy is
    // visible to the cooldown scan.
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
