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
