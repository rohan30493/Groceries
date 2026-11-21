import test from "node:test";
import assert from "node:assert/strict";
import { getItemVisual, detectCategory } from "../src/lib/patterns";
import { matchCanonicalName } from "../src/lib/canonicalRules";

test("Item Visual & Image Resolution Integrity", async (t) => {
  await t.test(
    "Milk bread resolves to Bread photo and icon instead of Milk",
    () => {
      const milkBreadVariants = [
        "Milk bread",
        "milk bread",
        "MILK BREAD",
        "The Health Factory Milk Bread",
        "The Baker's Dozen Zero Maida Milk Bread",
        "Zero Maida Milk Bread",
      ];

      for (const variant of milkBreadVariants) {
        const visual = getItemVisual(variant);
        assert.strictEqual(
          visual.icon,
          "🍞",
          `Expected 🍞 icon for "${variant}", got "${visual.icon}"`
        );
        assert.ok(
          visual.imageUrl?.includes("fb912786-b9b4-4c30-a796-682e9dc56ca8"),
          `Expected bread image for "${variant}", got "${visual.imageUrl}"`
        );
      }
    }
  );

  await t.test("Milk resolves to Milk photo and icon", () => {
    const milkVariants = [
      "Milk",
      "milk",
      "Amul Milk",
      "Nandini Goodlife Milk",
      "Toned milk",
      "Cow milk",
    ];

    for (const variant of milkVariants) {
      const visual = getItemVisual(variant);
      assert.strictEqual(
        visual.icon,
        "🥛",
        `Expected 🥛 icon for "${variant}", got "${visual.icon}"`
      );
      assert.ok(
        visual.imageUrl?.includes("d2e9065c-ca58-4e2d-97bb-c7dcda1beac1"),
        `Expected milk image for "${variant}", got "${visual.imageUrl}"`
      );
    }
  });

  await t.test("Bread varieties resolve to Bread photo and icon", () => {
    const breadVariants = [
      "Bread",
      "Keto bread",
      "Brown bread",
      "White bread",
      "Whole wheat bread",
      "Pav",
    ];

    for (const variant of breadVariants) {
      const visual = getItemVisual(variant);
      assert.strictEqual(
        visual.icon,
        "🍞",
        `Expected 🍞 icon for "${variant}", got "${visual.icon}"`
      );
      assert.ok(
        visual.imageUrl?.includes("fb912786-b9b4-4c30-a796-682e9dc56ca8"),
        `Expected bread image for "${variant}", got "${visual.imageUrl}"`
      );
    }
  });

  await t.test("Canonical mapping resolves 'Milk bread' to 'Bread'", () => {
    assert.strictEqual(matchCanonicalName("Milk bread"), "Bread");
    assert.strictEqual(matchCanonicalName("milk bread"), "Bread");
    assert.strictEqual(
      matchCanonicalName("The Health Factory Milk Bread"),
      "Bread"
    );
  });

  await t.test("Category detection for 'Milk bread'", () => {
    assert.strictEqual(detectCategory("Milk bread"), "Dairy, Bread & Eggs");
  });
});
