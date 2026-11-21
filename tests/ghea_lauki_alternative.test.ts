import test from "node:test";
import assert from "node:assert/strict";
import { parseNaturalLanguageList } from "../src/lib/patterns";
import {
  parseInputItems,
  processAddItems,
  formatWhatsAppSummary,
} from "../src/lib/instinctSummary";
import {
  HouseholdBasket,
  InMemoryBasketStore,
  NoopNotificationAdapter,
} from "../src/lib/householdBasket";
import { buildCartEmail } from "../src/lib/emailCart";
import { GroceryItem } from "../src/lib/patterns";

test("Ghea & Lauki Alternative Handling", async (t) => {
  await t.test(
    "1. parseNaturalLanguageList parses alternative phrases into a single item with alternative note",
    () => {
      const singleAlt = parseNaturalLanguageList(
        "ghea and lauki as a alternative"
      );
      assert.deepStrictEqual(singleAlt, ["Ghea (Lauki as alternative)"]);

      const singleAltAn = parseNaturalLanguageList(
        "ghea and lauki as an alternative"
      );
      assert.deepStrictEqual(singleAltAn, ["Ghea (Lauki as alternative)"]);

      const singleAltOr = parseNaturalLanguageList(
        "ghea or lauki as an alternative"
      );
      assert.deepStrictEqual(singleAltOr, ["Ghea (Lauki as alternative)"]);

      const listWithAlt = parseNaturalLanguageList(
        "Eggs, ghea and lauki as a alternative, Milk"
      );
      assert.deepStrictEqual(listWithAlt, [
        "Eggs",
        "Ghea (Lauki as alternative)",
        "Milk",
      ]);

      const listWithAltComma = parseNaturalLanguageList(
        "Paneer, ghea, lauki as alternative, Curd"
      );
      assert.deepStrictEqual(listWithAltComma, [
        "Paneer",
        "Ghea (Lauki as alternative)",
        "Curd",
      ]);
    }
  );

  await t.test(
    "2. householdBasket.addItems extracts alternative notes and auto-attaches Lauki as alternative for Ghea",
    async () => {
      const store = new InMemoryBasketStore();
      const adapter = new NoopNotificationAdapter();
      const basket = new HouseholdBasket(store, adapter);
      await basket.initialize();

      // Add using alternative phrase
      const addedFromPhrase = await basket.addItems(
        "ghea and lauki as a alternative",
        "Lira"
      );
      assert.strictEqual(addedFromPhrase.length, 1);
      assert.strictEqual(addedFromPhrase[0].name, "Ghea");
      assert.strictEqual(addedFromPhrase[0].notes, "Lauki as alternative");

      // Clear basket for next test
      await basket.removeItem(addedFromPhrase[0].id);

      // Add using just "ghea"
      const addedFromWord = await basket.addItems("ghea", "Lira");
      assert.strictEqual(addedFromWord.length, 1);
      assert.strictEqual(addedFromWord[0].name, "Ghea");
      assert.strictEqual(addedFromWord[0].notes, "Lauki as alternative");

      // Verify deduplication: adding "Ghea" again does not add duplicate
      const duplicateAttempt = await basket.addItems("Ghea", "Lira");
      assert.strictEqual(duplicateAttempt.length, 0);
    }
  );

  await t.test(
    "3. Instinct Summary parses Ghea with Lauki alternative note and formats summary",
    () => {
      const parsedPhrase = parseInputItems("ghea and lauki as a alternative");
      assert.strictEqual(parsedPhrase.length, 1);
      assert.strictEqual(parsedPhrase[0].name, "Ghea");
      assert.strictEqual(parsedPhrase[0].notes, "Lauki as alternative");

      const parsedWord = parseInputItems("ghea");
      assert.strictEqual(parsedWord.length, 1);
      assert.strictEqual(parsedWord[0].name, "Ghea");
      assert.strictEqual(parsedWord[0].notes, "Lauki as alternative");

      // processAddItems auto-attaches note
      const { added } = processAddItems([{ name: "ghea" }], []);
      assert.strictEqual(added.length, 1);
      assert.strictEqual(added[0].name, "Ghea");
      assert.strictEqual(added[0].notes, "Lauki as alternative");

      // WhatsApp summary includes note
      const summaryText = formatWhatsAppSummary(added);
      assert.match(summaryText, /• Ghea \(note: Lauki as alternative/);
    }
  );

  await t.test("4. buildCartEmail renders item note in email body", () => {
    const gheaItem: GroceryItem = {
      id: "test-ghea",
      name: "Ghea",
      category: "Fruits & Vegetables",
      addedBy: "Lira",
      addedAt: new Date().toISOString(),
      isDone: false,
      notes: "Lauki as alternative",
    };

    const email = buildCartEmail([gheaItem], "rohan@example.com");
    assert.ok(email);
    assert.match(email.body, /- Ghea \(Lauki as alternative\)/);
  });
});
