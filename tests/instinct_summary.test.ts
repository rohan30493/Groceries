import test from "node:test";
import assert from "node:assert/strict";
import { GroceryItem } from "../src/lib/patterns";
import {
  getPendingGroceryItems,
  groupPendingByCategory,
  formatWhatsAppSummary,
  buildInstinctSummaryPayload,
  validateApiToken,
} from "../src/lib/instinctSummary";

test("Instinct Summary & API Integration", async (t) => {
  const sampleItems: GroceryItem[] = [
    {
      id: "item-1",
      name: "Cow Milk 1L",
      category: "Dairy, Bread & Eggs",
      addedBy: "Rohan",
      addedAt: "2026-11-18T10:00:00.000Z",
      isDone: false,
    },
    {
      id: "item-2",
      name: "Organic Eggs 6pk",
      category: "Dairy, Bread & Eggs",
      addedBy: "Lira",
      addedAt: "2026-11-18T11:00:00.000Z",
      isDone: false,
      notes: "farm fresh",
    },
    {
      id: "item-3",
      name: "Tomatoes 500g",
      category: "Fruits & Vegetables",
      addedBy: "Rohan",
      addedAt: "2026-11-18T12:00:00.000Z",
      isDone: false,
    },
    {
      id: "item-4",
      name: "Bread Slices",
      category: "Dairy, Bread & Eggs",
      addedBy: "Rhythm",
      addedAt: "2026-11-18T08:00:00.000Z",
      isDone: true, // Completed - should be excluded
    },
    {
      id: "item-5",
      name: "Apples 1kg",
      category: "Fruits & Vegetables",
      addedBy: "Rohan",
      addedAt: "2026-11-18T09:00:00.000Z",
      isDone: false,
      isOrdered: true, // Already ordered - should be excluded
      orderedAt: "2026-11-18T09:30:00.000Z",
      orderedBy: "Rohan",
    },
  ];

  await t.test(
    "1. getPendingGroceryItems filters out completed and ordered items",
    () => {
      const pending = getPendingGroceryItems(sampleItems);
      assert.strictEqual(pending.length, 3);
      const names = pending.map((it) => it.name);
      assert.deepStrictEqual(names, [
        "Cow Milk 1L",
        "Organic Eggs 6pk",
        "Tomatoes 500g",
      ]);
    }
  );

  await t.test(
    "2. groupPendingByCategory groups items cleanly under category headers",
    () => {
      const pending = getPendingGroceryItems(sampleItems);
      const groups = groupPendingByCategory(pending);

      assert.strictEqual(groups.length, 2);

      // Category ordering: Fruits & Vegetables before Dairy, Bread & Eggs
      assert.strictEqual(groups[0].category, "Fruits & Vegetables");
      assert.strictEqual(groups[0].items.length, 1);
      assert.strictEqual(groups[0].items[0].name, "Tomatoes 500g");

      assert.strictEqual(groups[1].category, "Dairy, Bread & Eggs");
      assert.strictEqual(groups[1].items.length, 2);
      assert.strictEqual(groups[1].items[0].name, "Cow Milk 1L");
      assert.strictEqual(groups[1].items[1].notes, "farm fresh");
    }
  );

  await t.test("3. formatWhatsAppSummary formats empty list cleanly", () => {
    const text = formatWhatsAppSummary([]);
    assert.match(text, /Household Grocery Requirements/i);
    assert.match(text, /empty/i);
  });

  await t.test(
    "4. formatWhatsAppSummary includes full item list with notes and addedBy",
    () => {
      const pending = getPendingGroceryItems(sampleItems);
      const text = formatWhatsAppSummary(pending, {
        now: new Date("2026-11-18T18:00:00.000Z"),
      });

      assert.match(text, /Full List - 3 items/);
      assert.match(text, /Fruits & Vegetables/);
      assert.match(text, /Tomatoes 500g/);
      assert.match(text, /added by Rohan/);
      assert.match(text, /Organic Eggs 6pk/);
      assert.match(text, /farm fresh/);
      assert.match(text, /Total: 3 items needed/);
    }
  );

  await t.test(
    "5. buildInstinctSummaryPayload produces full JSON payload without truncation",
    () => {
      const payload = buildInstinctSummaryPayload(sampleItems);
      assert.strictEqual(payload.ok, true);
      assert.strictEqual(payload.count, 3);
      assert.strictEqual(payload.items.length, 3);
      assert.strictEqual(payload.categories.length, 2);
      assert.strictEqual(typeof payload.summary, "string");
      assert.strictEqual(typeof payload.generatedAt, "string");
    }
  );

  await t.test(
    "6. validateApiToken enforces security token when configured",
    () => {
      // When secret is not configured (open access)
      assert.strictEqual(validateApiToken(null, undefined), true);
      assert.strictEqual(validateApiToken("any", ""), true);

      // When secret is configured
      const secret = "secret-123";
      assert.strictEqual(validateApiToken("secret-123", secret), true);
      assert.strictEqual(validateApiToken("wrong-key", secret), false);
      assert.strictEqual(validateApiToken(null, secret), false);
      assert.strictEqual(validateApiToken("", secret), false);
    }
  );
});
