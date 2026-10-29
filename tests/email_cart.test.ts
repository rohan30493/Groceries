import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildCartEmail,
  computeCartHash,
  executeCartEmailSend,
  CartEmailSendDeps,
  EmailCartState,
  EMAIL_CART_MUTEX_TTL_MS,
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

describe("executeCartEmailSend", () => {
  function makeDeps(
    overrides: Partial<CartEmailSendDeps> = {},
    initialState: EmailCartState | null = null
  ) {
    let stored: EmailCartState | null = initialState;
    const events: string[] = [];
    const deps: CartEmailSendDeps = {
      recipient: RECIPIENT,
      now: () => NOW.getTime(),
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

  it("sends once and releases the slot on success", async () => {
    const { deps, events, getState } = makeDeps();
    const result = await executeCartEmailSend(deps);
    assert.equal(result.kind, "sent");
    assert.deepEqual(events, ["claim", "send", "release"]);
    assert.equal(getState(), null);
  });

  it("lets exactly one of two racing sends through", async () => {
    const { deps, events } = makeDeps();
    const [a, b] = await Promise.all([
      executeCartEmailSend(deps),
      executeCartEmailSend(deps),
    ]);
    const kinds = [a.kind, b.kind].sort();
    assert.deepEqual(kinds, ["in-progress", "sent"]);
    assert.deepEqual(events, ["claim", "send", "release"]);
  });

  it("reports in-progress while a send is still executing", async () => {
    let releaseSend: () => void = () => {};
    const { deps } = makeDeps({
      send: async () => {
        await new Promise<void>((resolve) => {
          releaseSend = resolve;
        });
      },
    });
    const first = executeCartEmailSend(deps);
    await new Promise((resolve) => setTimeout(resolve, 10));
    const second = await executeCartEmailSend(deps);
    assert.equal(second.kind, "in-progress");
    releaseSend();
    const result = await first;
    assert.equal(result.kind, "sent");
  });

  it("allows a deliberate resend once the in-flight slot clears", async () => {
    const t0 = NOW.getTime();
    const items = [makeItem({ id: "milk-1", name: "Milk 1L" })];
    const first = makeDeps({ now: () => t0, loadItems: async () => items });
    const sent = await executeCartEmailSend(first.deps);
    assert.equal(sent.kind, "sent");
    const stored = first.getState();

    const later = t0 + EMAIL_CART_MUTEX_TTL_MS + 60_000;
    const second = makeDeps(
      { now: () => later, loadItems: async () => items },
      stored
    );
    const result = await executeCartEmailSend(second.deps);
    assert.equal(result.kind, "sent");
    assert.deepEqual(second.events, ["claim", "send", "release"]);
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
