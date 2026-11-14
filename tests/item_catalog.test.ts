import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ItemCatalog } from "../src/lib/itemCatalog";

describe("ItemCatalog Deep Module", () => {
  const catalog = new ItemCatalog();

  it("resolves raw brand and variant names to canonical identity", () => {
    assert.equal(
      catalog.resolve("Nandini Goodlife Milk").canonicalName,
      "Milk"
    );
    assert.equal(catalog.resolve("Yelakki Bananas").canonicalName, "Bananas");
    assert.equal(
      catalog.resolve("Fresh Malai Paneer").canonicalName,
      "Fresh Paneer"
    );
    assert.equal(
      catalog.resolve("Aashirvaad Atta 5kg").canonicalName,
      "Atta / Wheat Flour"
    );
    assert.equal(
      catalog.resolve("Vim Dishwash Gel 500ml").canonicalName,
      "Dishwash Liquid"
    );

    // Specific compound items are not shadowed by base ingredient rules
    assert.equal(
      catalog.resolve("Maggi Tomato Ketchup 500g").canonicalName,
      "Ketchup"
    );
    assert.equal(
      catalog.resolve("Figaro Olive Oil 500ml").canonicalName,
      "Olive Oil"
    );
    assert.equal(
      catalog.resolve("Everest Coriander Powder").canonicalName,
      "Dhania / Coriander Powder"
    );
    assert.equal(
      catalog.resolve("Amul Buttermilk 200ml").canonicalName,
      "Buttermilk"
    );
    assert.equal(
      catalog.resolve("Pintola Peanut Butter 1kg").canonicalName,
      "Peanut Butter"
    );
    assert.equal(
      catalog.resolve("Lays Potato Chips 50g").canonicalName,
      "Potato Chips"
    );
    assert.equal(
      catalog.resolve("Dabur Ginger Garlic Paste 100g").canonicalName,
      "Ginger-Garlic Paste"
    );
  });

  it("extracts quantities and cleans raw product names", () => {
    const res1 = catalog.resolve("Fresh Paneer (Pack of 2)");
    assert.equal(res1.canonicalName, "Fresh Paneer");
    assert.equal(res1.quantity, 2);

    const res2 = catalog.resolve("Amul Butter 500g x 3");
    assert.equal(res2.canonicalName, "Butter");
    assert.equal(res2.quantity, 3);
  });

  it("preserves unrecognized product names gracefully as clean names", () => {
    const unknown = catalog.resolve("Artisan Sourdough Loaf");
    assert.equal(unknown.canonicalName, "Artisan Sourdough Loaf");
    assert.equal(unknown.quantity, 1);
  });

  it("extracts pricing for canonical items and falls back gracefully", () => {
    const milkPrice = catalog.getPrice("Milk");
    assert.ok(milkPrice !== null && milkPrice > 0);

    const unknownPrice = catalog.getPrice("Unknown Item XYZ");
    assert.equal(unknownPrice, 60); // staple fallback
  });

  it("calculates cadence intervals and due status from ingested history", () => {
    const cadence = catalog.getCadence("Fresh Paneer");
    assert.equal(cadence.canonicalName, "Fresh Paneer");
    assert.ok(cadence.purchaseCount >= 3);
    assert.ok(
      cadence.typicalReorderDays !== null && cadence.typicalReorderDays > 0
    );
    assert.ok(
      ["DUE_NOW", "APPROACHING_DUE", "NOT_DUE"].includes(
        cadence.replenishmentStatus
      )
    );
  });

  it("returns insufficient history for items with fewer than 3 purchases", () => {
    const cadence = catalog.getCadence("Dragonfruit");
    assert.equal(cadence.replenishmentStatus, "INSUFFICIENT_HISTORY");
    assert.equal(cadence.typicalReorderDays, null);
  });

  it("correctly identifies items in active orders", () => {
    const mockActiveOrders: any = [
      {
        orderId: "ord-1",
        status: "ORDER_PLACED",
        items: [
          {
            name: "Nandini Toned Milk 1L",
            canonicalName: "Milk",
            status: "ORDER_PLACED",
          },
        ],
      },
    ];

    assert.equal(
      catalog.isItemInActiveOrder("Cow Milk", mockActiveOrders),
      true
    );
    assert.equal(
      catalog.isItemInActiveOrder("Fresh Paneer", mockActiveOrders),
      false
    );
  });
});
