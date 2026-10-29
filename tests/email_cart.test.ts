import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildCartEmail,
  computeCartHash,
  isEmailCartRateLimited,
  shouldSkipDuplicateSend,
  checkCartEmailCooldown,
  executeCartEmailSend,
  CartEmailSendDeps,
  CartCooldownStatus,
  EmailCartState,
  EMAIL_CART_COOLDOWN_MS,
  EMAIL_CART_DEDUPE_WINDOW_MS,
} from "../src/lib/emailCart";
import { GroceryItem } from "../src/lib/patterns";

const RECIPIENT = "cart-owner@example.com";
const NOW = new Date("2026-10-29T09:45:00+05:30");

function makeItem(overrides: Partial<GroceryItem>): GroceryItem {
  const now = new Date().toISOString();
  const base: GroceryItem = {
    id: `seed-${Math.random().toString(36).slice(2, 10)}`,
    name: "Seeded",
    category: "Other Items",
    addedBy: "Lira",
    addedAt: now,
    createdAt: now,
    isDone: false,
  };
  return { ...base, ...overrides };
}

describe("buildCartEmail", () => {
  it("returns null when the cart has no pending items", () => {
    assert.equal(buildCartEmail([], RECIPIENT, NOW), null);
    assert.equal(
      buildCartEmail(
        [makeItem({ name: "Milk", isDone: true })],
        RECIPIENT,
        NOW
      ),
      null
    );
    assert.equal(
      buildCartEmail(
        [
          makeItem({
            name: "Milk",
            isOrdered: true,
            orderedAt: NOW.toISOString(),
          }),
        ],
        RECIPIENT,
        NOW
      ),
      null
    );
  });

  it("returns null when the recipient is missing or not an email address", () => {
    const items = [makeItem({ name: "Milk" })];
    assert.equal(buildCartEmail(items, "", NOW), null);
    assert.equal(buildCartEmail(items, "not-an-email", NOW), null);
  });

  it("includes only pending items, grouped under category headers", () => {
    const items = [
      makeItem({ name: "Cucumber" }),
      makeItem({ name: "Milk" }),
      makeItem({ name: "Bread", isDone: true }),
      makeItem({
        name: "Eggs",
        isOrdered: true,
        orderedAt: NOW.toISOString(),
      }),
    ];
    const email = buildCartEmail(items, RECIPIENT, NOW);
    assert.ok(email);
    assert.equal(email.recipient, RECIPIENT);
    assert.match(email.body, /- Cucumber/);
    assert.match(email.body, /- Milk/);
    assert.doesNotMatch(email.body, /- Bread/);
    assert.doesNotMatch(email.body, /- Eggs/);
    assert.match(email.body, /Fruits & Vegetables/);
    assert.match(email.body, /Dairy, Bread & Eggs/);
  });

  it("puts the pending count in the subject with singular/plural", () => {
    const one = buildCartEmail([makeItem({ name: "Milk" })], RECIPIENT, NOW);
    assert.ok(one);
    assert.match(one.subject, /1 item \(/);

    const two = buildCartEmail(
      [makeItem({ name: "Milk" }), makeItem({ name: "Cucumber" })],
      RECIPIENT,
      NOW
    );
    assert.ok(two);
    assert.match(two.subject, /2 items \(/);
  });

  it("dates the subject in IST calendar time", () => {
    // 11:30 PM UTC on Oct 29 is already Oct 30 in Kolkata.
    const lateUtc = new Date("2026-10-29T18:30:00Z");
    const email = buildCartEmail(
      [makeItem({ name: "Milk" })],
      RECIPIENT,
      lateUtc
    );
    assert.ok(email);
    assert.match(email.subject, /\(30 Oct\)$/);
  });

  it("keeps the complete cart details even for very large carts", () => {
    const bigCart = Array.from({ length: 60 }, (_, i) =>
      makeItem({ name: `Bulk Staple Item Number ${i + 1} With A Long Name` })
    );
    const email = buildCartEmail(bigCart, RECIPIENT, NOW);
    assert.ok(email);
    assert.match(email.body, /Bulk Staple Item Number 60/);
    assert.match(email.body, /60 items/);
  });
});

describe("isEmailCartRateLimited", () => {
  it("throttles a send within the minimum interval", () => {
    const t0 = 1_000_000;
    assert.equal(isEmailCartRateLimited(t0, t0 + 1_000), true);
    assert.equal(
      isEmailCartRateLimited(t0, t0 + EMAIL_CART_COOLDOWN_MS - 1),
      true
    );
  });

  it("allows a send after the minimum interval", () => {
    const t0 = 1_000_000;
    assert.equal(
      isEmailCartRateLimited(t0, t0 + EMAIL_CART_COOLDOWN_MS),
      false
    );
    assert.equal(
      isEmailCartRateLimited(t0, t0 + EMAIL_CART_COOLDOWN_MS + 1),
      false
    );
  });

  it("allows the first send (never sent before)", () => {
    assert.equal(isEmailCartRateLimited(0, Date.now()), false);
  });
});

describe("computeCartHash", () => {
  it("is stable regardless of item order", () => {
    const a = makeItem({ id: "a1", name: "Milk" });
    const b = makeItem({ id: "b2", name: "Cucumber" });
    assert.equal(computeCartHash([a, b]), computeCartHash([b, a]));
  });

  it("changes when the pending set changes", () => {
    const a = makeItem({ id: "a1", name: "Milk" });
    const b = makeItem({ id: "b2", name: "Cucumber" });
    const base = computeCartHash([a, b]);
    assert.notEqual(computeCartHash([a]), base);
    assert.notEqual(
      computeCartHash([a, b, makeItem({ id: "c3", name: "Bread" })]),
      base
    );
    // Same id, renamed item is a different cart
    assert.notEqual(
      computeCartHash([a, makeItem({ id: "b2", name: "Cucumbers" })]),
      base
    );
  });

  it("ignores done and ordered items", () => {
    const pending = makeItem({ id: "a1", name: "Milk" });
    const done = makeItem({ id: "d1", name: "Bread", isDone: true });
    const ordered = makeItem({ id: "o1", name: "Eggs", isOrdered: true });
    assert.equal(
      computeCartHash([pending]),
      computeCartHash([pending, done, ordered])
    );
  });
});

describe("shouldSkipDuplicateSend", () => {
  const hash = "abc123";
  const t0 = Date.parse("2026-10-29T09:45:00+05:30");

  it("skips an identical cart sent moments ago", () => {
    const state = { lastSentAt: new Date(t0).toISOString(), lastHash: hash };
    assert.equal(shouldSkipDuplicateSend(state, hash, t0 + 60_000), true);
  });

  it("allows the same cart after the dedupe window", () => {
    const state = { lastSentAt: new Date(t0).toISOString(), lastHash: hash };
    assert.equal(
      shouldSkipDuplicateSend(
        state,
        hash,
        t0 + EMAIL_CART_DEDUPE_WINDOW_MS + 1
      ),
      false
    );
  });

  it("allows a changed cart immediately", () => {
    const state = { lastSentAt: new Date(t0).toISOString(), lastHash: hash };
    assert.equal(
      shouldSkipDuplicateSend(state, "different", t0 + 60_000),
      false
    );
  });

  it("allows when there is no prior send state", () => {
    assert.equal(shouldSkipDuplicateSend(null, hash, t0), false);
    assert.equal(
      shouldSkipDuplicateSend({ lastSentAt: null, lastHash: null }, hash, t0),
      false
    );
  });
});

describe("checkCartEmailCooldown", () => {
  const AUTH = { user: "sender@example.com", pass: "secret-value" };

  function fakeClient(behavior: {
    searchResult?: number[] | false;
    internalDate?: Date;
    failConnect?: boolean;
  }) {
    const calls: string[] = [];
    const factory = () => ({
      connect: async () => {
        calls.push("connect");
        if (behavior.failConnect) throw new Error("imap down");
      },
      getMailboxLock: async () => {
        calls.push("lock");
        return {
          release: () => {
            calls.push("release");
          },
        };
      },
      search: async () => behavior.searchResult ?? false,
      fetchOne: async () => ({ internalDate: behavior.internalDate }),
      logout: async () => {
        calls.push("logout");
      },
    });
    return { factory, calls };
  }

  it("is not limited when no matching sent mail exists", async () => {
    const { factory, calls } = fakeClient({ searchResult: false });
    const status = await checkCartEmailCooldown(
      AUTH,
      RECIPIENT,
      NOW,
      3_600_000,
      factory
    );
    assert.deepEqual(status, { limited: false, retryAt: null });
    assert.deepEqual(calls, ["connect", "lock", "release", "logout"]);
  });

  it("is limited with retryAt when a match was sent inside the window", async () => {
    const sentAt = new Date(NOW.getTime() - 10 * 60_000);
    const { factory } = fakeClient({
      searchResult: [11, 12],
      internalDate: sentAt,
    });
    const status = await checkCartEmailCooldown(
      AUTH,
      RECIPIENT,
      NOW,
      3_600_000,
      factory
    );
    assert.equal(status.limited, true);
    assert.equal(status.retryAt?.getTime(), sentAt.getTime() + 3_600_000);
  });

  it("is not limited when the latest match is older than the window", async () => {
    const sentAt = new Date(NOW.getTime() - 2 * 3_600_000);
    const { factory } = fakeClient({ searchResult: [7], internalDate: sentAt });
    const status = await checkCartEmailCooldown(
      AUTH,
      RECIPIENT,
      NOW,
      3_600_000,
      factory
    );
    assert.deepEqual(status, { limited: false, retryAt: null });
  });

  it("stays conservative when a matched mail has no readable date", async () => {
    const { factory } = fakeClient({
      searchResult: [3],
      internalDate: undefined,
    });
    const status = await checkCartEmailCooldown(
      AUTH,
      RECIPIENT,
      NOW,
      3_600_000,
      factory
    );
    assert.equal(status.limited, true);
    assert.equal(status.retryAt, null);
  });

  it("propagates IMAP failures so callers fail closed", async () => {
    const { factory } = fakeClient({ failConnect: true });
    await assert.rejects(() =>
      checkCartEmailCooldown(AUTH, RECIPIENT, NOW, 3_600_000, factory)
    );
  });
});

describe("executeCartEmailSend", () => {
  function makeDeps(overrides: Partial<CartEmailSendDeps> = {}) {
    let stored: EmailCartState | null = null;
    const events: string[] = [];
    const deps: CartEmailSendDeps = {
      recipient: RECIPIENT,
      now: () => NOW.getTime(),
      checkCooldown: async (): Promise<CartCooldownStatus> => ({
        limited: false,
        retryAt: null,
      }),
      fetchState: async () => stored,
      // Models the atomicity of the real conditional UPDATE: the whole
      // compare-and-set happens without yielding, so a second caller that
      // interleaves between fetchState and claimLock loses.
      claimLock: async (expected, acquired) => {
        const same = JSON.stringify(stored) === JSON.stringify(expected);
        if (!same) return false;
        stored = acquired;
        events.push("claim");
        return true;
      },
      releaseLock: async (_acquired, restore) => {
        stored = restore;
        events.push("release");
      },
      loadItems: async () => [makeItem({ name: "Milk 1L" })],
      send: async () => {
        events.push("send");
      },
      ...overrides,
    };
    return { deps, events, getState: () => stored };
  }

  it("sends once and holds the lock as a grace window on success", async () => {
    const { deps, events, getState } = makeDeps();
    const result = await executeCartEmailSend(deps);
    assert.equal(result.kind, "sent");
    assert.deepEqual(events, ["claim", "send"]);
    assert.notEqual(getState(), null);
  });

  it("lets exactly one of two racing sends through", async () => {
    const { deps, events } = makeDeps();
    const [a, b] = await Promise.all([
      executeCartEmailSend(deps),
      executeCartEmailSend(deps),
    ]);
    const kinds = [a.kind, b.kind].sort();
    assert.deepEqual(kinds, ["in-progress", "sent"]);
    assert.deepEqual(events, ["claim", "send"]);
  });

  it("blocks a later send while a fresh lock exists", async () => {
    const { deps, events } = makeDeps();
    await executeCartEmailSend(deps);
    const second = await executeCartEmailSend(deps);
    assert.equal(second.kind, "in-progress");
    assert.deepEqual(events, ["claim", "send"]);
  });

  it("returns cooldown without claiming when Gmail shows a recent send", async () => {
    const retryAt = new Date(NOW.getTime() + 30 * 60_000);
    const { deps, events } = makeDeps({
      checkCooldown: async () => ({ limited: true, retryAt }),
    });
    const result = await executeCartEmailSend(deps);
    assert.equal(result.kind, "cooldown");
    if (result.kind === "cooldown") {
      assert.equal(result.retryAt, retryAt.toISOString());
    }
    assert.deepEqual(events, []);
  });

  it("fails closed when the cooldown check throws", async () => {
    const { deps, events } = makeDeps({
      checkCooldown: async () => {
        throw new Error("imap down");
      },
    });
    const result = await executeCartEmailSend(deps);
    assert.equal(result.kind, "unavailable");
    assert.deepEqual(events, []);
  });

  it("releases the lock when the send fails", async () => {
    const { deps, events, getState } = makeDeps({
      send: async () => {
        throw new Error("smtp rejected");
      },
    });
    await assert.rejects(() => executeCartEmailSend(deps));
    assert.deepEqual(events, ["claim", "release"]);
    assert.equal(getState(), null);
  });

  it("releases the lock and reports no-pending for an empty cart", async () => {
    const { deps, events } = makeDeps({ loadItems: async () => [] });
    const result = await executeCartEmailSend(deps);
    assert.equal(result.kind, "no-pending");
    assert.deepEqual(events, ["claim", "release"]);
  });
});
