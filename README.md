# Endfield Planner

Design automation tool for the integrated industry system in _Arknights: Endfield_. See [plan/REQUIREMENT.md](plan/REQUIREMENT.md) for scope, priorities, and technical decisions; [plan/RESEARCH_FINDINGS.md](plan/RESEARCH_FINDINGS.md) for community-sourced domain research.

## Status

Phase 0 + Phase 1 complete (REQUIREMENT.md §8). Includes:

- Real `end.wiki` scraper that produces `data/versions/1.2/` with 69 devices, ~108 recipes, ~115 items.
- JSON Schema validation for every data file.
- `src/core/` domain layer: typed data loader (Node + browser), recipe-graph throughput solver with byproduct + cycle handling.
- React + Tailwind solver page with locale toggle (zh-Hans / en).

`git log --first-parent main` lists every milestone commit.

## Requirements

- Node.js ≥ 20 (LTS recommended; tested on Node 24)
- pnpm ≥ 10 (install via `corepack enable && corepack prepare pnpm@latest --activate` or `npm i -g pnpm`)

## Scripts

```bash
pnpm install              # install dependencies
pnpm dev                  # start vite dev server (http://localhost:5173)
pnpm build                # typecheck + production build to dist/
pnpm preview              # serve the production build
pnpm test                 # run vitest (core + ui projects)
pnpm test:watch           # vitest in watch mode
pnpm lint                 # eslint
pnpm format               # prettier --write .
pnpm format:check         # prettier --check . (used by CI)
pnpm typecheck            # tsc --noEmit (project references)
pnpm validate:data        # JSON-Schema-check every bundled data version
pnpm scrape:endwiki --version 1.2          # regenerate data/versions/1.2/
pnpm scrape:endwiki --version 1.2 --no-cache  # bypass on-disk HTML cache
pnpm verify               # local pre-commit = format:check + lint + typecheck + test + validate:data
```

## Phase 1 demo flow

After `pnpm install`:

1. `pnpm dev` and open http://localhost:5173.
2. Region defaults to the first one in v1.2 (`valley_4`). Leave as-is.
3. Target item defaults to `item-iron-cmpt`. Type ahead works against the full item catalog.
4. Rate defaults to `30` items/min.
5. Click **解算** (or **Solve** after toggling the locale via the top-right button).
6. The result panel shows:
   - Summary tiles: total machines, total power, total footprint.
   - Recipe nodes table: every recipe used, its assigned device, runs/min, machine count.
   - Raw inputs table: items the chain consumes but doesn't produce (e.g. `item-iron-ore`).
   - Byproducts table (when present): items produced beyond the target demand.
   - Amber warning if any cycles were detected.

The 30/min `item-iron-cmpt` case is also pinned in [src/core/solver/solve-golden.test.ts](src/core/solver/solve-golden.test.ts): 1 component-mc-1 + 1 furnance-1, total power 25, footprint 18, 30/min `item-iron-ore` raw demand.

## Layout

```
src/core/                 pure domain logic — no React, no DOM, no Vite imports (enforced by ESLint)
  data-loader/            typed bundle loader (IO-agnostic + Node fs wrapper)
  solver/                 throughput solver (expand + aggregate + pick-recipe)
src/ui/                   React components
  solver-panel/           Phase 1 form + result tables
src/workers/              web workers (later phases)
src/i18n/                 zh-cn + en string tables, t() + I18nProvider
data/
  schema/                 JSON Schemas
  versions/<v>/           devices/recipes/items/regions/crossing_rules JSON
scripts/
  scrape-endwiki.ts       end.wiki scraper CLI
  scraper/                parsers + http cache + rate limiter
  validate-data.ts        ajv-based schema validator CLI
plan/                     REQUIREMENT.md + RESEARCH_FINDINGS.md (specs)
tests/
  fixtures/end-wiki/      pinned HTML fixtures for parser golden tests
  setup-jsdom.ts          @testing-library setup
```

## Known follow-ups (not Phase 0/1 blockers)

- Scraper drops ~141 of 249 recipes whose fingerprint doesn't match any device page; investigate fingerprint drift.
- Item `kind` defaults to `solid` unless slug starts with `item-liquid-`; other fluids slip through. The Phase 2 device editor lets the owner correct edge cases.
- `tech_tree.json` is empty per §10.5; `TECH_001` DRC rule disabled.
- Solver uses a recursive walk with cycle guard; the §6.1 LP-style fixed-point solve is deferred until the recursive solver is shown to be too loose for §10.6 planter cases.
