<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Architecture & Navigation Pointers

- **UI & App Pages**: `src/app/page.tsx`, `src/app/layout.tsx`
- **Domain Modules**:
  - `src/lib/householdBasket.ts`: State machine for basket items (`idle` -> `building` -> `ready_for_order` -> `ordered`). Actor invariant: only human actor places orders; autonomous agents cannot.
  - `src/lib/itemCatalog.ts`: Canonical product normalizer, brand resolution, cadence intervals.
  - `src/lib/orderJournal.ts`: Order history and 30-minute order grouping.
  - `src/lib/orderRecency.ts`: Recency calculations and human-relative date formatting.
  - `src/lib/replenishment.ts`: Cadence-driven auto-replenishment calculations.
  - `src/lib/purchaseMemory.ts`: Delivered purchase tracking.
  - `src/lib/supabase.ts`: Supabase persistence client.
- **Data & Ingestion**: `data/*.json` (historical orders), Python ingestion scripts (`download_*.py`, `parse_*.py`).
- **Checks & Tests**: `npm test` (`tsx --test tests/**/*.test.ts`), `npm run typecheck` (`tsc --noEmit`).

## Enforced Rules Table

| Mistake Class                     | Rule                                                                                                               | Enforcement Level                   | What Enforces It                                                          | Demonstrative Proof                                                       |
| :-------------------------------- | :----------------------------------------------------------------------------------------------------------------- | :---------------------------------- | :------------------------------------------------------------------------ | :------------------------------------------------------------------------ |
| **Loose Typing / Escape Hatches** | Never use `as any` or loose `any` types in source files; type raw sources or use typed records/unions.             | Types + Anti-Regression Test        | `tests/code_integrity.test.ts` (Rule 1) & `npm run typecheck`             | Fails on `unifiedOrdersRaw as any[]` and `(order as any).placedAt`        |
| **DOM Mutation in React**         | Never mutate DOM directly (`style.display =`, `querySelector`) in JSX handlers; use declarative React state.       | Component Architecture + Test Guard | `tests/code_integrity.test.ts` (Rule 2) & `BrowseItemThumbnail` component | Fails on `e.currentTarget.style.display = "none"` in image error handlers |
| **Mobile Accessibility & Zoom**   | Never disable viewport zoom (`user-scalable=0`, `maximum-scale=1` without zoom).                                   | Test Guard (WCAG 1.4.4 AA)          | `tests/code_integrity.test.ts` (Rule 3)                                   | Fails on `user-scalable=0` in `layout.tsx`                                |
| **Catalog Normalization Split**   | Exactly one canonical source of truth for raw order normalization and brand resolution (`ItemCatalog`).            | Architecture + Single Owner         | `src/lib/itemCatalog.ts` single owner; `purchaseMemory.ts` delegates      | Verified in `tests/code_integrity.test.ts` (Rule 4)                       |
| **Actor Invariant**               | Autonomous actors (`Lira`, `Rhythm`) can build/propose baskets, but only human actor (`"Rohan"`) can place orders. | Architecture + Runtime Type Guard   | `src/lib/handoff.ts` & `src/lib/householdBasket.ts`                       | Rejected with error in `tests/code_integrity.test.ts` (Rule 5)            |
