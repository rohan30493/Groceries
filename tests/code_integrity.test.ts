import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  canPlaceOrder,
  executePlaceOrder,
  initHandoffState,
} from "../src/lib/handoff";
import { normalizeRawOrder } from "../src/lib/purchaseMemory";
import { itemCatalog } from "../src/lib/itemCatalog";

function getAllSourceFiles(dir: string, fileList: string[] = []): string[] {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      if (file !== "node_modules" && file !== ".next") {
        getAllSourceFiles(fullPath, fileList);
      }
    } else if (file.endsWith(".ts") || file.endsWith(".tsx")) {
      fileList.push(fullPath);
    }
  }
  return fileList;
}

test("Repo Code Integrity & Anti-Regression Enforcements", async (t) => {
  const srcDir = path.resolve(__dirname, "../src");
  const sourceFiles = getAllSourceFiles(srcDir);

  await t.test("Rule 1: No unsafe 'as any' casting across src/", () => {
    const violations: Array<{ file: string; line: number; text: string }> = [];

    // Helper regex to detect 'as any'
    const asAnyRegex = /\bas\s+any\b/;

    for (const file of sourceFiles) {
      const content = fs.readFileSync(file, "utf8");
      const lines = content.split("\n");
      lines.forEach((line, index) => {
        if (asAnyRegex.test(line)) {
          violations.push({
            file: path.relative(process.cwd(), file),
            line: index + 1,
            text: line.trim(),
          });
        }
      });
    }

    assert.strictEqual(
      violations.length,
      0,
      `Unsafe 'as any' found in source files! Update domain types instead:\n` +
        violations.map((v) => `  ${v.file}:${v.line} -> ${v.text}`).join("\n")
    );

    // Prove check fails on demonstrative real past mistake:
    const pastMistakeSnippet = "const rawList = unifiedOrdersRaw as any[];";
    assert.match(
      pastMistakeSnippet,
      asAnyRegex,
      "Integrity check must detect real past 'as any' mistake"
    );
  });

  await t.test(
    "Rule 2: No direct DOM mutations in React event handlers in src/app/",
    () => {
      const appDir = path.resolve(srcDir, "app");
      const appFiles = getAllSourceFiles(appDir);
      const domMutationRegex =
        /(style\.display\s*=|parentElement\?\.querySelector)/;

      const violations: Array<{ file: string; line: number; text: string }> =
        [];

      for (const file of appFiles) {
        const content = fs.readFileSync(file, "utf8");
        const lines = content.split("\n");
        lines.forEach((line, index) => {
          if (domMutationRegex.test(line)) {
            violations.push({
              file: path.relative(process.cwd(), file),
              line: index + 1,
              text: line.trim(),
            });
          }
        });
      }

      assert.strictEqual(
        violations.length,
        0,
        `Direct DOM mutation found in React components! Use declarative state instead:\n` +
          violations.map((v) => `  ${v.file}:${v.line} -> ${v.text}`).join("\n")
      );

      // Prove check fails on demonstrative real past mistake:
      const pastMistakeSnippet =
        "e.currentTarget.style.display = 'none'; e.currentTarget.parentElement?.querySelector('.fallback')?.classList.remove('hidden');";
      assert.match(
        pastMistakeSnippet,
        domMutationRegex,
        "Integrity check must detect real past React DOM mutation mistake"
      );
    }
  );

  await t.test(
    "Rule 3: Mobile Viewport Zoom Accessibility (no user-scalable=0)",
    () => {
      const layoutPath = path.resolve(srcDir, "app/layout.tsx");
      const content = fs.readFileSync(layoutPath, "utf8");

      const forbiddenViewportPatterns = [
        /user-scalable\s*=\s*(?:0|no)/i,
        /userScalable\s*:\s*(?:false|0)/i,
        /maximumScale\s*:\s*1\b/i,
      ];

      for (const pattern of forbiddenViewportPatterns) {
        assert.strictEqual(
          pattern.test(content),
          false,
          `Viewport disables zoom (${pattern}) in src/app/layout.tsx! WCAG 1.4.4 requires zoomable viewports.`
        );
      }

      // Prove check fails on demonstrative real past mistake:
      const pastMistakeSnippet = "user-scalable=0, maximum-scale=1.0";
      assert.ok(
        forbiddenViewportPatterns[0].test(pastMistakeSnippet),
        "Integrity check must detect real past user-scalable=0 mistake"
      );
    }
  );

  await t.test(
    "Rule 4: Single Source of Truth for Raw Order Normalization",
    () => {
      // Verify purchaseMemory delegates directly to itemCatalog
      const testRawOrder = {
        order_id: "test-ord-1",
        platform: "Zepto",
        status: "DELIVERED",
        placed_at: "2026-09-01T10:00:00Z",
        items: [{ name: "Amul Taaza Milk 500ml", quantity: 2, price: 27 }],
      };

      const fromPurchaseMemory = normalizeRawOrder(testRawOrder);
      const fromItemCatalog = itemCatalog.normalizeRawOrder(testRawOrder);

      assert.strictEqual(
        fromPurchaseMemory.orderId,
        fromItemCatalog.orderId,
        "Normalization from purchaseMemory must match itemCatalog"
      );
      assert.strictEqual(
        fromPurchaseMemory.items[0].canonicalName,
        fromItemCatalog.items[0].canonicalName,
        "Canonical item resolution must delegate to itemCatalog single source of truth"
      );
      assert.strictEqual(fromPurchaseMemory.items[0].canonicalName, "Milk");
    }
  );

  await t.test(
    "Rule 5: Actor Invariant (Autonomous actors cannot place orders)",
    () => {
      const state = initHandoffState(3);

      // Lira check
      const liraCheck = canPlaceOrder(state, "Lira", 3);
      assert.strictEqual(liraCheck.allowed, false);
      assert.match(liraCheck.reason || "", /Lira cannot place the order/);

      // Rhythm check
      const rhythmCheck = canPlaceOrder(state, "Rhythm", 3);
      assert.strictEqual(rhythmCheck.allowed, false);
      assert.match(rhythmCheck.reason || "", /Rhythm cannot place the order/);

      // Rohan check (before handoff point)
      const rohanBeforeHandoff = canPlaceOrder(state, "Rohan", 3);
      assert.strictEqual(rohanBeforeHandoff.allowed, false);

      // Execution attempt by autonomous actor must fail
      const execResult = executePlaceOrder(state, "Lira", 3);
      assert.strictEqual(execResult.success, false);
      assert.match(execResult.error || "", /Lira cannot place the order/);
    }
  );
});
